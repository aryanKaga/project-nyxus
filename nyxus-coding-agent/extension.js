const vscode = require('vscode');

function activate(context) {
    let sidebarProvider;
    const lazySidebarProvider = {
        resolveWebviewView(webviewView, contextForView, token) {
            if (!sidebarProvider) {
                const { SidebarProvider } = require('./webviewprovider/SidebarProvider');
                sidebarProvider = new SidebarProvider(context);
            }

            return sidebarProvider.resolveWebviewView(
                webviewView,
                contextForView,
                token
            );
        }
    };

    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(
            'nyxus.sidebar',
            lazySidebarProvider
        ),
        vscode.commands.registerCommand('nyxus.openSidebar', () =>
            vscode.commands.executeCommand('workbench.view.extension.nyxus')
        )
    );
}

function deactivate() {}

module.exports = { activate, deactivate };
