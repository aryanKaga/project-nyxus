const fs = require('fs');
const path = require('path');
const vscode = require('vscode');

const IGNORE_FOLDERS = new Set([
    'node_modules', '.git', '.vscode', '.nyxus', 'dist', 'build', '.next',
    'coverage', 'venv', 'env', '__pycache__', 'myenv', '.idea',
    '.pytest_cache', '.mypy_cache', 'out', 'target', '.turbo', '.cache'
]);

const IGNORE_FILES = new Set([
    'package.json', 'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml',
    '.DS_Store', '.gitignore', '.env', '.env.local', 'tsconfig.json',
    '.eslintrc', '.eslintrc.json', '.prettierrc'
]);

const IGNORE_EXTENSIONS = new Set(['.log', '.lock', '.map']);

/**
 * Recursively builds a compact directory tree.
 * Folders -> { name: [children] }
 * Files   -> "name" (bare string)
 *
 * @param {string} dirPath
 * @returns {Promise<(string|Object)[]>} array of children for dirPath
 */
async function buildChildren(dirPath) {
    const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
    const children = [];

    for (const entry of entries) {

        if (entry.isDirectory() && IGNORE_FOLDERS.has(entry.name)) {
            continue;
        }

        if (entry.isFile()) {
            if (IGNORE_FILES.has(entry.name)) continue;
            const ext = path.extname(entry.name);
            if (IGNORE_EXTENSIONS.has(ext)) continue;
        }

        const fullPath = path.join(dirPath, entry.name);

        if (entry.isDirectory()) {
            children.push({ [entry.name]: await buildChildren(fullPath) });
        } else {
            children.push(entry.name);
        }
    }

    return children;
}

async function build_directory() {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceRoot) {
        return;
    }

    const graphdir = path.join(workspaceRoot, '.nyxus');
    await fs.promises.mkdir(graphdir, { recursive: true });

    const tree = { [path.basename(workspaceRoot)]: await buildChildren(workspaceRoot) };

    await fs.promises.writeFile(
        path.join(graphdir, 'directory_structure.json'),
        JSON.stringify(tree)
    );
}

module.exports = {
    build_directory
};