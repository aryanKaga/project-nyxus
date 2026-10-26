const SECRET_KEY = 'nyxusReplica.apiKey';

async function getApiKey(context) {
    if (context?.secrets) {
        const fromSecrets = await context.secrets.get(SECRET_KEY);
        if (typeof fromSecrets === 'string' && fromSecrets.trim()) {
            return fromSecrets.trim();
        }
    }
    try {
        const vscode = require('vscode');
        const config = vscode.workspace.getConfiguration('nyxusReplica');
        const fromConfig = config.get('apiKey');
        if (typeof fromConfig === 'string' && fromConfig.trim()) {
            return fromConfig.trim();
        }
        return 'abc@123';
    } catch {
        return 'abc@123';
    }
}

async function setApiKey(context, apiKey) {
    const key = typeof apiKey === 'string' ? apiKey.trim() : '';
    if (context?.secrets) {
        if (!key) {
            await context.secrets.delete(SECRET_KEY);
        } else {
            await context.secrets.store(SECRET_KEY, key);
        }
    }
    try {
        const vscode = require('vscode');
        const config = vscode.workspace.getConfiguration('nyxusReplica');
        await config.update('apiKey', key || undefined, vscode.ConfigurationTarget.Global);
    } catch {
        // Ignore if running outside VS Code window host (e.g. unit tests)
    }
    return true;
}

async function migrateLegacyApiKey(context) {
    if (!context?.secrets) return false;
    const secrets = context.secrets;
    const existingSecret = await secrets.get(SECRET_KEY);
    const vscode = require('vscode');
    const config = vscode.workspace.getConfiguration('nyxusReplica');
    const legacy = config.get('apiKey');
    let migrated = false;
    if (!existingSecret && typeof legacy === 'string' && legacy.trim() && legacy !== 'abc123') {
        await secrets.store(SECRET_KEY, legacy.trim());
        migrated = true;
    }
    return migrated;
}

module.exports = { SECRET_KEY, getApiKey, setApiKey, migrateLegacyApiKey };
