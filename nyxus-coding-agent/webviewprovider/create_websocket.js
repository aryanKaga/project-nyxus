// websocket.js
const {get_file_content} = require('./helper_functions/get_file_content')
const vscode  = require('vscode')
const { io } = require("socket.io-client");
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

    socket.on("assistant_chunk", (data) => {

        webview.postMessage({
            type: "assistant_chunk",
            text: data.token
        });

    });

    socket.on("assistant_end", () => {

        webview.postMessage({
            type: "assistant_end"
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