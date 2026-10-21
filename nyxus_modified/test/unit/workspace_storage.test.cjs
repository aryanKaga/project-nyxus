const assert = require('node:assert/strict');
const { test } = require('node:test');
const {
    getWorkspaceStorageKey,
    getStoredWorkspaceId,
    saveStoredWorkspaceId,
    clearStoredWorkspaceId,
    getStoredWorkspaceMeta,
    saveStoredWorkspaceMeta
} = require('../../webviewprovider/workspace_storage');

function createMockContext() {
    const store = new Map();
    return {
        globalState: {
            get(key) {
                return store.get(key);
            },
            update(key, value) {
                if (value === undefined) {
                    store.delete(key);
                } else {
                    store.set(key, value);
                }
                return Promise.resolve();
            }
        }
    };
}

test('workspace_storage generates consistent storage keys for URIs', () => {
    const uri1 = { toString: () => 'file:///workspace/project-a' };
    const uri2 = 'file:///workspace/project-b';

    const key1 = getWorkspaceStorageKey(uri1);
    const key2 = getWorkspaceStorageKey(uri2);

    assert.equal(key1, 'nyxusReplica.workspaceId:file:///workspace/project-a');
    assert.equal(key2, 'nyxusReplica.workspaceId:file:///workspace/project-b');
    assert.notEqual(key1, key2);
});

test('workspace_storage saves, retrieves, and clears workspace IDs independently per folder', async () => {
    const context = createMockContext();
    const folderA = { toString: () => 'file:///workspaces/repo-alpha' };
    const folderB = { toString: () => 'file:///workspaces/repo-beta' };

    assert.equal(getStoredWorkspaceId(context, folderA), undefined);
    assert.equal(getStoredWorkspaceId(context, folderB), undefined);

    await saveStoredWorkspaceId(context, folderA, 'ws-alpha-1234');
    await saveStoredWorkspaceId(context, folderB, 'ws-beta-5678');

    assert.equal(getStoredWorkspaceId(context, folderA), 'ws-alpha-1234');
    assert.equal(getStoredWorkspaceId(context, folderB), 'ws-beta-5678');

    await clearStoredWorkspaceId(context, folderA);

    assert.equal(getStoredWorkspaceId(context, folderA), undefined);
    assert.equal(getStoredWorkspaceId(context, folderB), 'ws-beta-5678');
});

test('workspace_storage trims whitespace and validates input', async () => {
    const context = createMockContext();
    const folder = { toString: () => 'file:///workspaces/repo' };

    await saveStoredWorkspaceId(context, folder, '  ws-trimmed-id  ');
    assert.equal(getStoredWorkspaceId(context, folder), 'ws-trimmed-id');

    await assert.rejects(
        () => saveStoredWorkspaceId(context, folder, '   '),
        /Invalid arguments/
    );
});

test('workspace_storage saves and retrieves customName and description metadata', async () => {
    const context = createMockContext();
    const folder = { toString: () => 'file:///workspaces/repo-meta' };

    assert.deepEqual(getStoredWorkspaceMeta(context, folder), { customName: '', description: '', staged: false });

    await saveStoredWorkspaceMeta(context, folder, {
        customName: '  My API Server  ',
        description: '  Core auth service  '
    });

    assert.deepEqual(getStoredWorkspaceMeta(context, folder), {
        customName: 'My API Server',
        description: 'Core auth service',
        staged: false
    });
});

test('workspace_storage manages staged flag', async () => {
    const context = createMockContext();
    const folder = { toString: () => 'file:///workspaces/repo-staged' };
    const { getStoredWorkspaceStaged, setStoredWorkspaceStaged } = require('../../webviewprovider/workspace_storage');

    assert.equal(getStoredWorkspaceStaged(context, folder), false);

    await setStoredWorkspaceStaged(context, folder, true);
    assert.equal(getStoredWorkspaceStaged(context, folder), true);

    await setStoredWorkspaceStaged(context, folder, false);
    assert.equal(getStoredWorkspaceStaged(context, folder), false);
});

