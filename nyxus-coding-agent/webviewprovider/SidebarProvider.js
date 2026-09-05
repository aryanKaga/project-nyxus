const vscode = require('vscode');
const path = require('path');
const fs = require('fs');

const {create_code_graph} = require('../codegraph/parse_temp.js')
const {build_directory} = require('../codegraph/dir_structure.js')
const {send_init_data,check_auto_memmory} = require('./send_nyxus_data') 
const {createWebSocket } = require('./create_websocket')
/**
 * 
 * @param {*} socket 
 */

async function init(socket){
    await create_code_graph()
    await build_directory()
    console.log('build everything now sending data')
    await send_init_data(socket)
    await check_auto_memmory(socket)
}


class SidebarProvider {

    /**
     * @param {vscode.ExtensionContext} context
     */
    constructor(context) {
        this.extensionUri = context.extensionUri;  // ← extract extensionUri from context
        this._view = undefined;
        console.log('[Nyxus] SidebarProvider initialized');
        
        
    }

    /**
     * @param {vscode.WebviewView} webviewView
     */
    resolveWebviewView(webviewView) {
        this._view = webviewView;
        const webview = webviewView.webview;
        const distUri = vscode.Uri.joinPath(this.extensionUri,'webview-ui','dist');
        const config  = vscode.workspace.getConfiguration('nyxus')
        const url = config.get('url')
        const user_api  = config.get('apiKey')
        webview.options ={
            enableScripts:true,
            localResourceRoots:[distUri]
        }
        webview.html = this._getHtml(webview, distUri);
        this.socket = createWebSocket(webview)
        init(this.socket)
        webview.onDidReceiveMessage((message)=>{
            const auto_memmory = check_auto_memmory(this.socket)
            if(message.type === 'chat'){
                if(!this.socket){
                    console.error('[Nyxus] Socket not initialized');
                    return;
                }
                console.log('[Nyxus] Sending chat message:', message.prompt);
                this.socket.emit('chat',{prompt: message.prompt, apikey: user_api, auto_memmory: auto_memmory})
                console.log('[Nyxus] Chat message sent:', {prompt: message.prompt,apikey:user_api});
            }
        })
        
        

    }

    /**
     * @param {vscode.Webview} webview
     * @param {vscode.Uri} distUri
     * @returns {string}
     */
    _getHtml(webview, distUri) {
        const distPath = distUri.fsPath;

        console.log('[Nyxus] distPath:', distPath);
        console.log('[Nyxus] dist files:', fs.readdirSync(distPath));
        console.log('[Nyxus] dist/assets:', fs.readdirSync(path.join(distPath, 'assets')));

        let html = fs.readFileSync(path.join(distPath, 'index.html'), 'utf8');

        console.log('[Nyxus] raw html:', html);

        // Vite with base "./" outputs paths like ./assets/index-abc.js
        // Vite with base "/"  outputs paths like /assets/index-abc.js
        // This regex handles both cases.
        html = html.replace(
            /(src|href)="(\.?\/assets\/[^"]+)"/g,
            (_, attr, assetPath) => {
                // Strip leading ./ or / to get a clean relative path
                const cleanPath = assetPath.replace(/^\.?\//, '');
                const fileUri = vscode.Uri.file(path.join(distPath, cleanPath));
                const webviewUri = webview.asWebviewUri(fileUri);
                console.log(`[Nyxus] ${attr}="${assetPath}" → ${webviewUri}`);
                return `${attr}="${webviewUri}"`;
            }
        );

        return html;
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