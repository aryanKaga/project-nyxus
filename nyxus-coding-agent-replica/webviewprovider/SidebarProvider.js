const vscode = require('vscode');
const path = require('path');
const fs = require('fs');

const { create_code_graph } = require('../codegraph/parse_temp.js');
const { build_directory } = require('../codegraph/dir_structure.js');
const { createWebSocket } = require('./create_websocket');
const { createFlowLogger } = require('./flowLogger');
const { createWorkspaceArchive } = require('./workspace_archive');
const {
    saveArchitectureDiagram,
    openArchitectureDiagramPreview
} = require('./architecture_diagram_file');
const {
    openAnswerMarkdownPreview,
    saveAnswerMarkdown
} = require('./answer_markdown_file');


class SidebarProvider {
    /**
     * @param {import('vscode').ExtensionContext} context
     * @param {import('vscode').OutputChannel} output
     */
    constructor(context, output) {
        this.extensionUri = context.extensionUri;
        this.output = output;
        /** @type {import('vscode').WebviewView | undefined} */
        this._view = undefined;
        /** @type {import('socket.io-client').Socket | undefined} */
        this.socket = undefined;
        this.workspaceReady = false;
        this.sendingWorkspaceData = false;
        this.workspaceDataSent = false;
        this.webviewReady = false;
        /** @type {{ status: 'waiting' | 'indexing' | 'ready' | 'error', text: string }} */
        this.indexStatus = {
            status: 'waiting',
            text: 'Workspace indexing will start when the sidebar opens.'
        };
        /** @type {Promise<void> | undefined} */
        this.indexPromise = undefined;
        this.writeFlowLog = createFlowLogger(output);
        this.context = context;
        this.workspaceId = undefined;
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
        if (this.indexPromise) {
            return this.indexPromise;
        }

        this.indexStatus = {
            status: 'indexing',
            text: 'Indexing workspace files…'
        };
        this.sendMessage({ type: 'workspace_index_status', ...this.indexStatus });
        this.indexPromise = this.indexWorkspace();
        return this.indexPromise;
    }

    /**
     * @returns {Promise<void>}
     */
    async indexWorkspace() {
        try {
            if (!vscode.workspace.workspaceFolders?.length) {
                throw new Error('Open a workspace folder to index it.');
            }

            await create_code_graph();
            this.indexStatus = {
                status: 'indexing',
                text: 'Building workspace directory tree…'
            };
            this.sendMessage({ type: 'workspace_index_status', ...this.indexStatus });
            await build_directory();
            this.workspaceReady = true;
            this.indexStatus = {
                status: 'ready',
                text: 'Workspace indexing complete.'
            };
            this.logFlow('workspace.index.ready');
            await this.sendWorkspaceData();
        } catch (error) {
            this.logFlow('workspace.index.failed');
            const detail = error instanceof Error ? error.message : String(error);
            this.indexStatus = {
                status: 'error',
                text: `Workspace indexing failed: ${detail}`
            };
            this.sendMessage({ type: 'workspace_index_status', ...this.indexStatus });
            this.sendMessage({
                type: 'initialization_error',
                text: this.indexStatus.text
            });
            this.output.appendLine(this.indexStatus.text);
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
            const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
            if (!workspaceRoot) {
                throw new Error('Open a workspace folder before uploading it.');
            }
            const files = await vscode.workspace.findFiles(
                '**/*',
                '**/{.git,node_modules,.venv,venv,__pycache__,dist,build,target}/**'
            );
            const archive = await createWorkspaceArchive(workspaceRoot, files);
            const config = vscode.workspace.getConfiguration('nyxusReplica');
            const response = await new Promise((resolve, reject) => {
                this.socket.emit('workspace_archive', {
                    apikey: config.get('apiKey'),
                    archive
                }, (result) => {
                    if (!result?.ok) {
                        reject(new Error(result?.error || 'Nyxus could not persist this workspace.'));
                        return;
                    }
                    resolve(result);
                });
            });
            this.workspaceId = response.workspace_id;
            await this.context.globalState.update(
                this.workspaceStateKey(workspaceRoot),
                this.workspaceId
            );
            this.workspaceDataSent = true;
            this.sendMessage({
                type: 'workspace_id',
                workspaceId: this.workspaceId
            });
            this.logFlow('workspace.archive.persisted');
        } catch (error) {
            this.logFlow('request.workspace_data.failed');
            this.sendMessage({
                type: 'initialization_error',
                text: error instanceof Error
                    ? `Workspace upload failed: ${error.message}`
                    : 'Workspace upload failed. Check the server and workspace settings.'
            });
            this.output.appendLine(`Workspace data error type: ${error instanceof Error ? error.name : 'UnknownError'}`);
        } finally {
            this.sendingWorkspaceData = false;
        }
    }

    workspaceStateKey(workspaceRoot) {
        return `nyxusReplica.workspaceId:${workspaceRoot}`;
    }

    async connectWorkspace() {
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!workspaceRoot || !this.socket?.connected) {
            return;
        }
        const savedWorkspaceId = this.context.globalState.get(
            this.workspaceStateKey(workspaceRoot)
        );
        if (!savedWorkspaceId) {
            await this.prepareWorkspace();
            return;
        }

        const config = vscode.workspace.getConfiguration('nyxusReplica');
        this.socket.emit('workspace_resume', {
            apikey: config.get('apiKey'),
            workspace_id: savedWorkspaceId
        }, async (response) => {
            if (response?.ok) {
                this.workspaceId = response.workspace_id;
                this.workspaceDataSent = true;
                this.indexStatus = {
                    status: 'ready',
                    text: `Restored saved workspace ${this.workspaceId}.`
                };
                this.sendMessage({
                    type: 'workspace_index_status',
                    ...this.indexStatus
                });
                this.sendMessage({
                    type: 'workspace_id',
                    workspaceId: this.workspaceId
                });
                if (Array.isArray(response.history) && response.history.length > 0) {
                    await this.context.workspaceState.update('nyxus.chatMessages', response.history);
                    this.sendMessage({
                        type: 'conversation_history',
                        messages: response.history
                    });
                }
                this.logFlow('workspace.restore.completed');
                return;
            }

            if (response?.workspace_required) {
                await this.context.globalState.update(
                    this.workspaceStateKey(workspaceRoot),
                    undefined
                );
                this.workspaceId = undefined;
                void vscode.window.showWarningMessage(
                    'The saved workspace id is not available to this Nyxus account.',
                    'Upload current workspace'
                ).then((choice) => {
                    if (choice === 'Upload current workspace') {
                        void this.prepareWorkspace();
                    } else {
                        this.sendMessage({
                            type: 'initialization_error',
                            text: 'Upload the current workspace to continue.'
                        });
                    }
                });
                return;
            }
            this.sendMessage({
                type: 'initialization_error',
                text: response?.error || 'Could not restore the saved workspace.'
            });
        });
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
                this.socket?.disconnect();
                this.socket = undefined;
                this.webviewReady = false;
                this.workspaceDataSent = false;
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
            this.socket?.disconnect();
            this.workspaceDataSent = false;
            this.socket = createWebSocket(
                webview,
                this.logFlow.bind(this),
                (diagram) => this.saveAndRenderArchitectureDiagram(diagram),
                (answer) => this.saveAndRenderReadmeAnswer(answer)
            );
            this.socket.on('connect', () => {
                this.workspaceDataSent = false;
                void this.connectWorkspace();
            });
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

            if (message.type === 'webview_ready') {
                this.webviewReady = true;
                const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? null;
                const savedMessages = this.context.workspaceState.get('nyxus.chatMessages') || [];
                this.sendMessage({
                    type: 'conversation_scope',
                    workspaceRoot
                });
                if (Array.isArray(savedMessages) && savedMessages.length > 0) {
                    this.sendMessage({
                        type: 'conversation_history',
                        messages: savedMessages
                    });
                }
                this.sendMessage({
                    type: 'connection_status',
                    status: this.socket?.connected ? 'connected' : 'disconnected',
                    text: this.socket?.connected
                        ? ''
                        : 'Cannot reach Nyxus. Check the server URL and connection.'
                });
                this.sendMessage({ type: 'workspace_index_status', ...this.indexStatus });
                return;
            }

            if (message.type === 'persist_messages') {
                if (Array.isArray(message.messages)) {
                    await this.context.workspaceState.update('nyxus.chatMessages', message.messages);
                }
                return;
            }

            if (message.type === 'open_readme_answer') {
                void this.openReadmeAnswer(message.markdown);
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
                    error: 'Workspace indexing is not ready yet. Wait for indexing and try again.'
                });
                return;
            }

            try {
                const config = vscode.workspace.getConfiguration('nyxusReplica');
                

                this.logFlow('request.chat');
                this.socket.emit('chat', {
                    prompt,
                    apikey: config.get('apiKey'),
                    workspace_id: this.workspaceId,
                    readme_mode: message.readmeMode !== false,
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

    async saveAndRenderReadmeAnswer(message) {
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        const targetPath = workspaceRoot
            ? path.join(workspaceRoot, 'answer.md')
            : '(no active workspace path)';
        this.output.appendLine(`Received README answer event; target file path: ${targetPath}.`);
        try {
            if (!workspaceRoot) {
                throw new Error('Open a workspace folder to save the README answer.');
            }
            if (
                message?.filename !== 'answer.md'
                || typeof message.markdown !== 'string'
            ) {
                throw new Error('Invalid README answer payload.');
            }
            const saved = await saveAnswerMarkdown(
                workspaceRoot,
                message.filename,
                message.markdown
            );
            this.output.appendLine(
                `Verified README answer at ${saved.answerPath} (${saved.bytes} bytes); opening Markdown preview.`
            );
            await openAnswerMarkdownPreview(vscode, saved.answerPath);
            this.output.appendLine(`Opened Markdown preview for ${saved.answerPath}.`);
            this.logFlow('readme_answer.opened');
        } catch (error) {
            const detail = error instanceof Error ? error.message : String(error);
            this.logFlow('readme_answer.open.failed');
            this.output.appendLine(`README answer at ${targetPath} could not be saved or opened: ${detail}`);
            this.sendMessage({
                type: 'initialization_error',
                text: `The README answer could not be saved or rendered: ${detail}`
            });
        }
    }

    async openReadmeAnswer(markdown) {
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!workspaceRoot) {
            this.sendMessage({
                type: 'initialization_error',
                text: 'Open a workspace folder before opening answer.md.'
            });
            return;
        }
        try {
            if (typeof markdown === 'string' && markdown.trim()) {
                await saveAnswerMarkdown(workspaceRoot, 'answer.md', markdown);
            }
            const answerPath = path.join(workspaceRoot, 'answer.md');
            const stat = await fs.promises.lstat(answerPath);
            if (stat.isSymbolicLink() || !stat.isFile()) {
                throw new Error('The README answer path must be a regular file.');
            }
            const realWorkspaceRoot = await fs.promises.realpath(workspaceRoot);
            const realAnswerPath = await fs.promises.realpath(answerPath);
            if (path.dirname(realAnswerPath) !== realWorkspaceRoot) {
                throw new Error('The README answer path is outside the workspace.');
            }
            await openAnswerMarkdownPreview(vscode, realAnswerPath);
            this.output.appendLine(`Reopened README Markdown preview at ${realAnswerPath}.`);
        } catch (error) {
            const detail = error instanceof Error ? error.message : String(error);
            this.sendMessage({
                type: 'initialization_error',
                text: `Could not open answer.md: ${detail}`
            });
        }
    }

    async saveAndRenderArchitectureDiagram(message) {
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        const requestedPath = workspaceRoot && typeof message.filename === 'string'
            ? path.resolve(
                workspaceRoot,
                '.nyxus',
                'architecture-diagrams',
                path.basename(message.filename)
            )
            : '(no active workspace path)';
        this.output.appendLine(
            `Received architecture HTML event; target file path: ${requestedPath}.`
        );
        if (
            !workspaceRoot
            || typeof message.filename !== 'string'
            || typeof message.html !== 'string'
            || Buffer.byteLength(message.html, 'utf8') > 2 * 1024 * 1024
        ) {
            const reason = typeof message.html === 'string'
                && Buffer.byteLength(message.html, 'utf8') > 2 * 1024 * 1024
                ? 'Architecture HTML exceeded the 2 MiB client limit.'
                : 'Invalid diagram payload.';
            this.reportArchitectureRender(message, 'failed', reason);
            this.sendMessage({
                type: 'initialization_error',
                text: reason === 'Invalid diagram payload.'
                    ? 'The architecture diagram could not be saved because its file data is invalid.'
                    : 'The architecture diagram is too large to save in VS Code.'
            });
            return;
        }
        this.output.appendLine(
            `Architecture HTML received from Nyxus: ${Buffer.byteLength(message.html, 'utf8')} bytes.`
        );
        const filename = path.basename(message.filename);
        if (!/^[a-zA-Z0-9_-]+\.html$/.test(filename)) {
            this.reportArchitectureRender(message, 'failed', 'Invalid diagram filename.');
            this.sendMessage({
                type: 'initialization_error',
                text: 'The architecture diagram could not be saved because its filename is invalid.'
            });
            return;
        }
        if (/<\s*(script|iframe|object|embed|form)\b|\son[a-z]+\s*=|javascript\s*:/i.test(message.html)) {
            this.reportArchitectureRender(message, 'failed', 'HTML contained active content.');
            this.sendMessage({
                type: 'initialization_error',
                text: 'The architecture diagram contains unsupported active HTML and was not opened.'
            });
            return;
        }

        let savedDiagram;
        try {
            savedDiagram = await saveArchitectureDiagram(
                workspaceRoot,
                filename,
                message.html
            );
            const savedStat = await fs.promises.stat(savedDiagram.diagramPath);
            if (!savedStat.isFile()) {
                throw new Error('The saved architecture path is not a file.');
            }
            this.output.appendLine(
                `Verified architecture HTML exists at ${savedDiagram.diagramPath} (${savedStat.size} bytes); opening the VS Code preview.`
            );
            openArchitectureDiagramPreview(
                vscode,
                typeof message.title === 'string'
                    ? message.title
                    : 'Repository architecture',
                message.html
            );
            this.output.appendLine(
                `Opened architecture preview for ${savedDiagram.diagramPath}.`
            );
            this.logFlow('architecture_diagram.opened');
            this.reportArchitectureRender(message, 'rendered');
            vscode.window.showInformationMessage(
                `Architecture diagram saved and opened: ${savedDiagram.diagramPath}`
            );
        } catch (error) {
            this.logFlow('architecture_diagram.open.failed');
            const detail = error instanceof Error ? error.message : String(error);
            this.output.appendLine(
                `Architecture diagram at ${requestedPath} ${savedDiagram ? 'was saved but could not be opened' : 'could not be saved'}: ${detail}`
            );
            this.reportArchitectureRender(
                message,
                'failed',
                detail
            );
            this.sendMessage({
                type: 'initialization_error',
                text: savedDiagram
                    ? `The architecture diagram was saved to ${savedDiagram.diagramPath}, but its preview could not be opened: ${detail}`
                    : `The architecture HTML was received but could not be saved or opened: ${detail}`
            });
        }
    }

    reportArchitectureRender(message, status, error) {
        if (!this.socket?.connected || !this.workspaceId) {
            this.output.appendLine('Architecture preview status could not be reported: Nyxus is disconnected.');
            return;
        }
        const config = vscode.workspace.getConfiguration('nyxusReplica');
        this.socket.emit('architecture_diagram_status', {
            apikey: config.get('apiKey'),
            workspace_id: this.workspaceId,
            filename: typeof message.filename === 'string'
                ? path.basename(message.filename)
                : '',
            status,
            ...(error ? { error } : {})
        }, (response) => {
            if (!response?.ok) {
                this.output.appendLine(
                    `Architecture preview status was not acknowledged: ${response?.error || 'server unavailable'}`
                );
            }
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
