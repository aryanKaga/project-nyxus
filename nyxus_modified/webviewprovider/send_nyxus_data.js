const vscode = require('vscode');

const UPLOAD_TIMEOUT_MS = 120000;

/**
 * @param {(event: string) => void} logFlow
 * @param {{ archive: Buffer, fileCount: number, workspaceName: string }} workspaceData
 * @returns {Promise<{ fileCount: number, workspaceName: string, apiKey: string }>}
 */
async function send_workspace_data(logFlow, workspaceData, context) {
    if (!Buffer.isBuffer(workspaceData?.archive)) {
        throw new Error('The workspace archive has not been prepared.');
    }

    const config = vscode.workspace.getConfiguration('nyxusReplica');
    const apiKey = await require('./api_key_storage').getApiKey(context);
    if (!apiKey) {
        throw new Error('apiKey not configured');
    }

    const baseUrl = (config.get('url') || 'http://localhost:80').replace(/\/+$/, '');
    const uploadUrl = baseUrl + '/upload';

    const userId = await require('./user_id_storage').getUserId(context);
    let workspaceId = workspaceData?.workspace_id || workspaceData?.workspaceId || '';
    if (!workspaceId) {
        const folderUri = vscode.workspace.workspaceFolders?.[0]?.uri;
        if (folderUri && context) {
            const { getStoredWorkspaceId } = require('./workspace_storage');
            workspaceId = getStoredWorkspaceId(context, folderUri) || '';
        }
    }

    logFlow('request.workspace_archive');

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.min(config.get('requestTimeout', UPLOAD_TIMEOUT_MS), UPLOAD_TIMEOUT_MS));

    let response;
    let rawBody;
    try {
        response = await fetch(uploadUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-user-id': userId,
                'x-api-key': apiKey,
                'x-workspace-id': workspaceId
            },
            body: JSON.stringify({
                user_id: userId,
                userId: userId,
                api_key: apiKey,
                apiKey: apiKey,
                workspace_id: workspaceId,
                workspaceId: workspaceId,
                workspace_name: workspaceData.workspaceName || '',
                workspaceName: workspaceData.workspaceName || '',
                custom_name: workspaceData.customName || workspaceData.workspaceName || '',
                customName: workspaceData.customName || workspaceData.workspaceName || '',
                description: workspaceData.description || '',
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
        if (/workspace\s+id\s+already\s+exists/i.test(detail)) {
            throw new Error('This folder’s Workspace ID is already in use on the Nyxus server. In Settings, clear this folder’s Workspace ID, request a new ID, then retry the Git transfer.');
        }
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
