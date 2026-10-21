/**
 * Helper to manage workspace ID persistence using ExtensionContext.globalState.
 * Keys are namespaced by the workspace folder URI string.
 */

const STORAGE_PREFIX = 'nyxusReplica.workspaceId:';

/**
 * Derives a storage key for a folder URI.
 * @param {import('vscode').Uri | string} folderUri
 * @returns {string}
 */
function getWorkspaceStorageKey(folderUri) {
    const uriStr = typeof folderUri === 'string' ? folderUri : folderUri.toString();
    return `${STORAGE_PREFIX}${uriStr}`;
}

/**
 * Retrieves the stored workspace ID for a folder URI.
 * @param {import('vscode').ExtensionContext} context
 * @param {import('vscode').Uri | string} folderUri
 * @returns {string | undefined}
 */
function getStoredWorkspaceId(context, folderUri) {
    if (!context || !folderUri) {
        return undefined;
    }
    const key = getWorkspaceStorageKey(folderUri);
    const value = context.globalState.get(key);
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

/**
 * Saves a workspace ID for a folder URI in extension persistent globalState.
 * @param {import('vscode').ExtensionContext} context
 * @param {import('vscode').Uri | string} folderUri
 * @param {string} workspaceId
 * @returns {Promise<boolean>}
 */
async function saveStoredWorkspaceId(context, folderUri, workspaceId) {
    if (!context || !folderUri || typeof workspaceId !== 'string' || !workspaceId.trim()) {
        throw new Error('Invalid arguments for saving workspace ID.');
    }
    const key = getWorkspaceStorageKey(folderUri);
    await context.globalState.update(key, workspaceId.trim());
    return true;
}

/**
 * Removes the stored workspace ID for a folder URI.
 * @param {import('vscode').ExtensionContext} context
 * @param {import('vscode').Uri | string} folderUri
 * @returns {Promise<void>}
 */
async function clearStoredWorkspaceId(context, folderUri) {
    if (!context || !folderUri) {
        return;
    }
    const key = getWorkspaceStorageKey(folderUri);
    await context.globalState.update(key, undefined);
}

const META_PREFIX = 'nyxusReplica.workspaceMeta:';

function getWorkspaceMetaStorageKey(folderUri) {
    const uriStr = typeof folderUri === 'string' ? folderUri : folderUri.toString();
    return `${META_PREFIX}${uriStr}`;
}

/**
 * Retrieves the stored workspace metadata (customName, description, staged) for a folder URI.
 * @param {import('vscode').ExtensionContext} context
 * @param {import('vscode').Uri | string} folderUri
 * @returns {{ customName: string, description: string, staged: boolean }}
 */
function getStoredWorkspaceMeta(context, folderUri) {
    if (!context || !folderUri) {
        return { customName: '', description: '', staged: false };
    }
    const key = getWorkspaceMetaStorageKey(folderUri);
    const meta = context.globalState.get(key) || {};
    return {
        customName: typeof meta.customName === 'string' ? meta.customName : '',
        description: typeof meta.description === 'string' ? meta.description : '',
        staged: Boolean(meta.staged)
    };
}

/**
 * Saves workspace metadata (customName, description, staged) for a folder URI.
 * @param {import('vscode').ExtensionContext} context
 * @param {import('vscode').Uri | string} folderUri
 * @param {{ customName?: string, description?: string, staged?: boolean }} meta
 * @returns {Promise<boolean>}
 */
async function saveStoredWorkspaceMeta(context, folderUri, meta) {
    if (!context || !folderUri) {
        throw new Error('Invalid arguments for saving workspace metadata.');
    }
    const key = getWorkspaceMetaStorageKey(folderUri);
    const existing = getStoredWorkspaceMeta(context, folderUri);
    await context.globalState.update(key, {
        customName: typeof meta?.customName === 'string' ? meta.customName.trim() : existing.customName,
        description: typeof meta?.description === 'string' ? meta.description.trim() : existing.description,
        staged: meta && meta.staged !== undefined ? Boolean(meta.staged) : existing.staged
    });
    return true;
}

function getStoredWorkspaceStaged(context, folderUri) {
    return getStoredWorkspaceMeta(context, folderUri).staged;
}

async function setStoredWorkspaceStaged(context, folderUri, staged) {
    const meta = getStoredWorkspaceMeta(context, folderUri);
    return saveStoredWorkspaceMeta(context, folderUri, { ...meta, staged: Boolean(staged) });
}

module.exports = {
    getWorkspaceStorageKey,
    getStoredWorkspaceId,
    saveStoredWorkspaceId,
    clearStoredWorkspaceId,
    getStoredWorkspaceMeta,
    saveStoredWorkspaceMeta,
    getStoredWorkspaceStaged,
    setStoredWorkspaceStaged
};

