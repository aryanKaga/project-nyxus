const fs = require('fs')
const vscode = require('vscode')

/**
 * Finds a file in the workspace by its name (not full path) and returns its content.
 * If multiple files match, the first found is used (you can adjust this).
 *
 * @param {string} file_name - just the filename, e.g. "app.js" or "src/app.js" for a partial path
 * @returns {Promise<string|undefined>}
 */
async function get_file_content(file_name) {
    try {
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!workspaceRoot) {
            return ''
        }

        // Search for files matching the name anywhere in the workspace,
        // excluding common heavy/irrelevant folders.
        const matches = await vscode.workspace.findFiles(
            `**/${file_name}`,
            '**/node_modules/**'
        )

        if (!matches || matches.length === 0) {
            console.error('[Nyxus] No file found matching:', file_name)
            return ''
        }

        // Pick the first match (or add your own logic to disambiguate)
        const absolute_path = matches[0].fsPath

        // Safety check: ensure resolved path is still inside the workspace
        if (!absolute_path.startsWith(workspaceRoot)) {
            console.error('[Nyxus] Attempt to access file outside workspace:', absolute_path)
            return ''
        }

        const content = fs.readFileSync(absolute_path, 'utf-8')
        return content

    }
    catch (err) {
        console.log(err)
        return ''
    }
}

async function get_nyxus_auto_memory() {
    const content = await get_file_content('nyxus_auto_memory.txt')
    return content
}

module.exports = { get_file_content, get_nyxus_auto_memory }