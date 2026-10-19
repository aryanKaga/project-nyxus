const SECRET_KEY = 'nyxusReplica.apiKey';

async function getApiKey(context) {
    return context?.secrets ? (await context.secrets.get(SECRET_KEY)) || '' : '';
}

async function migrateLegacyApiKey(context) {
    if (!context?.secrets) return false;
    const secrets = context.secrets;
    const existingSecret = await secrets.get(SECRET_KEY);
    const legacy = require('vscode').workspace.getConfiguration('nyxusReplica').get('apiKey');
    const vscode = require('vscode');
    const config = vscode.workspace.getConfiguration('nyxusReplica');
    let migrated = false;
    if (!existingSecret && typeof legacy === 'string' && legacy.trim() && legacy !== 'abc123') {
        await secrets.store(SECRET_KEY, legacy.trim());
        migrated = true;
    }
    await config.update('apiKey', undefined, vscode.ConfigurationTarget.Global);
    await config.update('apiKey', undefined, vscode.ConfigurationTarget.Workspace);
    return migrated;
}

module.exports = { SECRET_KEY, getApiKey, migrateLegacyApiKey };
