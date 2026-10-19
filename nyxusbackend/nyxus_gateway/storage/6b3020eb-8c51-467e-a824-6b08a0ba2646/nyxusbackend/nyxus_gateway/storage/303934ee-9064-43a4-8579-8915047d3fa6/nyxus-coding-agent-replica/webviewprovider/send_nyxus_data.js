const fs = require('fs');
const path = require('path');
const vscode = require('vscode');

function gather_folder_data() {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceRoot) {
        throw new Error('Open a workspace before sending workspace context.');
    }

    const dataDirectory = path.join(workspaceRoot, '.nyxus');
    const graphPath = path.join(dataDirectory, 'repo-mapping.json');
    const structurePath = path.join(dataDirectory, 'directory_structure.json');

    if (!fs.existsSync(graphPath) || !fs.existsSync(structurePath)) {
        throw new Error('Workspace context files are missing.');
    }
    const autoMemoryPath = path.join(workspaceRoot, 'nyxus_auto_memory.txt');
    if (!fs.existsSync(autoMemoryPath)) {
        fs.writeFileSync(autoMemoryPath, '', 'utf8');
    }
    const autoMemoryContent = fs.readFileSync(autoMemoryPath, 'utf8');  
    return {
        graph_data: fs.readFileSync(graphPath, 'utf8'),
        folder_structure_data: fs.readFileSync(structurePath, 'utf8'),
        auto_memory: autoMemoryContent
    };
}
/**
 * 
 * @param {*} socket 
 * @param {*} logFlow 
 */
function send_init_data(socket, logFlow) {
    const codeData = gather_folder_data();
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    const apiKey = vscode.workspace.getConfiguration('nyxusReplica').get('apiKey');
    
    logFlow('request.handle_folder_data');
    socket.emit('handle_folder_data', {
        apiKey,
        graph_data: codeData.graph_data,
        folder_structure_data: codeData.folder_structure_data,
        root_dir: workspaceRoot,
        auto_memory:codeData.auto_memory
    });
}

module.exports = { send_init_data, gather_folder_data };
