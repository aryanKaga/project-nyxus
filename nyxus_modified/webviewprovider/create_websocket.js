const { get_file_content } = require('./helper_functions/get_file_content');
const vscode = require('vscode');
const { io } = require('socket.io-client');
const fs = require('fs');
const path = require('path');

/**
 * 
 * @param {*} webview 
 * @param {*} logFlow 
 * @param {*} context 
 * @param {*} onArchitectureDiagram 
 * @param {*} onReadmeAnswer 
 * @returns 
 */
async function createWebSocket(webview, logFlow, context, onArchitectureDiagram, onReadmeAnswer) {
    const { getApiKey } = require('./api_key_storage');
    const { getUserId } = require('./user_id_storage');
    const config = vscode.workspace.getConfiguration('nyxusReplica');
    const apiKey = await getApiKey(context);
    const userId = await getUserId(context);
    logFlow(`socket.init url=${config.get('url')}`);
    const socket = io(config.get('url'), {
        auth: {
            apiKey,
            apikey: apiKey,
            userId,
            user_id: userId
        },
        timeout: config.get('connectionTimeout', 15000),
        reconnectionDelay: config.get('reconnectionDelay', 1000)
    });

    /**
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

    socket.on('server_ping', (data) => {
        logFlow('receive.server_ping');
        postMessage({ type: 'server_ping', data });
    });

    socket.on('ping', (data) => {
        logFlow('receive.server_ping');
        postMessage({ type: 'server_ping', data });
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

    socket.on('assistant_progress', (data) => {
        postMessage({
            type: 'assistant_progress',
            message: typeof data?.message === 'string'
                ? data.message
                : 'Still working on your request…'
        });
    });

    socket.on('architecture_diagram', (data) => {
        if (
            typeof data?.filename !== 'string'
            || typeof data?.title !== 'string'
            || typeof data?.html !== 'string'
        ) {
            logFlow('receive.architecture_diagram.invalid');
            return;
        }
        logFlow('receive.architecture_diagram');
        if (typeof onArchitectureDiagram === 'function') {
            Promise.resolve().then(() => onArchitectureDiagram(data)).catch(() => {
                logFlow('architecture_diagram.open.failed');
                postMessage({
                    type: 'initialization_error',
                    text: 'The architecture HTML reached VS Code but could not be saved or opened.'
                });
            });
        }
    });

    socket.on('readme_answer', (data) => {
        if (data?.filename !== 'answer.md' || typeof data.markdown !== 'string') {
            logFlow('receive.readme_answer.invalid');
            return;
        }
        logFlow('receive.readme_answer');
        postMessage({
            type: 'readme_answer',
            filename: data.filename,
            markdown: data.markdown
        });
        if (typeof onReadmeAnswer === 'function') {
            Promise.resolve().then(() => onReadmeAnswer(data)).catch((err) => {
                logFlow('readme_answer.open.failed');
                postMessage({
                    type: 'initialization_error',
                    text: `The README answer reached VS Code but could not be saved: ${err instanceof Error ? err.message : String(err)}`
                });
            });
        }
    });

    socket.on('assistant_end', () => {
        logFlow('receive.assistant_end');
        postMessage({ type: 'assistant_end' });
    });

    socket.on('agent_trace', (data) => {
        if (!Array.isArray(data?.trace)) {
            logFlow('receive.agent_trace.invalid');
            return;
        }
        logFlow('receive.agent_trace');
        postMessage({ type: 'agent_trace', trace: data.trace });
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
                file_name: fileName,
                user_id: userId,
                userId: userId
            });
            logFlow('request.file_content_response');
        } catch {
            logFlow('request.file_content_response.failed');
            socket.emit('file_content_response', {
                request_id: requestId,
                response: 'err',
                user_id: userId,
                userId: userId
            });
        }
    });

    return socket;
}

module.exports = { createWebSocket };
