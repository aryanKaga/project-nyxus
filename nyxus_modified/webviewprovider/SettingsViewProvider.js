const vscode = require('vscode');
const path = require('path');
const fs = require('fs');
const { io } = require('socket.io-client');
const { getStoredWorkspaceId, saveStoredWorkspaceId, clearStoredWorkspaceId } = require('./workspace_storage');
const { requestWorkspaceIdAssignment } = require('./assign_workspace_request');

class SettingsViewProvider {
    /**
     * @param {import('vscode').ExtensionContext} context
     * @param {import('vscode').OutputChannel} output
     * @param {(() => import('socket.io-client').Socket | undefined)} [getActiveSocket]
     */
    constructor(context, output, getActiveSocket) {
        this.context = context;
        this.extensionUri = context.extensionUri;
        this.output = output;
        this.getActiveSocket = getActiveSocket;
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
                    this._sendWorkspaceInfo();
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
     * Sends the current workspace details and stored ID to the webview.
     * @private
     */
    _sendWorkspaceInfo() {
        const folder = vscode.workspace.workspaceFolders?.[0];
        const folderUri = folder?.uri;
        const folderName = folder?.name || '';
        const folderPath = folderUri?.fsPath || '';
        const workspaceId = folderUri && this.context ? (getStoredWorkspaceId(this.context, folderUri) || '') : '';
        const config = vscode.workspace.getConfiguration('nyxusReplica');
        const serverUrl = config.get('url') || '';
        const userId = config.get('userId') || '';

        this.sendMessage({
            type: 'workspace_info',
            folderName,
            folderPath,
            workspaceId,
            serverUrl,
            userId
        });
    }

    /**
     * Connects (or reuses active socket) and requests a workspace ID assignment from the server.
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
        const apiKey = config.get('apiKey');
        const userId = config.get('userId');

        if (!apiKey) {
            this.sendMessage({
                type: 'assign_workspace_id_result',
                ok: false,
                error: 'Nyxus API key is not configured in VS Code settings.'
            });
            return;
        }

        let socket = typeof this.getActiveSocket === 'function' ? this.getActiveSocket() : undefined;
        let isTemporary = false;

        if (!socket || !socket.connected) {
            try {
                this.output.appendLine(`Settings: Connecting temporary socket to ${serverUrl}...`);
                socket = await this._createTemporarySocket(serverUrl, apiKey);
                isTemporary = true;
            } catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                this.output.appendLine(`Settings socket connection failed: ${message}`);
                this.sendMessage({
                    type: 'assign_workspace_id_result',
                    ok: false,
                    error: `Could not connect to Nyxus server: ${message}`
                });
                return;
            }
        }

        try {
            this.output.appendLine(`Settings: Requesting workspace ID for folder "${folder.name}"...`);
            const result = await requestWorkspaceIdAssignment(socket, {
                userId,
                apiKey,
                workspaceName: folder.name
            });

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
        } finally {
            if (isTemporary && socket) {
                try {
                    socket.disconnect();
                } catch {
                    // Ignore disconnect error on cleanup
                }
            }
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
     * @param {string} url
     * @param {string} apiKey
     * @returns {Promise<import('socket.io-client').Socket>}
     * @private
     */
    _createTemporarySocket(url, apiKey) {
        return new Promise((resolve, reject) => {
            const socket = io(url, {
                auth: { apiKey },
                timeout: 8000,
                reconnection: false
            });

            const timer = setTimeout(() => {
                socket.disconnect();
                reject(new Error('Connection attempt timed out.'));
            }, 8000);

            socket.once('connect', () => {
                clearTimeout(timer);
                resolve(socket);
            });

            socket.once('connect_error', (error) => {
                clearTimeout(timer);
                socket.disconnect();
                reject(error);
            });
        });
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
            /(src|href)="(\.?\/assets\/[^"]+)"/g,
            (_, attribute, assetPath) => {
                const cleanPath = assetPath.replace(/^\.?\//, '');
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
