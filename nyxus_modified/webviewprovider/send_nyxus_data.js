const vscode = require('vscode');

const UPLOAD_TIMEOUT_MS = 120000;

/**
 * @param {(event: string) => void} logFlow
 * @param {{ archive: Buffer, fileCount: number, workspaceName: string }} workspaceData
 * @returns {Promise<{ fileCount: number, workspaceName: string, apiKey: string }>}
 */
async function send_workspace_data(logFlow, workspaceData) {
    if (!Buffer.isBuffer(workspaceData?.archive)) {
        throw new Error('The workspace archive has not been prepared.');
    }

    const config = vscode.workspace.getConfiguration('nyxusReplica');
    const apiKey = config.get('apiKey');
    if (!apiKey) {
        throw new Error('apiKey not configured');
    }

    const uploadUrl = config.get('url') + '/upload';

    logFlow('request.workspace_archive');

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS);

    let response;
    let rawBody;
    try {
        response = await fetch(uploadUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                user_id:"123",/**this is only for testing pupose remove it in production scenarios */
                api_key: apiKey,
                workspace_id: workspaceData.workspaceName,
                archive: workspaceData.archive.toString('base64')
            }),
            signal: controller.signal
        });
        rawBody = await response.text();
    } catch (error) {
        if (controller.signal.aborted) {
            throw new Error('The server did not acknowledge the workspace archive in time.');
        }
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Could not reach the Nyxus server: ${message}`);
    } finally {
        clearTimeout(timer);
    }

    let data = null;
    try {
        data = JSON.parse(rawBody);
    } catch {
        // non-JSON response; handled below
    }

    if (!response.ok || !data || data.ok !== true) {
        const detail = typeof data?.error === 'string'
            ? data.error
            : `HTTP ${response.status}: ${rawBody.slice(0, 200)}`;
        throw new Error(`The Nyxus server did not confirm the workspace archive. ${detail}`);
    }

    if (!Number.isInteger(data.file_count) || data.file_count < 0) {
        throw new Error('The Nyxus server returned an invalid archive receipt.');
    }

    logFlow('response.workspace_archive.received');
    return {
        fileCount: data.file_count,
        workspaceName: workspaceData.workspaceName,
        apiKey
    };
}

module.exports = { send_workspace_data };