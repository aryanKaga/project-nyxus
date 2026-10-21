const vscode = require('vscode');
const path = require('path');
const fs = require('fs');

const { create_workspace_archive } = require('./workspace_archive');
const { send_workspace_data } = require('./send_nyxus_data');
const { createWebSocket } = require('./create_websocket');
const { createFlowLogger } = require('./flowLogger');
const { getStoredWorkspaceId, saveStoredWorkspaceId, clearStoredWorkspaceId, getStoredWorkspaceMeta, saveStoredWorkspaceMeta } = require('./workspace_storage');
const { requestWorkspaceIdAssignment } = require('./assign_workspace_request');
const { getApiKey, setApiKey } = require('./api_key_storage');
const { getUserId, setUserId } = require('./user_id_storage');


class SidebarProvider {
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
        this._webview = undefined;
        /** @type {import('socket.io-client').Socket | undefined} */
        this.socket = undefined;
        this.workspaceReady = false;
        this.workspaceArchive = undefined;
        this.workspaceFileCount = 0;
        this.workspaceCommitCreated = false;
        this.workspaceName = '';
        this.sendingWorkspaceData = false;
        this.workspaceDataSent = false;
        this.webviewReady = false;
        /** @type {{ status: 'waiting' | 'syncing' | 'ready' | 'error', text: string }} */
        this.workspaceStatus = {
            status: 'waiting',
            text: 'Git workspace sync will start when the sidebar opens.'
        };
        /** @type {Promise<void> | undefined} */
        this.workspacePromise = undefined;
        this.writeFlowLog = createFlowLogger(output);
    }

    /**
     * @param {string} event
     * @returns {void}
     */
    logFlow(event) {
        this.writeFlowLog(event);
        this.sendMessage({ type: 'flow_event', event });
    }

    /**
     * @returns {Promise<void>}
     */
    async prepareWorkspace() {
        if (this.workspacePromise) {
            return this.workspacePromise;
        }

        this.workspaceStatus = {
            status: 'syncing',
            text: 'Staging non-ignored changes and creating a Git commit…'
        };
        this.sendMessage({ type: 'workspace_sync_status', ...this.workspaceStatus });
        this.workspacePromise = this.syncWorkspace();
        return this.workspacePromise;
    }

    /**
     * @returns {Promise<void>}
     */
    async syncWorkspace() {
        try {
            const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
            if (!workspaceRoot) {
                throw new Error('Open a workspace folder to sync it.');
            }

            const archiveData = await create_workspace_archive(workspaceRoot);
            this.workspaceArchive = archiveData.archive;
            this.workspaceFileCount = archiveData.fileCount;
            this.workspaceCommitCreated = archiveData.commitCreated;
            this.workspaceName = archiveData.workspaceName;
            this.workspaceReady = true;
            this.workspaceStatus = {
                status: 'syncing',
                text: `Prepared ${archiveData.fileCount} Git files for transfer.`
            };
            this.sendMessage({ type: 'workspace_sync_status', ...this.workspaceStatus });
            this.logFlow('workspace.archive.ready');
            await this.sendWorkspaceData();
        } catch (error) {
            this.logFlow('workspace.archive.failed');
            const detail = error instanceof Error ? error.message : String(error);
            this.workspaceStatus = {
                status: 'error',
                text: `Git workspace sync failed: ${detail}`
            };
            this.sendMessage({ type: 'workspace_sync_status', ...this.workspaceStatus });
            this.sendMessage({
                type: 'initialization_error',
                text: this.workspaceStatus.text
            });
            this.output.appendLine(this.workspaceStatus.text);
        }
    }

    /**
     * @returns {Promise<void>}
     */
    async sendWorkspaceData() {
        if (
            !this.workspaceReady
            || !this.socket?.connected
            || this.sendingWorkspaceData
            || this.workspaceDataSent
        ) {
            return;
        }

        this.sendingWorkspaceData = true;
        try {
            const folderUri = vscode.workspace.workspaceFolders?.[0]?.uri;
            const reuseId = vscode.workspace.getConfiguration('nyxusReplica').get('autoReuseWorkspaceId', true);
            const storedWorkspaceId = reuseId && folderUri && this.context ? getStoredWorkspaceId(this.context, folderUri) : undefined;
            const meta = folderUri && this.context ? getStoredWorkspaceMeta(this.context, folderUri) : { customName: '', description: '' };

            const result = await send_workspace_data(this.logFlow.bind(this), {
                archive: this.workspaceArchive,
                fileCount: this.workspaceFileCount,
                workspaceName: meta.customName || this.workspaceName,
                customName: meta.customName,
                description: meta.description,
                workspace_id: storedWorkspaceId
            }, this.context);
            this.workspaceDataSent = true;
            this.workspaceStatus = {
                status: 'ready',
                text: `Synced ${result.fileCount} files from ${result.workspaceName}.${this.workspaceCommitCreated ? ' A local Git commit was created.' : ' No new Git commit was needed.'}`
            };
            this.sendMessage({ type: 'workspace_sync_status', ...this.workspaceStatus });
        } catch (error) {
            this.logFlow('request.workspace_archive.failed');
            const detail = error instanceof Error ? error.message : String(error);
            this.workspaceStatus = {
                status: 'error',
                text: `Git workspace transfer failed: ${detail}`
            };
            this.sendMessage({ type: 'workspace_sync_status', ...this.workspaceStatus });
            this.sendMessage({
                type: 'initialization_error',
                text: this.workspaceStatus.text
            });
            this.output.appendLine(`Workspace data error type: ${error instanceof Error ? error.name : 'UnknownError'}`);
        } finally {
            this.sendingWorkspaceData = false;
        }
    }

    /**
     * @param {import('vscode').WebviewView} webviewView
     * @returns {void}
     */
    resolveWebviewView(webviewView) {
        this._view = webviewView;
        const webview = webviewView.webview;
        this._webview = webview;
        const distUri = vscode.Uri.joinPath(this.extensionUri, 'webview-ui', 'dist');
        /**
         * every time a webview closes it disconnects with the socket,and re sets all the parameters for the next webview
         */
        webviewView.onDidDispose(() => {
            if (this._view === webviewView) {
                this._view = undefined;
                this._webview = undefined;
                this.socket?.disconnect();
                this.socket = undefined;
                this.webviewReady = false;
            
            }
        });

        webview.options = {
            enableScripts: true,
            localResourceRoots: [distUri]
        };

        try {
            webview.html = this._getHtml(webview, distUri);
            this.logFlow('webview.loaded');
        } catch (error) {
            this.logFlow('webview.load.failed');
            this.output.appendLine(`Webview load error type: ${error instanceof Error ? error.name : 'UnknownError'}`);
            webview.html = this._getErrorHtml(error instanceof Error ? error : new Error(String(error)));
            return;
        }

        try {
            /**
             * when ever a  new socket arrives it disconnects with the server  amd starts fresh
             */
            this.socket?.disconnect();
            this.workspaceDataSent = false;
            this.workspacePromise = undefined;
            this.workspaceReady = false;
            this.workspaceArchive = undefined;
            void this.reconnect();
            /**
             * sends nyxus data every time the user connects to the server, bad point because if the 
             * server already has the user data it will still send it
             */
            const config = vscode.workspace.getConfiguration('nyxusReplica');
            if (config.get('enableWorkspaceSync', true) && config.get('workspaceSyncBehavior', 'onSidebarOpen') === 'onSidebarOpen') {
                void this.prepareWorkspace();
            }
        } catch (error) {
            this.logFlow('socket.initialization.failed');
            this.output.appendLine(`Connection initialization error type: ${error instanceof Error ? error.name : 'UnknownError'}`);
            this.sendMessage({
                type: 'connection_status',
                status: 'error',
                text: 'Could not initialize the Nyxus connection. Check the extension output.'
            });
        }

        webview.onDidReceiveMessage(async (message) => {
            if (!message || typeof message !== 'object') {
                this.logFlow('webview.message.invalid');
                return;
            }

            if (message.type === 'open_settings') {
                this.sendMessage({ type: 'set_view', view: 'settings' });
                return;
            }

            if (message.type === 'get_workspace_info') {
                const folder = vscode.workspace.workspaceFolders?.[0];
                const folderUri = folder?.uri;
                const folderName = folder?.name || '';
                const folderPath = folderUri?.fsPath || '';
                const workspaceId = folderUri && this.context ? (getStoredWorkspaceId(this.context, folderUri) || '') : '';
                const meta = folderUri && this.context ? getStoredWorkspaceMeta(this.context, folderUri) : { customName: '', description: '' };
                const apiKey = await getApiKey(this.context);
                const userId = await getUserId(this.context);
                this.sendMessage({
                    type: 'workspace_info',
                    folderName,
                    folderPath,
                    workspaceId,
                    customName: meta.customName,
                    description: meta.description,
                    apiKey,
                    hasApiKey: Boolean(apiKey),
                    userId,
                    user_id: userId
                });
                return;
            }

            if (message.type === 'save_user_id') {
                const userId = typeof message.userId === 'string' ? message.userId.trim() : '123';
                try {
                    await setUserId(this.context, userId);
                    this.sendMessage({ type: 'save_user_id_result', ok: true, userId });
                } catch (error) {
                    this.sendMessage({ type: 'save_user_id_result', ok: false, error: error instanceof Error ? error.message : String(error) });
                }
                return;
            }

            if (message.type === 'save_api_key') {
                const apiKey = typeof message.apiKey === 'string' ? message.apiKey.trim() : '';
                try {
                    await setApiKey(this.context, apiKey);
                    this.sendMessage({ type: 'save_api_key_result', ok: true, apiKey, message: 'API key saved successfully.' });
                    await this.reconnect?.();
                } catch (error) {
                    this.sendMessage({ type: 'save_api_key_result', ok: false, error: error instanceof Error ? error.message : String(error) });
                }
                return;
            }

            if (message.type === 'save_workspace_metadata') {
                const folder = vscode.workspace.workspaceFolders?.[0];
                if (!folder) {
                    this.sendMessage({ type: 'save_workspace_metadata_result', ok: false, error: 'No workspace folder open.' });
                    return;
                }
                const customName = typeof message.customName === 'string' ? message.customName.trim() : '';
                const description = typeof message.description === 'string' ? message.description.trim() : '';
                try {
                    await saveStoredWorkspaceMeta(this.context, folder.uri, { customName, description });
                    this.sendMessage({
                        type: 'save_workspace_metadata_result',
                        ok: true,
                        customName,
                        description,
                        message: 'Workspace details saved.'
                    });
                } catch (error) {
                    this.sendMessage({ type: 'save_workspace_metadata_result', ok: false, error: error instanceof Error ? error.message : String(error) });
                }
                return;
            }

            if (message.type === 'stage_workspace') {
                const folder = vscode.workspace.workspaceFolders?.[0];
                if (!folder) {
                    this.sendMessage({
                        type: 'workspace_git_action_result',
                        ok: false,
                        action: 'stage_workspace',
                        error: 'Open a workspace folder first.'
                    });
                    return;
                }

                const workspaceRoot = folder.uri.fsPath;
                const workspaceId = (folder && this.context ? getStoredWorkspaceId(this.context, folder.uri) : '') || message.workspaceId || '';
                if (!workspaceId) {
                    this.sendMessage({
                        type: 'workspace_git_action_result',
                        ok: false,
                        action: 'stage_workspace',
                        error: 'No Workspace ID assigned. Please request a Workspace ID before staging.'
                    });
                    return;
                }

                try {
                    const { create_workspace_archive } = require('./workspace_archive');
                    const archiveResult = await create_workspace_archive(workspaceRoot);
                    const meta = folder && this.context ? getStoredWorkspaceMeta(this.context, folder.uri) : { customName: '', description: '' };

                    const result = await send_workspace_data(
                        this.logFlow.bind(this),
                        {
                            archive: archiveResult.archive,
                            fileCount: archiveResult.fileCount,
                            workspaceName: meta.customName || archiveResult.workspaceName,
                            customName: meta.customName,
                            description: meta.description,
                       
                        },
                        this.context
                    );

                    this.workspaceDataSent = true;
                    this.workspaceStatus = {
                        status: 'ready',
                        text: `Synced ${result.fileCount} files from ${result.workspaceName}.${archiveResult.commitCreated ? ' A local Git commit was created.' : ' No new Git commit was needed.'}`
                    };
                    this.sendMessage({ type: 'workspace_sync_status', ...this.workspaceStatus });

                    this.sendMessage({
                        type: 'workspace_git_action_result',
                        ok: true,
                        action: 'stage_workspace',
                        message: `Workspace staged and uploaded (${result.fileCount} files).`
                    });
                    vscode.window.showInformationMessage(`Nyxus: Workspace staged and synced (${result.fileCount} files).`);
                } catch (error) {
                    const detail = error instanceof Error ? error.message : String(error);
                    this.output.appendLine(`Stage workspace failed: ${detail}`);
                    this.sendMessage({
                        type: 'workspace_git_action_result',
                        ok: false,
                        action: 'stage_workspace',
                        error: detail
                    });
                }
                return;
            }

            if (message.type === 'unstage_workspace') {
                const folder = vscode.workspace.workspaceFolders?.[0];
                if (!folder) {
                    this.sendMessage({
                        type: 'workspace_git_action_result',
                        ok: false,
                        action: 'unstage_workspace',
                        error: 'Open a workspace folder first.'
                    });
                    return;
                }

                const workspaceId = (folder && this.context ? getStoredWorkspaceId(this.context, folder.uri) : '') || message.workspaceId || '';
                const config = vscode.workspace.getConfiguration('nyxusReplica');
                const serverUrl = config.get('url') || 'http://localhost:80';
                const userId = await getUserId(this.context);
                const apiKey = await getApiKey(this.context);

                try {
                    if (workspaceId) {
                        const { deleteWorkspaceHttp } = require('./assign_workspace_request');
                        await deleteWorkspaceHttp(serverUrl, {
                            userId,
                            apiKey,
                            workspaceId
                        });
                    }

                    await clearStoredWorkspaceId(this.context, folder.uri);

                    this.sendMessage({
                        type: 'workspace_git_action_result',
                        ok: true,
                        action: 'unstage_workspace',
                        message: 'Workspace unstaged and deleted from server.'
                    });

                    // Send updated workspace info to update UI
                    const meta = folder && this.context ? getStoredWorkspaceMeta(this.context, folder.uri) : { customName: '', description: '' };
                    this.sendMessage({
                        type: 'workspace_info',
                        folderName: folder.name || '',
                        folderPath: folder.uri.fsPath || '',
                        workspaceId: '',
                        customName: meta.customName,
                        description: meta.description,
                        apiKey,
                        hasApiKey: Boolean(apiKey),
                        userId,
                        user_id: userId
                    });
                } catch (error) {
                    this.sendMessage({
                        type: 'workspace_git_action_result',
                        ok: false,
                        action: 'unstage_workspace',
                        error: error instanceof Error ? error.message : String(error)
                    });
                }
                return;
            }

            if (message.type === 'request_workspace_id') {
                const folder = vscode.workspace.workspaceFolders?.[0];
                if (!folder) {
                    this.sendMessage({
                        type: 'assign_workspace_id_result',
                        ok: false,
                        error: 'No workspace folder is open in VS Code. Open a project folder first.'
                    });
                    return;
                }

                if (getStoredWorkspaceId(this.context, folder.uri)) {
                    this.sendMessage({ type: 'assign_workspace_id_result', ok: false, error: 'This workspace already has a permanent ID.' });
                    return;
                }

                const config = vscode.workspace.getConfiguration('nyxusReplica');
                const serverUrl = config.get('url');
                const apiKey = await getApiKey(this.context);
                const userId = await getUserId(this.context);

                if (!apiKey) {
                    this.sendMessage({
                        type: 'assign_workspace_id_result',
                        ok: false,
                        error: 'Nyxus API key is not configured.'
                    });
                    return;
                }

                try {
                    const meta = folder && this.context ? getStoredWorkspaceMeta(this.context, folder.uri) : { customName: '', description: '' };
                    const result = await requestWorkspaceIdAssignment(serverUrl, {
                        userId,
                        apiKey,
                        serverUrl,
                        workspaceName: meta.customName || folder.name,
                        customName: meta.customName,
                        description: meta.description
                    }, config.get('requestTimeout', 15000));

                    if (result && result.ok && result.workspace_id) {
                        await saveStoredWorkspaceId(this.context, folder.uri, result.workspace_id);
                        this.sendMessage({
                            type: 'assign_workspace_id_result',
                            ok: true,
                            workspaceId: result.workspace_id
                        });
                        vscode.window.showInformationMessage(`Nyxus: Workspace ID assigned (${result.workspace_id})`);
                    } else {
                        throw new Error('Server returned an invalid response.');
                    }
                } catch (error) {
                    this.sendMessage({
                        type: 'assign_workspace_id_result',
                        ok: false,
                        error: error instanceof Error ? error.message : String(error)
                    });
                }
                return;
            }

            if (message.type === 'clear_workspace_id') {
                const folder = vscode.workspace.workspaceFolders?.[0];
                if (folder && this.context) {
                    await clearStoredWorkspaceId(this.context, folder.uri);
                }
                this.sendMessage({
                    type: 'clear_workspace_id_result',
                    ok: true
                });
                vscode.window.showInformationMessage('Nyxus: Workspace ID cleared for this folder.');
                return;
            }

            if (message.type === 'webview_ready') {
                this.webviewReady = true;
                this.sendMessage({
                    type: 'connection_status',
                    status: this.socket?.connected ? 'connected' : 'disconnected',
                    text: this.socket?.connected
                        ? ''
                        : 'Cannot reach Nyxus. Check the server URL and connection.'
                });
                this.sendMessage({ type: 'workspace_sync_status', ...this.workspaceStatus });
                return;
            }

            if (message.type !== 'chat') {
                this.logFlow('webview.message.unknown');
                return;
            }

            const prompt = typeof message.prompt === 'string' ? message.prompt.trim() : '';
            if (!prompt) {
                this.sendMessage({ type: 'assistant_error', error: 'Enter a message before sending.' });
                return;
            }

            if (!this.socket?.connected) {
                this.logFlow('request.chat.blocked.disconnected');
                this.sendMessage({
                    type: 'assistant_error',
                    error: 'Nyxus is not connected. Check the server URL and try again.'
                });
                return;
            }

            if (!this.workspaceDataSent) {
                this.logFlow('request.chat.blocked.workspace_not_ready');
                this.sendMessage({
                    type: 'assistant_error',
                    error: this.workspaceStatus.status === 'error'
                        ? this.workspaceStatus.text
                        : 'Workspace sync is still in progress. Wait for the Git transfer to finish and try again.'
                });
                return;
            }

            try {
                const apiKey = await require('./api_key_storage').getApiKey(this.context);
                const userId = await getUserId(this.context);
                const folderUri = vscode.workspace.workspaceFolders?.[0]?.uri;
                const reuseId = vscode.workspace.getConfiguration('nyxusReplica').get('autoReuseWorkspaceId', true);
                const storedWorkspaceId = reuseId && folderUri && this.context ? getStoredWorkspaceId(this.context, folderUri) : undefined;
           
                this.logFlow('request.chat');
                this.socket.emit('chat', {
                    prompt,
                    apikey: apiKey,
                    apiKey: apiKey,
                    user_id: userId,
                    userId: userId,
                    workspace_id:storedWorkspaceId
                });
            } catch (error) {
                this.logFlow('request.chat.failed');
                this.output.appendLine(`Chat request error type: ${error instanceof Error ? error.name : 'UnknownError'}`);
                this.sendMessage({
                    type: 'assistant_error',
                    error: 'Nyxus could not send that message. Check the extension output and try again.'
                });
            }
        });
    }

    async reconnect() {
        if (!this._webview) return;
        const webview = this._webview;
        const oldSocket = this.socket;
        try {
            const socket = await createWebSocket(webview, this.logFlow.bind(this), this.context);
            if (this._webview !== webview) { socket.disconnect(); return; }
            this.socket = socket;
            socket.on('connect', () => {
                this.workspaceDataSent = false;
                void this.sendWorkspaceData();
            });
            oldSocket?.disconnect();
        } catch (error) {
            this.logFlow('socket.initialization.failed');
            this.output.appendLine(`Connection initialization error type: ${error instanceof Error ? error.name : 'UnknownError'}`);
        }
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

        return fs.readFileSync(indexPath, 'utf8').replace(
            /(src|href)="(\.?\/assets\/[^"]+)"/g,
            (_, attribute, assetPath) => {
                const cleanPath = assetPath.replace(/^\.?\//, '');
                const fileUri = vscode.Uri.file(path.join(distPath, cleanPath));
                return `${attribute}="${webview.asWebviewUri(fileUri)}"`;
            }
        );
    }

    /**
     * @param {Error} error
     * @returns {string}
     */
    _getErrorHtml(error) {
        const message = error.message
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
        return `<!DOCTYPE html>
<html>
<body style="font-family: sans-serif; padding: 12px; color: var(--vscode-foreground); background: var(--vscode-editor-background);">
    <h3>Nyxus Modified could not load its chat UI</h3>
    <pre style="white-space: pre-wrap; font-size: 12px;">${message}</pre>
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
            Promise.resolve(this._view.webview.postMessage(message)).then((sent) => {
                if (!sent) {
                    this.writeFlowLog('webview.message.delivery_failed');
                }
            }).catch(() => {
                this.writeFlowLog('webview.message.delivery_failed');
            });
        } catch {
            this.writeFlowLog('webview.message.delivery_failed');
        }
    }

    /**
     * @returns {void}
     */
    dispose() {
            this.socket?.disconnect();
        this.socket = undefined;
    }
}

module.exports = { SidebarProvider };
