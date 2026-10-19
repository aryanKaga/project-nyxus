const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { afterEach, test } = require('node:test');

const {
    openAnswerMarkdownPreview,
    saveAnswerMarkdown
} = require('../../webviewprovider/answer_markdown_file');

const temporaryDirectories = [];

async function makeWorkspace() {
    const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'nyxus-answer-'));
    temporaryDirectories.push(workspace);
    return workspace;
}

afterEach(async () => {
    await Promise.all(
        temporaryDirectories.splice(0).map((directory) =>
            fs.rm(directory, { recursive: true, force: true })
        )
    );
});

test('writes and verifies answer.md in the active workspace root', async () => {
    const workspace = await makeWorkspace();
    const markdown = '# Answer\n\nA **rendered** response.';

    const saved = await saveAnswerMarkdown(workspace, 'answer.md', markdown);

    assert.equal(saved.answerPath, path.join(workspace, 'answer.md'));
    assert.equal(saved.bytes, Buffer.byteLength(markdown, 'utf8'));
    assert.equal(await fs.readFile(saved.answerPath, 'utf8'), markdown);
});

test('rejects unexpected filenames, oversized content, and symlink targets', async () => {
    const workspace = await makeWorkspace();
    await assert.rejects(
        saveAnswerMarkdown(workspace, '../outside.md', 'answer'),
        /Invalid or oversized/
    );
    await assert.rejects(
        saveAnswerMarkdown(workspace, 'answer.md', 'x'.repeat(2 * 1024 * 1024 + 1)),
        /Invalid or oversized/
    );

    const outside = await makeWorkspace();
    const outsidePath = path.join(outside, 'outside.md');
    await fs.writeFile(outsidePath, 'outside');
    await fs.symlink(outsidePath, path.join(workspace, 'answer.md'));
    await assert.rejects(
        saveAnswerMarkdown(workspace, 'answer.md', 'replacement'),
        /regular file|symbolic link|ELOOP/
    );
    assert.equal(await fs.readFile(outsidePath, 'utf8'), 'outside');
});

test('opens the saved file in VS Code Markdown Preview', async () => {
    let command;
    let uri;
    const vscode = {
        Uri: { file: (filePath) => ({ fsPath: filePath }) },
        commands: {
            executeCommand(...args) {
                [command, uri] = args;
                return Promise.resolve();
            }
        }
    };

    await openAnswerMarkdownPreview(vscode, '/workspace/answer.md');

    assert.equal(command, 'markdown.showPreview');
    assert.deepEqual(uri, { fsPath: '/workspace/answer.md' });
});
