const { get_file_content } = require('./helper_functions/get_file_content');
const vscode = require('vscode');
const { io } = require('socket.io-client');
const fs = require('fs');
const path = require('path');
/**
 * 
 * @param {*} webview 
 * @param {*} logFlow 
 * @returns 
 */
async function createWebSocket(webview, logFlow, context) {
    const { getApiKey } = require('./api_key_storage');
    const config = vscode.workspace.getConfiguration('nyxusReplica');
    logFlow(`socket.init url=${config.get('url')}`);
    const socket = io(config.get('url'), {
        auth: {
            apiKey: await getApiKey(context)
        },
        timeout: config.get('connectionTimeout', 15000),
        reconnectionDelay: config.get('reconnectionDelay', 1000)
    });
    /**
     * 
     * @param {*} message 
     */
    const postMessage = (message) => {
        try {
            Promise.resolve(webview.postMessage(message)).then((sent) => {
                if (!sent) {
                    logFlow('webview.message.delivery_failed');
                }
            }).catch(() => logFlow('webview.message.delivery_failed'));
        } catch {
            logFlow('webview.message.delivery_failed');
        }
    };

    socket.on('connect', () => {
        logFlow('socket.connected');
        postMessage({ type: 'connection_status', status: 'connected' });
    });

    socket.on('disconnect', () => {
        logFlow('socket.disconnected');
        postMessage({
            type: 'connection_status',
            status: 'disconnected',
            text: 'Connection lost. Reconnecting…'
        });
    });

    socket.on('connect_error', () => {
        logFlow('socket.connect_error');
        postMessage({
            type: 'connection_status',
            status: 'disconnected',
            text: 'Cannot reach Nyxus. Check the server URL and connection.'
        });
    });

    socket.on('assistant_start', () => {
        logFlow('receive.assistant_start');
        postMessage({ type: 'assistant_start' });
    });

    socket.on('assistant_chunk', (data) => {
        if (typeof data?.token !== 'string') {
            logFlow('receive.assistant_chunk.invalid');
            return;
        }
        postMessage({ type: 'assistant_chunk', text: data.token });
    });

    socket.on('assistant_end', () => {
        logFlow('receive.assistant_end');
        postMessage({ type: 'assistant_end' });
    });

    socket.on('assistant_error', (data) => {
        logFlow('receive.assistant_error');
        postMessage({
            type: 'assistant_error',
            error: typeof data?.error === 'string' ? data.error : 'The Nyxus server returned an error.'
        });
    });

    socket.on('chat_error', (data) => {
        logFlow('receive.chat_error');
        postMessage({
            type: 'assistant_error',
            error: typeof data?.error === 'string' ? data.error : 'The Nyxus server returned an error.'
        });
    });

    socket.on('codebase_agent_complete', (data) => {
        const response = typeof data?.response === 'string' ? data.response : '';
        logFlow('receive.codebase_agent_complete');

        try {
            const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
            if (!workspaceRoot) {
                logFlow('workspace.memory_write.skipped');
            } else {
                fs.writeFile(path.join(workspaceRoot, 'nyxus_auto_memory.txt'), response, (error) => {
                    if (error) {
                        logFlow('workspace.memory_write.failed');
                    } else {
                        logFlow('workspace.memory_write.completed');
                    }
                });
            }
        } catch {
            logFlow('workspace.memory_write.failed');
        }

        postMessage({ type: 'codebase_agent_complete', text: response });
    });

    socket.on('get_file_content', async (data) => {
        const fileName = typeof data?.file_name === 'string' ? data.file_name : '';
        const requestId = data?.request_id;
        logFlow('receive.get_file_content');

        try {
            if (!fileName) {
                throw new Error('Invalid file request');
            }
            const fileData = await get_file_content(fileName);
            socket.emit('file_content_response', {
                request_id: requestId,
                response: fileData ? 'ok' : 'err',
                file_data: fileData || '',
                file_name: fileName
            });
            logFlow('request.file_content_response');
        } catch {
            logFlow('request.file_content_response.failed');
            socket.emit('file_content_response', {
                request_id: requestId,
                response: 'err'
            });
        }
    });

    return socket;
}

module.exports = { createWebSocket };
