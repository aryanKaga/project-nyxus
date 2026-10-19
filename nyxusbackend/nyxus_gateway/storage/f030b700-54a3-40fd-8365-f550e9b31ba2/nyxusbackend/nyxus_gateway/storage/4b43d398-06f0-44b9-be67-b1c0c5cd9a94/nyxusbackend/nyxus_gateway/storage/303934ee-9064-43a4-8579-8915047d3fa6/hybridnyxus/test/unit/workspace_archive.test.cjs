const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { test } = require('node:test');

const { create_workspace_archive, listGitFiles } = require('../../webviewprovider/workspace_archive');

async function createGitWorkspace() {
    const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'nyxus-git-workspace-'));
    execFileSync('git', ['init', '-q', workspaceRoot]);
    execFileSync('git', ['-C', workspaceRoot, 'config', 'user.email', 'test@example.com']);
    execFileSync('git', ['-C', workspaceRoot, 'config', 'user.name', 'Workspace Test']);
    return workspaceRoot;
}

test('archives tracked and non-ignored files while respecting a generated gitignore', async () => {
    const workspaceRoot = await createGitWorkspace();
    try {
        await fs.mkdir(path.join(workspaceRoot, 'src'));
        await fs.writeFile(path.join(workspaceRoot, 'src', 'tracked.js'), 'tracked');
        await fs.writeFile(path.join(workspaceRoot, 'untracked.js'), 'untracked');
        await fs.mkdir(path.join(workspaceRoot, 'node_modules'));
        await fs.writeFile(path.join(workspaceRoot, 'node_modules', 'ignored.js'), 'ignored');
        execFileSync('git', ['-C', workspaceRoot, 'add', 'src/tracked.js']);

        const archiveData = await create_workspace_archive(workspaceRoot);
        const files = await listGitFiles(workspaceRoot);

        assert.ok(files.includes('.gitignore'));
        assert.ok(files.includes('src/tracked.js'));
        assert.ok(files.includes('untracked.js'));
        assert.ok(!files.includes('node_modules/ignored.js'));
        assert.equal(archiveData.fileCount, files.length);
        assert.equal(archiveData.commitCreated, true);
        assert.equal(
            execFileSync('git', ['-C', workspaceRoot, 'log', '-1', '--format=%s'], { encoding: 'utf8' }).trim(),
            'Sync workspace for Nyxus'
        );
        assert.equal(archiveData.workspaceName, path.basename(workspaceRoot));
        assert.equal(archiveData.archive.readUInt32LE(0), 0x04034b50);
        assert.ok((await fs.readFile(path.join(workspaceRoot, '.gitignore'), 'utf8')).includes('node_modules/'));

        const firstCommit = execFileSync('git', ['-C', workspaceRoot, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
        const secondArchive = await create_workspace_archive(workspaceRoot);
        const secondCommit = execFileSync('git', ['-C', workspaceRoot, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
        assert.equal(secondArchive.commitCreated, false);
        assert.equal(secondCommit, firstCommit);
    } finally {
        await fs.rm(workspaceRoot, { recursive: true, force: true });
    }
});

test('preserves an existing gitignore without replacing it', async () => {
    const workspaceRoot = await createGitWorkspace();
    const existingIgnore = 'custom-output/\n';
    try {
        await fs.writeFile(path.join(workspaceRoot, '.gitignore'), existingIgnore);
        await create_workspace_archive(workspaceRoot);
        assert.equal(await fs.readFile(path.join(workspaceRoot, '.gitignore'), 'utf8'), existingIgnore);
    } finally {
        await fs.rm(workspaceRoot, { recursive: true, force: true });
    }
});
