const vscode = require('vscode');
const {io} = require('socket.io-client')

let socket =  null
/**
 * Fetches a streamed response from the backend and forwards each token
 * to the webview frontend.
 *  
 * @param {string} prompt
 * @param {vscode.Webview} webview
 * @returns {Promise<void>}
 */
async function fetchAgentResponse(prompt, webview) {
    const config = vscode.workspace.getConfiguration();
    const url = config.get('nyxus.url');
    const user_api = config.get('nyxus.apiKey')

    try {
        // Notify frontend to create an empty assistant message bubble.
        webview.postMessage({
            type: 'assistant_start'
        });

        const response = await fetch(url + '/chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                prompt: prompt,
                user_api:user_api
            })
        });

        if (!response.body) {
            throw new Error('No response body');
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
            const { value, done } = await reader.read();

            if (done) {
                break;
            }

            // Convert bytes to text and append to buffer.
            buffer += decoder.decode(value, { stream: true });

            // SSE events are separated by "\n\n".
            const events = buffer.split('\n\n');

            // Keep incomplete event in buffer.
            buffer = events.pop() || '';

            for (const event of events) {
                if (!event.startsWith('data:')) {
                    continue;
                }

                const data = event.replace(/^data:\s*/, '');

                // End-of-stream marker.
                if (data === '[DONE]') {
                    webview.postMessage({ type: 'assistant_end' });
                    return;
                }

                // Parse JSON payload and send token to frontend.
                const parsed = JSON.parse(data);
                console.log('[Nyxus] Received token:', parsed.token);
                webview.postMessage({
                    type: 'assistant_chunk',
                    text: parsed.token
                });
            }
        }

        // Final notification if stream ends without [DONE] marker.
        webview.postMessage({ type: 'assistant_end' });

    } catch (error) {
        webview.postMessage({
            type: 'assistant_chunk',
            text: '\n[Error: ' + error + ']'
        });
        webview.postMessage({ type: 'assistant_end' });
        console.error('[Nyxus] Error fetching agent response:', error);
    }
}





module.exports = { fetchAgentResponse };