const vscode = require('vscode');
const path = require('path');
const fs = require('fs');
const { getStoredWorkspaceId, saveStoredWorkspaceId, clearStoredWorkspaceId } = require('./workspace_storage');
const { requestWorkspaceIdAssignment } = require('./assign_workspace_request');

class SettingsViewProvider {
    /**
     * @param {import('vscode').ExtensionContext} context
     * @param {import('vscode').OutputChannel} output
     */
    constructor(context, output) {
        this.context = context;
        this.extensionUri = context.extensionUri;
        this.output = output;
        /** @type {import('vscode').WebviewView | undefined} */
        this._view = undefined;
    }

    /**
     * @param {import('vscode').WebviewView} webviewView
     * @returns {void}
     */
    resolveWebviewView(webviewView) {
        this._view = webviewView;
        const webview = webviewView.webview;
        const distUri = vscode.Uri.joinPath(this.extensionUri, 'webview-ui', 'dist');

        webviewView.onDidDispose(() => {
            if (this._view === webviewView) {
                this._view = undefined;
            }
        });

        webview.options = {
            enableScripts: true,
            localResourceRoots: [distUri]
        };

        try {
            webview.html = this._getHtml(webview, distUri);
        } catch (error) {
            const detail = error instanceof Error ? error.message : String(error);
            this.output.appendLine(`Settings webview load failed: ${detail}`);
            webview.html = this._getErrorHtml(detail);
            return;
        }

        webview.onDidReceiveMessage(async (message) => {
            if (!message || typeof message !== 'object') {
                return;
            }

            switch (message.type) {
                case 'get_workspace_info': {
                    await this._sendWorkspaceInfo();
                    break;
                }
                case 'request_workspace_id': {
                    await this._handleRequestWorkspaceId();
                    break;
                }
                case 'clear_workspace_id': {
                    await this._handleClearWorkspaceId();
                    break;
                }
                default:
                    break;
            }
        });
    }

    /**
     * Sends the current workspace details, stored ID, userId, and apiKey to the webview.
     * @private
     */
    async _sendWorkspaceInfo() {
        const folder = vscode.workspace.workspaceFolders?.[0];
        const folderUri = folder?.uri;
        const folderName = folder?.name || '';
        const folderPath = folderUri?.fsPath || '';
        const workspaceId = folderUri && this.context ? (getStoredWorkspaceId(this.context, folderUri) || '') : '';
        const config = vscode.workspace.getConfiguration('nyxusReplica');
        const serverUrl = config.get('url') || '';
        const userId = await require('./user_id_storage').getUserId(this.context);
        const apiKey = await require('./api_key_storage').getApiKey(this.context);

        this.sendMessage({
            type: 'workspace_info',
            folderName,
            folderPath,
            workspaceId,
            serverUrl,
            userId,
            user_id: userId,
            apiKey,
            hasApiKey: Boolean(apiKey)
        });
    }

    /**
     * Sends an HTTP POST to /ID/request_id to obtain a workspace ID.
     * @private
     */
    async _handleRequestWorkspaceId() {
        const folder = vscode.workspace.workspaceFolders?.[0];
        if (!folder) {
            this.sendMessage({
                type: 'assign_workspace_id_result',
                ok: false,
                error: 'No workspace folder is open in VS Code. Open a project folder first.'
            });
            return;
        }

        const config = vscode.workspace.getConfiguration('nyxusReplica');
        const serverUrl = config.get('url');
        const apiKey = await require('./api_key_storage').getApiKey(this.context);
        const userId = await require('./user_id_storage').getUserId(this.context);

        if (!apiKey) {
            this.sendMessage({
                type: 'assign_workspace_id_result',
                ok: false,
                error: 'Nyxus API key is not configured in VS Code settings.'
            });
            return;
        }

        try {
            this.output.appendLine(`Settings: Requesting workspace ID for folder "${folder.name}" via HTTP...`);
            const result = await requestWorkspaceIdAssignment(serverUrl, {
                userId,
                apiKey,
                serverUrl,
                workspaceName: folder.name
            }, config.get('requestTimeout', 15000));

            if (result && result.ok && result.workspace_id) {
                await saveStoredWorkspaceId(this.context, folder.uri, result.workspace_id);
                this.output.appendLine(`Settings: Successfully stored workspace ID ${result.workspace_id} for ${folder.uri.toString()}`);
                this.sendMessage({
                    type: 'assign_workspace_id_result',
                    ok: true,
                    workspaceId: result.workspace_id
                });
                vscode.window.showInformationMessage(`Nyxus: Workspace ID assigned: ${result.workspace_id}`);
            } else {
                throw new Error('Server returned an unexpected response format.');
            }
        } catch (error) {
            const detail = error instanceof Error ? error.message : String(error);
            this.output.appendLine(`Settings assignment failed: ${detail}`);
            this.sendMessage({
                type: 'assign_workspace_id_result',
                ok: false,
                error: detail
            });
        }
    }

    /**
     * Clears the stored workspace ID for the active folder.
     * @private
     */
    async _handleClearWorkspaceId() {
        const folder = vscode.workspace.workspaceFolders?.[0];
        if (folder) {
            await clearStoredWorkspaceId(this.context, folder.uri);
            this.output.appendLine(`Settings: Cleared workspace ID for ${folder.uri.toString()}`);
        }
        this.sendMessage({
            type: 'clear_workspace_id_result',
            ok: true
        });
        vscode.window.showInformationMessage('Nyxus: Workspace ID cleared for this folder.');
    }

    /**
     * @param {import('vscode').Webview} webview
     * @param {import('vscode').Uri} distUri
     * @returns {string}
     */
    _getHtml(webview, distUri) {
        const distPath = distUri.fsPath;
        const indexPath = path.join(distPath, 'index.html');

        if (!fs.existsSync(indexPath)) {
            throw new Error(`Webview build not found at ${indexPath}. Run npm run build in the extension folder.`);
        }

        let html = fs.readFileSync(indexPath, 'utf8').replace(
            /(src|href)="(\\.?\\/assets\\/[^"]+)"/g,
            (_, attribute, assetPath) => {
                const cleanPath = assetPath.replace(/^\\.?\\//, '');
                const fileUri = vscode.Uri.file(path.join(distPath, cleanPath));
                return `${attribute}="${webview.asWebviewUri(fileUri)}"`;
            }
        );

        const injectedScript = '<script>window.__NYXUS_VIEW__ = "settings";</script>';
        if (html.includes('<head>')) {
            html = html.replace('<head>', `<head>${injectedScript}`);
        } else {
            html = injectedScript + html;
        }

        return html;
    }

    /**
     * @param {string} message
     * @returns {string}
     */
    _getErrorHtml(message) {
        const escaped = message
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
        return `<!DOCTYPE html>
<html>
<body style="font-family: sans-serif; padding: 12px; color: var(--vscode-foreground); background: var(--vscode-editor-background);">
    <h3>Nyxus Settings could not load</h3>
    <pre style="white-space: pre-wrap; font-size: 12px;">${escaped}</pre>
    <p>Run <code>npm run build</code> in the extension folder, then reload the window.</p>
</body>
</html>`;
    }

    /**
     * @param {Record<string, unknown>} message
     * @returns {void}
     */
    sendMessage(message) {
        if (!this._view) {
            return;
        }
        try {
            Promise.resolve(this._view.webview.postMessage(message)).catch(() => {});
        } catch {
            // Ignore failure if webview is closed
        }
    }

    dispose() {
        this._view = undefined;
    }
}

module.exports = { SettingsViewProvider };
