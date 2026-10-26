const fs = require('node:fs');
const path = require('node:path');

const MAX_ANSWER_BYTES = 2 * 1024 * 1024;

function sanitizeMermaid(text) {
    if (typeof text !== 'string' || !text.includes('```mermaid')) return text;
    return text.replace(/```mermaid([\s\S]*?)```/g, (match, code) => {
        // Strip quotes inside edge pipes: | "something" | -> |something|
        let cleaned = code.replace(/(\|)\s*["']\s*(.*?)\s*["']\s*(\|)/g, '$1$2$3');
        // Replace & inside edge pipes with "and"
        cleaned = cleaned.replace(/(\|)([^|\n]*?)(\|)/g, (m, p1, inner, p2) => {
            return p1 + inner.replace(/&/g, 'and') + p2;
        });
        return '```mermaid' + cleaned + '```';
    });
}

async function saveAnswerMarkdown(workspaceRoot, filename, rawMarkdown) {
    const markdown = sanitizeMermaid(rawMarkdown);
    if (
        filename !== 'answer.md'
        || typeof markdown !== 'string'
        || Buffer.byteLength(markdown, 'utf8') > MAX_ANSWER_BYTES
    ) {
        throw new Error('Invalid or oversized README answer.');
    }

    const realWorkspaceRoot = await fs.promises.realpath(workspaceRoot);
    const answerPath = path.join(realWorkspaceRoot, filename);
    const relativePath = path.relative(realWorkspaceRoot, answerPath);
    if (!relativePath || relativePath.startsWith(`..${path.sep}`) || path.isAbsolute(relativePath)) {
        throw new Error('README answer path is outside the workspace.');
    }

    try {
        const existing = await fs.promises.lstat(answerPath);
        if (existing.isSymbolicLink() || !existing.isFile()) {
            throw new Error('The README answer path must be a regular file.');
        }
    } catch (error) {
        if (error.code !== 'ENOENT') {
            throw error;
        }
    }

    const handle = await fs.promises.open(
        answerPath,
        fs.constants.O_WRONLY
            | fs.constants.O_CREAT
            | fs.constants.O_TRUNC
            | (fs.constants.O_NOFOLLOW || 0),
        0o600
    );
    try {
        await handle.writeFile(markdown, 'utf8');
    } finally {
        await handle.close();
    }

    const savedMarkdown = await fs.promises.readFile(answerPath, 'utf8');
    if (savedMarkdown !== markdown) {
        throw new Error('The saved README answer did not match the generated Markdown.');
    }
    return { answerPath, bytes: Buffer.byteLength(markdown, 'utf8') };
}

function openAnswerMarkdownPreview(vscode, answerPath) {
    return vscode.commands.executeCommand(
        'markdown.showPreview',
        vscode.Uri.file(answerPath)
    );
}

module.exports = {
    MAX_ANSWER_BYTES,
    openAnswerMarkdownPreview,
    saveAnswerMarkdown
};
