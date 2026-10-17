const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');
const { after, test } = require('node:test');

const originalLoad = Module._load;
const registeredCommands = new Map();
let registeredView;
let registeredViewOptions;
let notification;
let providerLoadCount = 0;
let providerResolveCount = 0;
let createdProvider;
let providerDisposed = false;

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
                registerWebviewViewProvider(viewId, provider, options) {
                    registeredView = { viewId, provider };
                    registeredViewOptions = options;
                    return { dispose() {} };
                },
                showInformationMessage(message) {
                    notification = message;
                    return Promise.resolve(message);
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

                dispose() {
                    providerDisposed = true;
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

    assert.equal(subscriptions.length, 5);
    assert.equal(providerLoadCount, 0);
    assert.ok(registeredCommands.has('nyxusReplica.sayHi'));
    assert.ok(registeredCommands.has('nyxusReplica.openSidebar'));
    assert.equal(registeredView.viewId, 'nyxusReplica.sidebar');
    assert.deepEqual(registeredViewOptions, {
        webviewOptions: { retainContextWhenHidden: true }
    });

    let renderedHtml = '';
    let webviewOptions;
    let disposeHandler;
    registeredView.provider.resolveWebviewView({
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

    assert.equal(webviewOptions.enableScripts, false);
    assert.match(renderedHtml, /Starting Nyxus/);
    assert.equal(providerLoadCount, 0);

    await new Promise((resolve) => setTimeout(resolve, 10));

    assert.equal(providerLoadCount, 1);
    assert.equal(providerResolveCount, 1);
    assert.ok(createdProvider);
    assert.equal(typeof disposeHandler, 'function');
    subscriptions[4].dispose();
    assert.equal(providerDisposed, true);
});

test('shows a greeting notification when the command runs', async () => {
    await registeredCommands.get('nyxusReplica.sayHi')();

    assert.equal(notification, 'Hi from the Nyxus test extension!');
});
