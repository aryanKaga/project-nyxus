const fs = require('fs');
const path = require('path');
const yazl = require('yazl');

const MAX_ARCHIVE_BYTES = 250 * 1024 * 1024;
const EXCLUDED_DIRECTORIES = new Set([
    '.git',
    '.nyxus',
    'node_modules',
    '.venv',
    'venv',
    '__pycache__',
    '.mypy_cache',
    '.pytest_cache',
    'dist',
    'build',
    'target'
]);

async function createWorkspaceArchive(workspaceRoot, fileUris) {
    const zip = new yazl.ZipFile();
    let totalBytes = 0;
    const chunks = [];

    for (const uri of fileUris) {
        const relativePath = path.relative(workspaceRoot, uri.fsPath);
        const basename = path.basename(relativePath);
        if (
            !relativePath
            || relativePath === '..'
            || relativePath.startsWith(`..${path.sep}`)
            || path.isAbsolute(relativePath)
            || relativePath.split(path.sep).some((part) => EXCLUDED_DIRECTORIES.has(part))
            || basename === '.env'
            || basename.startsWith('.env.')
            || basename.endsWith('.env')
        ) {
            continue;
        }
        const info = await fs.promises.lstat(uri.fsPath);
        if (!info.isFile()) {
            continue;
        }
        zip.addFile(
            uri.fsPath,
            relativePath.split(path.sep).join('/'),
            { mtime: info.mtime }
        );
    }

    return new Promise((resolve, reject) => {
        zip.outputStream.on('data', (chunk) => {
            totalBytes += chunk.length;
            if (totalBytes > MAX_ARCHIVE_BYTES) {
                zip.outputStream.destroy(
                    new Error('Workspace archive exceeds the 250 MB server limit.')
                );
                return;
            }
            chunks.push(chunk);
        });
        zip.outputStream.on('error', reject);
        zip.outputStream.on('end', () => resolve(Buffer.concat(chunks)));
        zip.end();
    });
}

module.exports = { createWorkspaceArchive, MAX_ARCHIVE_BYTES };
