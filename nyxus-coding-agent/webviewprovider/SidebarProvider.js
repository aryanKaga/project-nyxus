const vscode = require('vscode');
const path = require('path');
const fs = require('fs');

const { create_code_graph } = require('../codegraph/parse_temp.js');
const { build_directory } = require('../codegraph/dir_structure.js');
const { send_init_data, check_auto_memmory } = require('./send_nyxus_data');
const { createWebSocket } = require('./create_websocket');

/**
 * @param {*} socket
 */
async function init(socket) {
    try {
        await create_code_graph();
        await build_directory();
        console.log('[Nyxus] build everything now sending data');
        await send_init_data(socket);
        await check_auto_memmory(socket);
    } catch (err) {
        console.error('[Nyxus] init() failed:', err);
    }
}

class SidebarProvider {

    /**
     * @param {vscode.ExtensionContext} context
     */
    constructor(context) {
        this.extensionUri = context.extensionUri;
        this._view = undefined;
        this.socket = undefined;
        console.log('[Nyxus] SidebarProvider initialized');
    }

    /**
     * @param {vscode.WebviewView} webviewView
     */
    resolveWebviewView(webviewView) {
        this._view = webviewView;
        const webview = webviewView.webview;
        const distUri = vscode.Uri.joinPath(this.extensionUri, 'webview-ui', 'dist');
        const config = vscode.workspace.getConfiguration('nyxus');
        const url = config.get('url');
        const user_api = config.get('apiKey');
        
        webview.options = {
            enableScripts: true,
            localResourceRoots: [distUri]
        };

        // --- Load HTML, but never fail silently ---
        try {
            webview.html = this._getHtml(webview, distUri);
        } catch (err) {
            console.error('[Nyxus] Failed to load webview HTML:', err);
            
            webview.html = this._getErrorHtml(err instanceof Error ? err : new Error(String(err)));

            return; // stop here — no point starting sockets if UI failed to load
        }

        // --- Init socket + data, isolated so a failure here doesn't blank the UI ---
        try {
            this.socket = createWebSocket(webview);
            init(this.socket);
        } catch (err) {
            console.error('[Nyxus] Failed to init socket/data:', err);
            webview.postMessage({
                type: 'server_status',
                status: 'error',
                error: err instanceof Error ? err.message : String(err)
            });
        }

        webview.onDidReceiveMessage(async (message) => {
            try {
                if (message.type === 'reconnect') {
                    if (this.socket) {
                        this.socket.connect();
                    } else {
                        this.socket = createWebSocket(webview);
                        init(this.socket);
                    }
                    return;
                }

                if (message.type === 'chat') {
                    if (!this.socket) {
                        console.error('[Nyxus] Socket not initialized');
                        return;
                    }
                    const auto_memmory = await check_auto_memmory(this.socket);
                    console.log('[Nyxus] Sending chat message:', message.prompt);
                    this.socket.emit('chat', {
                        prompt: message.prompt,
                        apikey: user_api,
                        auto_memmory: auto_memmory
                    });
                    console.log('[Nyxus] Chat message sent:', { prompt: message.prompt, apikey: user_api });
                }
            } catch (err) {
                console.error('[Nyxus] Error handling webview message:', err);
            }
        });
    }

    /**
     * @param {vscode.Webview} webview
     * @param {vscode.Uri} distUri
     * @returns {string}
     */
    _getHtml(webview, distUri) {
        const distPath = distUri.fsPath;

        if (!fs.existsSync(distPath)) {
            throw new Error(
                `dist folder not found at: ${distPath}\n` +
                `Run "npm run build:webview" (or cd webview-ui && npm install && npm run build) first.`
            );
        }

        console.log('[Nyxus] distPath:', distPath);
        console.log('[Nyxus] dist files:', fs.readdirSync(distPath));

        const assetsPath = path.join(distPath, 'assets');
        if (!fs.existsSync(assetsPath)) {
            throw new Error(`dist/assets folder not found at: ${assetsPath}`);
        }
        console.log('[Nyxus] dist/assets:', fs.readdirSync(assetsPath));

        const indexPath = path.join(distPath, 'index.html');
        if (!fs.existsSync(indexPath)) {
            throw new Error(`index.html not found at: ${indexPath}`);
        }

        let html = fs.readFileSync(indexPath, 'utf8');
        console.log('[Nyxus] raw html:', html);

        // Vite with base "./" outputs paths like ./assets/index-abc.js
        // Vite with base "/"  outputs paths like /assets/index-abc.js
        // This regex handles both cases.
        html = html.replace(
            /(src|href)="(\.?\/assets\/[^"]+)"/g,
            (_, attr, assetPath) => {
                const cleanPath = assetPath.replace(/^\.?\//, '');
                const fileUri = vscode.Uri.file(path.join(distPath, cleanPath));
                const webviewUri = webview.asWebviewUri(fileUri);
                console.log(`[Nyxus] ${attr}="${assetPath}" -> ${webviewUri}`);
                return `${attr}="${webviewUri}"`;
            }
        );

        return html;
    }

    /**
     * Fallback HTML shown when the real UI fails to load, so the panel
     * never just goes silently blank.
     * @param {Error} err
     * @returns {string}
     */
    _getErrorHtml(err) {
        const message = (err && err.message) ? err.message : String(err);
        return `<!DOCTYPE html>
<html>
<body style="font-family: sans-serif; padding: 12px; color: var(--vscode-foreground); background: var(--vscode-editor-background);">
    <h3>Nyxus failed to load UI</h3>
    <pre style="white-space: pre-wrap; font-size: 12px;">${message.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>
    <p>Check the "Log (Extension Host)" output channel or the Debug Console for more detail.</p>
</body>
</html>`;
    }

    /**
     * @param {any} message
     */
    sendMessage(message) {
        if (this._view) {
            this._view.webview.postMessage(message);
        }
    }
}

module.exports = { SidebarProvider };