const vscode = require('vscode');
const path = require('path');
const fs = require('fs');

const { create_workspace_archive } = require('./workspace_archive');
const { send_workspace_data } = require('./send_nyxus_data');
const { createWebSocket } = require('./create_websocket');
const { createFlowLogger } = require('./flowLogger');
const { getStoredWorkspaceId, saveStoredWorkspaceId, clearStoredWorkspaceId } = require('./workspace_storage');
const { requestWorkspaceIdAssignment } = require('./assign_workspace_request');


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

            const result = await send_workspace_data(this.logFlow.bind(this), {
                archive: this.workspaceArchive,
                fileCount: this.workspaceFileCount,
                workspaceName: this.workspaceName,
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
                const workspaceId = folderUri && this.context ? (getStoredWorkspaceId(this.context, folderUri) || '') : '';
                this.sendMessage({
                    type: 'workspace_info',
                    folderName,
                    workspaceId
                });
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

                const config = vscode.workspace.getConfiguration('nyxusReplica');
                const serverUrl = config.get('url');
                const apiKey = await require('./api_key_storage').getApiKey(this.context);
                const userId = config.get('userId');

                if (!apiKey) {
                    this.sendMessage({
                        type: 'assign_workspace_id_result',
                        ok: false,
                        error: 'Nyxus API key is not configured.'
                    });
                    return;
                }

                let socket = this.socket;
                let isTemporary = false;

                if (!socket || !socket.connected) {
                    try {
                        const { io } = require('socket.io-client');
                        socket = io(serverUrl, {
                            auth: { apiKey },
                            timeout: config.get('connectionTimeout', 15000),
                            reconnectionDelay: config.get('reconnectionDelay', 1000),
                            reconnection: false
                        });
                        isTemporary = true;
                        await new Promise((resolve, reject) => {
                            const timer = setTimeout(() => {
                                socket.disconnect();
                                reject(new Error('Connection timed out.'));
                            }, config.get('connectionTimeout', 15000));
                            socket.once('connect', () => {
                                clearTimeout(timer);
                                resolve();
                            });
                            socket.once('connect_error', (err) => {
                                clearTimeout(timer);
                                socket.disconnect();
                                reject(err);
                            });
                        });
                    } catch (err) {
                        this.sendMessage({
                            type: 'assign_workspace_id_result',
                            ok: false,
                            error: `Could not connect to Nyxus server: ${err.message}`
                        });
                        return;
                    }
                }

                try {
                    const result = await requestWorkspaceIdAssignment(socket, {
                        userId,
                        apiKey,
                        workspaceName: folder.name
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
                } finally {
                    if (isTemporary && socket) {
                        socket.disconnect();
                    }
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
                    error: 'Workspace sync is not ready yet. Wait for the Git transfer to finish and try again.'
                });
                return;
            }

            try {
                const config = vscode.workspace.getConfiguration('nyxusReplica');
                

                this.logFlow('request.chat');
                this.socket.emit('chat', {
                    prompt,
                    apikey: await require('./api_key_storage').getApiKey(this.context),
                    
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
    <h3>Nyxus Replica could not load its chat UI</h3>
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
