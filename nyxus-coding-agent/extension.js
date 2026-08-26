// extension.js
const vscode = require('vscode');
const { SidebarProvider } = require('./webviewprovider/SidebarProvider');

/**
 * Called when the extension is activated.
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
    console.log('[Nyxus] Extension activated');

    const sidebarProvider = new SidebarProvider(context);

    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(
            'nyxus.sidebar', // Must match package.json view id
            sidebarProvider
        )
    );
}

/**
 * Called when the extension is deactivated.
 */
function deactivate() {
    console.log('[Nyxus] Extension deactivated');
}

module.exports = {
    activate,
    deactivate
};