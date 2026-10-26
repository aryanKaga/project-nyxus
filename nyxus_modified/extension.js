const vscode = require('vscode');

/**
 * @param {import('vscode').ExtensionContext} context
 */
function activate(context) {
    const output = vscode.window.createOutputChannel('Nyxus');
    /** @type {import('./webviewprovider/SidebarProvider').SidebarProvider | undefined} */
    let sidebarProvider;
    /** @type {ReturnType<typeof setTimeout> | undefined} */
    let initializationTimer;

    /** @type {import('./webviewprovider/SettingsViewProvider').SettingsViewProvider | undefined} */
    let settingsViewProvider;
    /** @type {ReturnType<typeof setTimeout> | undefined} */
    let settingsInitializationTimer;

    const sayHi = vscode.commands.registerCommand('nyxusReplica.sayHi', () => {
        return vscode.window.showInformationMessage('Hi from the Nyxus test extension!');
    });

    const { migrateLegacyApiKey } = require('./webviewprovider/api_key_storage');
    void migrateLegacyApiKey(context).catch((error) => {
        output.appendLine(`Nyxus API key migration failed: ${error instanceof Error ? error.message : String(error)}`);
    });
    const setApiKey = vscode.commands.registerCommand('nyxusReplica.setApiKey', async () => {
        const value = await vscode.window.showInputBox({
            prompt: 'Enter the API key for your Nyxus server',
            password: true,
            ignoreFocusOut: true
        });
        if (value === undefined) return;
        if (!value.trim()) {
            await context.secrets.delete('nyxusReplica.apiKey');
            await vscode.window.showInformationMessage('Nyxus API key cleared.');
            await sidebarProvider?.reconnect();
            return;
        }
        await context.secrets.store('nyxusReplica.apiKey', value.trim());
        await vscode.window.showInformationMessage('Nyxus API key saved securely.');
        await sidebarProvider?.reconnect();
    });
    const openNativeSettings = vscode.commands.registerCommand('nyxusReplica.openNativeSettings', () =>
        vscode.commands.executeCommand('workbench.action.openSettings', '@ext:your-name.nyxus-coding-agent-replica')
    );
    const configurationListener = vscode.workspace?.onDidChangeConfiguration?.((event) => {
        if (event.affectsConfiguration('nyxusReplica.url')
            || event.affectsConfiguration('nyxusReplica.connectionTimeout')
            || event.affectsConfiguration('nyxusReplica.reconnectionDelay')) {
            void sidebarProvider?.reconnect();
        }
        if (event.affectsConfiguration('nyxusReplica.enableWorkspaceSync')
            || event.affectsConfiguration('nyxusReplica.workspaceSyncBehavior')) {
            const config = vscode.workspace.getConfiguration('nyxusReplica');
            if (config.get('enableWorkspaceSync', true)
                && config.get('workspaceSyncBehavior', 'onSidebarOpen') === 'onSidebarOpen') {
                void sidebarProvider?.prepareWorkspace();
            }
        }
    });

    const viewProvider = {
        /**
         * @param {import('vscode').WebviewView} webviewView
         */
        resolveWebviewView(webviewView) {
            const webview = webviewView.webview;
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
                    try {
                        webview.html = '<!DOCTYPE html><html><body><p>Nyxus could not start. See the Nyxus output channel.</p></body></html>';
                    } catch {
                        // webview was disposed before we could update it — nothing to do
                    }
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
    const sidebar = vscode.window.registerWebviewViewProvider('nyxusReplica.sidebar', viewProvider, {
        webviewOptions: {
            retainContextWhenHidden: true
        }
    });

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

    const openSettings = vscode.commands.registerCommand('nyxusReplica.openSettings', async () => {
        await vscode.commands.executeCommand('workbench.view.extension.nyxusReplica');
        sidebarProvider?.sendMessage({ type: 'set_view', view: 'settings' });
    });

    const clearChat = vscode.commands.registerCommand('nyxusReplica.clearChat', async () => {
        await context.workspaceState.update('nyxus.chatMessages', []);
        sidebarProvider?.sendMessage({ type: 'clear_conversation' });
        void vscode.window.showInformationMessage('Nyxus conversation cleared.');
    });

    const uriHandler = typeof vscode.window.registerUriHandler === 'function'
        ? vscode.window.registerUriHandler({
            async handleUri(uri) {
                output.appendLine(`Nyxus received URI deep link: ${uri.toString()}`);
                try {
                    const params = new URLSearchParams(uri.query);
                    const userId = params.get('userId') || params.get('user_id') || params.get('email');
                    if (userId && userId.trim()) {
                        const cleanUserId = userId.trim();
                        const { setUserId } = require('./webviewprovider/user_id_storage');
                        await setUserId(context, cleanUserId);
                        output.appendLine(`Nyxus configured User ID from URI deep link: ${cleanUserId}`);
                        vscode.window.showInformationMessage(`Nyxus configured with User ID: ${cleanUserId}`);
                        await vscode.commands.executeCommand('workbench.view.extension.nyxusReplica');
                        if (sidebarProvider) {
                            sidebarProvider.sendMessage({ type: 'save_user_id_result', ok: true, userId: cleanUserId });
                            sidebarProvider.sendMessage({ type: 'workspace_info', userId: cleanUserId, user_id: cleanUserId });
                            await sidebarProvider.reconnect?.();
                        }
                    }
                } catch (err) {
                    output.appendLine(`Failed to handle URI: ${err instanceof Error ? err.message : String(err)}`);
                }
            }
        })
        : { dispose() {} };

    context.subscriptions.push(output, sayHi, setApiKey, openNativeSettings, sidebar, openSidebar, openSettings, cleanup, clearChat, uriHandler);
    if (configurationListener) context.subscriptions.push(configurationListener);
}

function deactivate() {}

module.exports = { activate, deactivate };
