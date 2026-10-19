const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');
const { test } = require('node:test');

const originalLoad = Module._load;
let workspaceRoot;
let workspaceFiles = [];

Module._load = function (request, parent, isMain) {
    if (request === 'vscode') {
        return {
            Position: class Position {
                constructor(line, character) {
                    this.line = line;
                    this.character = character;
                }
            },
            commands: {
                async executeCommand(command) {
                    if (command === 'vscode.executeDocumentSymbolProvider') {
                        return [{ name: 'ready' }];
                    }
                    return [{ uri: { fsPath: path.join(workspaceRoot, 'src', 'greet.js') } }];
                }
            },
            workspace: {
                get workspaceFolders() {
                    return [{ uri: { fsPath: workspaceRoot } }];
                },
                async findFiles() {
                    return workspaceFiles;
                },
                async openTextDocument(file) {
                    const content = await fs.readFile(file.fsPath, 'utf8');
                    return { getText: () => content };
                }
            },
            window: {
                async showTextDocument() {}
            }
        };
    }
    return originalLoad.call(this, request, parent, isMain);
};

let createCodeGraph;
try {
    ({ create_code_graph: createCodeGraph } = require('../../codegraph/parse_temp'));
} finally {
    Module._load = originalLoad;
}

test('creates the workspace import graph', async () => {
    workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'nyxus-graph-test-'));

    try {
        const sourceDirectory = path.join(workspaceRoot, 'src');
        await fs.mkdir(sourceDirectory);
        const entryPath = path.join(sourceDirectory, 'index.js');
        const dependencyPath = path.join(sourceDirectory, 'greet.js');
        await fs.writeFile(entryPath, "import { greet } from './greet.js';\ngreet();");
        await fs.writeFile(dependencyPath, 'export function greet() {}');
        workspaceFiles = [{ fsPath: entryPath }, { fsPath: dependencyPath }];

        await createCodeGraph();

        const mappingPath = path.join(workspaceRoot, '.nyxus', 'repo-mapping.json');
        const graph = JSON.parse(await fs.readFile(mappingPath, 'utf8'));
        assert.deepEqual(graph, { 'index.js': ['greet.js'] });
    } finally {
        workspaceFiles = [];
        await fs.rm(workspaceRoot, { recursive: true, force: true });
    }
});

test('writes an empty graph when there are no source files', async () => {
    workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'nyxus-empty-graph-test-'));

    try {
        workspaceFiles = [];
        await createCodeGraph();

        const mappingPath = path.join(workspaceRoot, '.nyxus', 'repo-mapping.json');
        assert.deepEqual(JSON.parse(await fs.readFile(mappingPath, 'utf8')), {});
    } finally {
        await fs.rm(workspaceRoot, { recursive: true, force: true });
    }
});
