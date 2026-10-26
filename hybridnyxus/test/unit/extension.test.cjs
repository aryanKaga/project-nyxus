const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');
const { after, test } = require('node:test');

const originalLoad = Module._load;
const registeredCommands = new Map();
let registeredView;
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
                    registeredView = { viewId, provider, options };
                    return { dispose() {} };
                },
                showInformationMessage(message) {
                    notification = message;
                    return Promise.resolve(message);
                }
            },
            Uri: {
                file(fsPath) { return { fsPath, toString: () => fsPath }; },
                joinPath(base, ...parts) {
                    const joined = path.join(base.fsPath || base.path || '', ...parts);
                    return { fsPath: joined, toString: () => joined };
                }
            },
            workspace: {
                workspaceFolders: [{ uri: { fsPath: '/test/workspace' } }],
                getConfiguration() {
                    return { get: () => 'http://localhost:5000' };
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

    assert.equal(subscriptions.length, 6);
    assert.equal(providerLoadCount, 0);
    assert.ok(registeredCommands.has('nyxusReplica.sayHi'));
    assert.ok(registeredCommands.has('nyxusReplica.openSidebar'));
    assert.ok(registeredCommands.has('nyxusReplica.clearChat'));
    assert.equal(registeredView.viewId, 'nyxusReplica.sidebar');
    assert.equal(registeredView.options?.webviewOptions?.retainContextWhenHidden, true);

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
    subscriptions[5].dispose();
    assert.equal(providerDisposed, true);
});

test('shows a greeting notification when the command runs', async () => {
    await registeredCommands.get('nyxusReplica.sayHi')();

    assert.equal(notification, 'Hi from the Nyxus test extension!');
});

test('caches and restores conversation history across sidebar sessions', async () => {
    const { SidebarProvider } = require('../../webviewprovider/SidebarProvider');
    const store = new Map();
    const fakeContext = {
        extensionUri: { fsPath: path.resolve(__dirname, '../..') },
        workspaceState: {
            get(key) {
                return store.get(key);
            },
            async update(key, value) {
                store.set(key, value);
            }
        }
    };
    const fakeOutput = { appendLine() {} };
    const provider = new SidebarProvider(fakeContext, fakeOutput);

    let receivedMessages = [];
    let messageListener;
    const fakeWebviewView = {
        webview: {
            options: {},
            html: '',
            asWebviewUri(uri) { return uri.toString(); },
            onDidReceiveMessage(fn) { messageListener = fn; },
            postMessage(msg) { receivedMessages.push(msg); return true; }
        },
        onDidDispose() {}
    };

    provider.resolveWebviewView(fakeWebviewView);

    // 1. Simulate saving conversation
    const sampleChat = [
        { role: 'user', text: 'Hello Nyxus' },
        { role: 'assistant', text: 'Hi! How can I help you today?' }
    ];
    await messageListener({ type: 'save_conversation', messages: sampleChat });

    // Verify stored in workspaceState
    assert.deepEqual(store.get('nyxus.chatMessages'), sampleChat);

    // 2. Simulate webview reloading/re-opening and sending webview_ready
    receivedMessages = [];
    await messageListener({ type: 'webview_ready' });

    // Verify restore_conversation message is sent to webview
    const restoreMsg = receivedMessages.find(m => m.type === 'restore_conversation');
    assert.ok(restoreMsg);
    assert.deepEqual(restoreMsg.messages, sampleChat);

    // 3. Simulate clear conversation
    await messageListener({ type: 'clear_conversation' });
    assert.deepEqual(store.get('nyxus.chatMessages'), []);

    provider.dispose();
});
