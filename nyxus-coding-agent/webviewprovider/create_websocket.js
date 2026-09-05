// websocket.js
const {get_file_content} = require('./helper_functions/get_file_content')
const vscode  = require('vscode')
const { io } = require("socket.io-client");
const fs = require('fs');
const path = require('path');
/**
 * 
 * @param {*} webview 
 * @returns 
 */


function createWebSocket(webview) {

    const config  = vscode.workspace.getConfiguration('nyxus')
    const url = config.get('url')
    const user_api  = config.get('apiKey')
    const socket = io(url,{
        auth: {
            apikey:user_api,
            userid:config.get('userId')
        }
    });
    console.log("[Nyxus] WebSocket created");
    socket.on("connect", () => {
        console.log("[Nyxus] Connected to server");
    });

    socket.on("connect_error", (error) => {
        console.error("[Nyxus] Connection error:", error.message);
    });


    socket.on("assistant_start", () => {
    webview.postMessage({
        type: "assistant_start"
        });
    });
    socket.on("assistant_chunk", (data) => {
    webview.postMessage({
        type: "assistant_chunk",
        text: data.token
        });
        console.log(data.token)
    });

    

    socket.on("assistant_end", () => {

        webview.postMessage({
            type: "assistant_end"
        });

    });

    socket.on("codebase_agent_complete", (data) => {
        console.log('[Nyxus] Codebase agent finished:', data.response);

        try {
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (workspaceFolders && workspaceFolders.length > 0) {
                const workspaceRoot = workspaceFolders[0].uri.fsPath;
                const memoryFilePath = path.join(workspaceRoot, 'nyxus_auto_memory.txt');

                fs.writeFile(memoryFilePath, data.response, (err) => {
                    if (err) {
                        console.error('[Nyxus] Failed to write nyxus_auto_memory.txt:', err);
                    } else {
                        console.log('[Nyxus] Wrote codebase context to nyxus_auto_memory.txt');
                    }
                });
            } else {
                console.error('[Nyxus] No workspace folder open, cannot write nyxus_auto_memory.txt');
            }
        } catch (err) {
            console.error('[Nyxus] Error writing nyxus_auto_memory.txt:', err);
        }

        webview.postMessage({
            type: "codebase_agent_complete",
            text: data.response
        });
    });

    socket.on('get_file_content', async (data) => {
    console.log('[Nyxus] Received request for file content:', data.file_name);
    const file_name = data.file_name;

    try {

        const file_data = await get_file_content(file_name);

        console.log('[Nyxus] Sending file content for:', file_name);

        socket.emit(
            'file_content_response',
            {
                request_id: data.request_id,
                response: 'ok',
                file_data: file_data,
                file_name: file_name
            }
        );
        console.log('file data for ',file_name,' sent')

    }
    catch (err) {

            socket.emit(
                'file_content_response',
                {
                    request_id: data.request_id,
                    response: 'err'
                }
            );

        }

    });
    
    return socket;
}

module.exports = { createWebSocket };