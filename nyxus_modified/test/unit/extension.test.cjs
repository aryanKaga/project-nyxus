const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');
const { after, test } = require('node:test');

const originalLoad = Module._load;
const registeredCommands = new Map();
const registeredViews = new Map();
let notification;
let providerLoadCount = 0;
let providerResolveCount = 0;
let createdProvider;
let providerDisposed = false;

let settingsLoadCount = 0;
let settingsResolveCount = 0;
let settingsDisposed = false;

Module._load = function (request, parent, isMain) {
    if (request === 'vscode') {
        return {
            commands: {
                registerCommand(commandId, handler) {
                    registeredCommands.set(commandId, handler);
                    return { dispose() {} };
                },
                executeCommand(commandId) {
                    return Promise.resolve(commandId);
                }
            },
            window: {
                createOutputChannel() {
                    return {
                        appendLine() {},
                        dispose() {}
                    };
                },
                registerWebviewViewProvider(viewId, provider) {
                    registeredViews.set(viewId, provider);
                    return { dispose() {} };
                },
                showInformationMessage(message) {
                    notification = message;
                    return Promise.resolve(message);
                },
                registerUriHandler(handler) {
                    return { dispose() {} };
                }
            }
        };
    }
    if (request === './webviewprovider/SidebarProvider') {
        providerLoadCount += 1;
        return {
            SidebarProvider: class {
                constructor() {
                    createdProvider = this;
                }

                resolveWebviewView() {
                    providerResolveCount += 1;
                }

                sendMessage() {}

                dispose() {
                    providerDisposed = true;
                }
            }
        };
    }
    if (request === './webviewprovider/SettingsViewProvider') {
        settingsLoadCount += 1;
        return {
            SettingsViewProvider: class {
                resolveWebviewView() {
                    settingsResolveCount += 1;
                }

                dispose() {
                    settingsDisposed = true;
                }
            }
        };
    }
    return originalLoad.call(this, request, parent, isMain);
};

after(() => {
    Module._load = originalLoad;
});

const extension = require('../../extension');

test('keeps extension activation lightweight and loads the sidebar on demand', async () => {
    const subscriptions = [];

    extension.activate({
        subscriptions,
        extensionUri: { fsPath: path.resolve(__dirname, '../..') }
    });

    assert.equal(subscriptions.length, 10);
    assert.equal(providerLoadCount, 0);
    assert.ok(registeredCommands.has('nyxusReplica.sayHi'));
    assert.ok(registeredCommands.has('nyxusReplica.openSidebar'));
    assert.ok(registeredCommands.has('nyxusReplica.openSettings'));
    assert.ok(registeredCommands.has('nyxusReplica.setApiKey'));
    assert.ok(registeredCommands.has('nyxusReplica.openNativeSettings'));
    assert.ok(registeredViews.has('nyxusReplica.sidebar'));

    let renderedHtml = '';
    let webviewOptions;
    let disposeHandler;
    registeredViews.get('nyxusReplica.sidebar').resolveWebviewView({
        webview: {
            set options(value) {
                webviewOptions = value;
            },
            set html(value) {
                renderedHtml = value;
            }
        },
        onDidDispose(handler) {
            disposeHandler = handler;
        }
    });

    assert.equal(webviewOptions, undefined);
    assert.match(renderedHtml, /Starting Nyxus/);
    assert.equal(providerLoadCount, 0);

    await new Promise((resolve) => setTimeout(resolve, 20));

    assert.equal(providerLoadCount, 1);
    assert.equal(providerResolveCount, 1);
    assert.ok(createdProvider);
    assert.equal(typeof disposeHandler, 'function');

    // Trigger cleanup
    subscriptions[7].dispose();
    assert.equal(providerDisposed, true);
});

test('shows a greeting notification when the command runs', async () => {
    await registeredCommands.get('nyxusReplica.sayHi')();

    assert.equal(notification, 'Hi from the Nyxus test extension!');
});

test('executes openSettings command without error', async () => {
    await registeredCommands.get('nyxusReplica.openSettings')();
});
