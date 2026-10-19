/**
 * Client-side helper to request a workspace ID assignment from the Nyxus server over Socket.IO.
 * Isolated function so the backend team can easily inspect and align the protocol.
 */

const DEFAULT_ASSIGN_TIMEOUT_MS = 15000;
const ASSIGN_EVENT = 'assign_workspace_id';

/**
 * Sends an assignment request over the provided Socket.IO socket and awaits acknowledgement.
 *
 * @param {import('socket.io-client').Socket} socket
 * @param {object} payload
 * @param {string} payload.userId
 * @param {string} payload.apiKey
 * @param {string} payload.workspaceName
 * @param {number} [timeoutMs]
 * @returns {Promise<{ ok: true, workspace_id: string }>}
 */
function requestWorkspaceIdAssignment(socket, payload, timeoutMs = DEFAULT_ASSIGN_TIMEOUT_MS) {
    return new Promise((resolve, reject) => {
        if (!socket || !socket.connected) {
            return reject(new Error('Nyxus socket is not connected. Check server URL and connection.'));
        }

        if (!payload.apiKey) {
            return reject(new Error('API key is not configured in settings.'));
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
            user_id: payload.userId,
            apiKey: payload.apiKey,
            apikey: payload.apiKey,
            workspace_name: payload.workspaceName
        };

        try {
            socket.emit(ASSIGN_EVENT, requestData, (response) => {
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

module.exports = {
    requestWorkspaceIdAssignment,
    ASSIGN_EVENT,
    DEFAULT_ASSIGN_TIMEOUT_MS
};
