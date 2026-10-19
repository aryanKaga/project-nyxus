const vscode = require('vscode');

/**
 * @param {import('socket.io-client').Socket} socket
 * @param {(event: string) => void} logFlow
 * @param {{ archive: Buffer, fileCount: number, workspaceName: string }} workspaceData
 * @returns {Promise<{ fileCount: number, workspaceName: string,apiKey:string}>}
 */
async function send_workspace_data(socket, logFlow, workspaceData) {
    if (!Buffer.isBuffer(workspaceData?.archive)) {
        throw new Error('The workspace archive has not been prepared.');
    }
    
    const apiKey = vscode.workspace.getConfiguration('nyxusReplica').get('apiKey');
    logFlow('request.workspace_archive');
    const response = await new Promise((resolve, reject) => {
        socket.timeout(120000).emit('workspace_archive', {
            apiKey,
            workspace_name: workspaceData.workspaceName,
            archive: workspaceData.archive
        }, (timeoutError, result) => {
            if (timeoutError) {
                reject(new Error('The server did not acknowledge the workspace archive in time.'));
                return;
            }
            if (!result || result.ok !== true) {
                reject(new Error(
                    typeof result?.error === 'string'
                        ? result.error
                        : 'The Nyxus server did not confirm the workspace archive.'
                ));
                return;
            }
            resolve(result);
        });
    });

    if (!Number.isInteger(response.file_count) || response.file_count < 0) {
        throw new Error('The Nyxus server returned an invalid archive receipt.');
    }
    if(!apiKey){
        throw new Error('apiKey not configured')
    }
    logFlow('response.workspace_archive.received');
    return {
        fileCount: response.file_count,
        workspaceName: workspaceData.workspaceName,
        apiKey:apiKey
    };
}

module.exports = { send_workspace_data };
