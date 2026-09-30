const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');
const { test } = require('node:test');

const originalLoad = Module._load;
let workspaceRoot;

Module._load = function (request, parent, isMain) {
    if (request === 'vscode') {
        return {
            workspace: {
                workspaceFolders: [{ uri: { fsPath: workspaceRoot } }]
            }
        };
    }

    return originalLoad.call(this, request, parent, isMain);
};

const { build_directory } = require('../../codegraph/dir_structure');
Module._load = originalLoad;

test('writes an asynchronous workspace tree without generated Nyxus data', async () => {
    workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'nyxus-tree-test-'));

    try {
        await fs.mkdir(path.join(workspaceRoot, 'src'));
        await fs.writeFile(path.join(workspaceRoot, 'src', 'index.js'), 'export {};');
        await fs.mkdir(path.join(workspaceRoot, '.nyxus'));
        await fs.writeFile(path.join(workspaceRoot, '.nyxus', 'old-index.json'), '{}');

        await build_directory();

        const outputPath = path.join(workspaceRoot, '.nyxus', 'directory_structure.json');
        const tree = JSON.parse(await fs.readFile(outputPath, 'utf8'));

        assert.deepEqual(tree[path.basename(workspaceRoot)], [
            { src: ['index.js'] }
        ]);
    } finally {
        await fs.rm(workspaceRoot, { recursive: true, force: true });
    }
});
