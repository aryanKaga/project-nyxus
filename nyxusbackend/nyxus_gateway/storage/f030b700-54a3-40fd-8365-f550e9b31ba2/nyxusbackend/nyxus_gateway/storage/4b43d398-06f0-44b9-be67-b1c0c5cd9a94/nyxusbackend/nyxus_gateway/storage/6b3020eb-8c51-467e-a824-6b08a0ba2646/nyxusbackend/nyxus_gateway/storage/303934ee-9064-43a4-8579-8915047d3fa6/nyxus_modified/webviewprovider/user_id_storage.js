const vscode = require('vscode');

const SECRET_KEY = 'nyxusReplica.userId';
const DEFAULT_USER_ID = '123';

/**
 * Retrieves the stored user ID, checking SecretStorage, configuration, or falling back to static '123'.
 *
 * @param {import('vscode').ExtensionContext} [context]
 * @returns {Promise<string>}
 */
async function getUserId(context) {
    if (context?.secrets) {
        try {
            const fromSecrets = await context.secrets.get(SECRET_KEY);
            if (typeof fromSecrets === 'string' && fromSecrets.trim()) {
                return fromSecrets.trim();
            }
        } catch {
            // Ignore secret retrieval error
        }
    }

    try {
        const config = vscode.workspace.getConfiguration('nyxusReplica');
        const fromConfig = config.get('userId');
        if (typeof fromConfig === 'string' && fromConfig.trim()) {
            return fromConfig.trim();
        }
    } catch {
        // Outside VS Code host
    }

    return DEFAULT_USER_ID;
}

/**
 * Stores the user ID in both SecretStorage and VS Code configuration.
 *
 * @param {import('vscode').ExtensionContext} [context]
 * @param {string} userId
 * @returns {Promise<boolean>}
 */
async function setUserId(context, userId) {
    const id = typeof userId === 'string' && userId.trim() ? userId.trim() : DEFAULT_USER_ID;

    if (context?.secrets) {
        try {
            await context.secrets.store(SECRET_KEY, id);
        } catch {
            // Ignore secret storage error
        }
    }

    try {
        const config = vscode.workspace.getConfiguration('nyxusReplica');
        await config.update('userId', id, vscode.ConfigurationTarget.Global);
    } catch {
        // Ignore outside VS Code host
    }

    return true;
}

module.exports = {
    SECRET_KEY,
    DEFAULT_USER_ID,
    getUserId,
    setUserId
};
