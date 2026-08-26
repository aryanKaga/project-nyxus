const fs = require('fs');
const path = require('path');
const vscode = require('vscode');

const IGNORE_FOLDERS = new Set([
    'node_modules', '.git', '.vscode', 'dist', 'build', '.next',
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
 * @returns {(string|Object)[]} array of children for dirPath
 */
function buildChildren(dirPath) {
    let entries;

    try {
        entries = fs.readdirSync(dirPath, { withFileTypes: true });
    } catch (err) {
        console.error(`Failed to read ${dirPath}:`, err);
        return [];
    }

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
            children.push({ [entry.name]: buildChildren(fullPath) });
        } else {
            children.push(entry.name);
        }
    }

    return children;
}

function build_directory() {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceRoot) {
        return;
    }

    const graphdir = path.join(workspaceRoot, '.nyxus');
    if (!fs.existsSync(graphdir)) {
        fs.mkdirSync(graphdir, { recursive: true });
    }

    const tree = { [path.basename(workspaceRoot)]: buildChildren(workspaceRoot) };

    fs.writeFileSync(
        path.join(graphdir, 'directory_structure.json'),
        JSON.stringify(tree)
    );
}

module.exports = {
    build_directory
};