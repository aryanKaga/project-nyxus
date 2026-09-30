const assert = require('node:assert/strict');
const Module = require('node:module');
const { test } = require('node:test');

const originalLoad = Module._load;
const providers = new Map();
const commands = new Map();
const executedCommands = [];
const providerContexts = [];

class SidebarProvider {
    constructor(context) {
        providerContexts.push(context);
    }

    resolveWebviewView(webviewView) {
        webviewView.webview.html = '<p>Nyxus chat is ready.</p>';
    }
}

Module._load = function (request, parent, isMain) {
    if (request === 'vscode') {
        return {
            window: {
                registerWebviewViewProvider(viewId, provider) {
                    providers.set(viewId, provider);
                    return { dispose() {} };
                }
            },
            commands: {
                registerCommand(commandId, handler) {
                    commands.set(commandId, handler);
                    return { dispose() {} };
                },
                executeCommand(commandId) {
                    executedCommands.push(commandId);
                    return Promise.resolve();
                }
            }
        };
    }

    if (request === './webviewprovider/SidebarProvider') {
        return { SidebarProvider };
    }

    return originalLoad.call(this, request, parent, isMain);
};

const extension = require('../../extension');
Module._load = originalLoad;

test('activates the Nyxus chat view lazily', () => {
    const subscriptions = [];
    const context = { subscriptions, extensionUri: { fsPath: '/extension' } };
    extension.activate(context);

    assert.equal(subscriptions.length, 2);
    assert.ok(providers.has('nyxus.sidebar'));
    assert.ok(commands.has('nyxus.openSidebar'));
    assert.equal(providerContexts.length, 0);

    let renderedHtml = '';
    const load = Module._load;
    Module._load = function (request, parent, isMain) {
        if (request === './webviewprovider/SidebarProvider') {
            return { SidebarProvider };
        }

        return load.call(this, request, parent, isMain);
    };
    try {
        providers.get('nyxus.sidebar').resolveWebviewView({
            webview: {
                set html(value) {
                    renderedHtml = value;
                }
            }
        });
    } finally {
        Module._load = load;
    }

    assert.deepEqual(providerContexts, [context]);
    assert.match(renderedHtml, /Nyxus chat is ready/);
});

test('open command reveals the Nyxus view container', async () => {
    await commands.get('nyxus.openSidebar')();

    assert.deepEqual(executedCommands, ['workbench.view.extension.nyxus']);
});
