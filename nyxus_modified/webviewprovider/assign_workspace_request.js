/**
 * Client-side helper to request a workspace ID assignment from the Nyxus server via HTTP (or Socket.IO).
 * HTTP requests target the Express gateway endpoint: /ID/request_id
 */

const DEFAULT_ASSIGN_TIMEOUT_MS = 15000;
const ASSIGN_EVENT = 'assign_workspace_id';

/**
 * Sends an assignment request over HTTP POST to /ID/request_id (or via Socket.IO if a socket is passed).
 *
 * @param {string | import('socket.io-client').Socket} endpointOrSocket
 * @param {object} payload
 * @param {string} payload.userId
 * @param {string} payload.apiKey
 * @param {string} [payload.workspaceName]
 * @param {string} [payload.customName]
 * @param {string} [payload.description]
 * @param {string} [payload.workspaceId]
 * @param {string} [payload.serverUrl]
 * @param {number} [timeoutMs]
 * @returns {Promise<{ ok: true, workspace_id: string }>}
 */
async function requestWorkspaceIdAssignment(endpointOrSocket, payload, timeoutMs = DEFAULT_ASSIGN_TIMEOUT_MS) {
    if (!payload?.apiKey) {
        throw new Error('API key is not configured in settings.');
    }

    const userId = payload.userId || '123';

    // If a Socket.IO socket object is explicitly passed (e.g. from existing unit test mocks)
    if (endpointOrSocket && typeof endpointOrSocket.emit === 'function') {
        return new Promise((resolve, reject) => {
            if (!endpointOrSocket.connected) {
                return reject(new Error('Nyxus socket is not connected. Check server URL and connection.'));
            }

            let timer;
            const cleanup = () => {
                if (timer) {
                    clearTimeout(timer);
                    timer = null;
                }
            };

            timer = setTimeout(() => {
                cleanup();
                reject(new Error(`Workspace ID request timed out after ${Math.round(timeoutMs / 1000)}s.`));
            }, timeoutMs);

            const requestData = {
                apiKey: payload.apiKey,
                apikey: payload.apiKey,
                user_id: userId,
                userId: userId,
                workspace_name: payload.customName || payload.workspaceName || '',
                custom_name: payload.customName || payload.workspaceName || '',
                description: payload.description || ''
            };

            if (payload.workspaceId) {
                requestData.workspace_id = payload.workspaceId;
            }

            try {
                endpointOrSocket.emit(ASSIGN_EVENT, requestData, (response) => {
                    cleanup();
                    if (!response || typeof response !== 'object') {
                        return reject(new Error('Invalid or empty response received from Nyxus server.'));
                    }
                    if (response.ok === true && typeof response.workspace_id === 'string' && response.workspace_id.trim()) {
                        return resolve({
                            ok: true,
                            workspace_id: response.workspace_id.trim()
                        });
                    }
                    const errorMessage = typeof response.error === 'string' && response.error.trim()
                        ? response.error.trim()
                        : 'Server rejected workspace ID assignment.';
                    return reject(new Error(errorMessage));
                });
            } catch (emitError) {
                cleanup();
                reject(emitError);
            }
        });
    }

    // Default: Perform HTTP POST request to /ID/request_id
    return requestWorkspaceIdHttp(endpointOrSocket, payload, timeoutMs);
}

/**
 * Performs an HTTP POST request to assign a workspace ID.
 *
 * @param {string | object} endpoint
 * @param {object} payload
 * @param {number} [timeoutMs]
 * @returns {Promise<{ ok: true, workspace_id: string }>}
 */
async function requestWorkspaceIdHttp(endpoint, payload, timeoutMs = DEFAULT_ASSIGN_TIMEOUT_MS) {
    const rawUrl = typeof endpoint === 'string' ? endpoint : (payload?.serverUrl || 'http://localhost:80');
    const baseUrl = rawUrl.replace(/\/+$/, '');
    console.log(rawUrl)
    const url = `${baseUrl}/ID/request_id`;
    const userId = payload?.userId || '123';
    const apiKey = payload?.apiKey || '';

    if (!apiKey) {
        throw new Error('API key is not configured in settings.');
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let response;
    let rawText;
    try {
        response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-user-id': userId,
                'x-api-key': apiKey
            },
            body: JSON.stringify({
                user_id: userId,
                userId: userId,
                api_key: apiKey,
                apiKey: apiKey,
                workspace_name: payload.customName || payload.workspaceName || '',
                custom_name: payload.customName || payload.workspaceName || '',
                description: payload.description || '',
                workspace_id: payload.workspaceId
            }),
            signal: controller.signal
        });
        rawText = await response.text();
    } catch (error) {
        if (controller.signal.aborted) {
            throw new Error(`Workspace ID request timed out after ${Math.round(timeoutMs / 1000)}s.`);
        }
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Could not reach Nyxus server at ${url}: ${message}`);
    } finally {
        clearTimeout(timer);
    }

    let data;
    try {
        data = JSON.parse(rawText);
    } catch {
        // Non-JSON response
    }

    if (response.ok && data?.ok === true && typeof data.workspace_id === 'string' && data.workspace_id.trim()) {
        return {
            ok: true,
            workspace_id: data.workspace_id.trim()
        };
    }

    const errorMessage = typeof data?.error === 'string' && data.error.trim()
        ? data.error.trim()
        : `Server returned HTTP ${response.status}: ${rawText.slice(0, 150)}`;
    throw new Error(errorMessage);
}

module.exports = {
    requestWorkspaceIdAssignment,
    requestWorkspaceIdHttp,
    ASSIGN_EVENT,
    DEFAULT_ASSIGN_TIMEOUT_MS
};
