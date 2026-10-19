const vscode = require('vscode');

/**
 * @param {import('vscode').ExtensionContext} context
 */
function activate(context) {
    const output = vscode.window.createOutputChannel('Nyxus Replica');
    /** @type {import('./webviewprovider/SidebarProvider').SidebarProvider | undefined} */
    let sidebarProvider;
    /** @type {ReturnType<typeof setTimeout> | undefined} */
    let initializationTimer;

    const sayHi = vscode.commands.registerCommand('nyxusReplica.sayHi', () => {
        return vscode.window.showInformationMessage('Hi from the Nyxus test extension!');
    });
    const viewProvider = {
        /**
         * @param {import('vscode').WebviewView} webviewView
         */
        resolveWebviewView(webviewView) {
            const webview = webviewView.webview;
            webview.options = { enableScripts: false };
            webview.html = '<!DOCTYPE html><html><body><p>Starting Nyxus…</p></body></html>';

            initializationTimer = setTimeout(() => {
                initializationTimer = undefined;
                try {
                    const { SidebarProvider } = require('./webviewprovider/SidebarProvider');
                    if (!sidebarProvider) {
                        sidebarProvider = new SidebarProvider(context, output);
                    }
                    sidebarProvider.resolveWebviewView(webviewView);
                } catch (error) {
                    const detail = error instanceof Error ? error.message : String(error);
                    output.appendLine(`Nyxus sidebar initialization failed: ${detail}`);
                    webview.html = '<!DOCTYPE html><html><body><p>Nyxus could not start. See the Nyxus Replica output channel.</p></body></html>';
                }
            }, 0);

            webviewView.onDidDispose(() => {
                if (initializationTimer !== undefined) {
                    clearTimeout(initializationTimer);
                    initializationTimer = undefined;
                }
            });
        }
    };
    const sidebar = vscode.window.registerWebviewViewProvider(
        'nyxusReplica.sidebar',
        viewProvider,
        { webviewOptions: { retainContextWhenHidden: true } }
    );
    const cleanup = {
        dispose() {
            if (initializationTimer !== undefined) {
                clearTimeout(initializationTimer);
                initializationTimer = undefined;
            }
            sidebarProvider?.dispose();
        }
    };
    const openSidebar = vscode.commands.registerCommand('nyxusReplica.openSidebar', () =>
        vscode.commands.executeCommand('workbench.view.extension.nyxusReplica')
    );

    context.subscriptions.push(output, sayHi, sidebar, openSidebar, cleanup);
}

function deactivate() {}

module.exports = { activate, deactivate };
