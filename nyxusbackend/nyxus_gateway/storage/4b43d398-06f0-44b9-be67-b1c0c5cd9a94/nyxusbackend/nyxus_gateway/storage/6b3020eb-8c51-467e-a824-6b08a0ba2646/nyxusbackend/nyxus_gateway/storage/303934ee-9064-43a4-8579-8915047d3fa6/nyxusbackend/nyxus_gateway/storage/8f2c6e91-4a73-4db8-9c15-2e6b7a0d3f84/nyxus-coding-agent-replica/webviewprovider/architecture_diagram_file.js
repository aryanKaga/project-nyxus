const fs = require('fs');
const path = require('path');

const MAX_DIAGRAM_BYTES = 2 * 1024 * 1024;

function openArchitectureDiagramPreview(vscode, title, html) {
    const secureHtml = html.replace(
        /<head(\s[^>]*)?>/i,
        (head) => `${head}<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:">`
    );
    if (secureHtml === html) {
        throw new Error('The diagram document has no head element.');
    }

    const panel = vscode.window.createWebviewPanel(
        'nyxusArchitectureDiagram',
        title.slice(0, 100) || 'Repository architecture',
        vscode.ViewColumn.Beside,
        {
            enableScripts: false,
            localResourceRoots: []
        }
    );
    panel.webview.html = secureHtml;
    panel.reveal(vscode.ViewColumn.Beside, false);
    return panel;
}

async function saveArchitectureDiagram(workspaceRoot, filename, html) {
    if (!/^[a-zA-Z0-9_-]+\.html$/.test(filename)) {
        throw new Error('Invalid diagram filename.');
    }
    if (
        typeof html !== 'string'
        || Buffer.byteLength(html, 'utf8') > MAX_DIAGRAM_BYTES
    ) {
        throw new Error('Invalid or oversized architecture HTML.');
    }

    const resolvedWorkspace = await fs.promises.realpath(workspaceRoot);
    const diagramDirectory = path.join(
        resolvedWorkspace,
        '.nyxus',
        'architecture-diagrams'
    );
    await fs.promises.mkdir(diagramDirectory, { recursive: true });

    const resolvedDirectory = await fs.promises.realpath(diagramDirectory);
    const relativeDirectory = path.relative(resolvedWorkspace, resolvedDirectory);
    if (
        !relativeDirectory
        || relativeDirectory === '..'
        || relativeDirectory.startsWith(`..${path.sep}`)
        || path.isAbsolute(relativeDirectory)
    ) {
        throw new Error('The diagram directory resolves outside the workspace.');
    }

    const diagramPath = path.join(resolvedDirectory, filename);
    try {
        await fs.promises.writeFile(diagramPath, html, {
            encoding: 'utf8',
            flag: 'wx'
        });
    } catch (error) {
        if (error.code !== 'EEXIST') {
            throw error;
        }
        const existingStat = await fs.promises.lstat(diagramPath);
        if (!existingStat.isFile() || existingStat.isSymbolicLink()) {
            throw new Error('The existing diagram path is not a regular file.');
        }
        const existingHtml = await fs.promises.readFile(diagramPath, 'utf8');
        if (existingHtml !== html) {
            throw new Error('A different diagram already exists at this path.');
        }
    }

    const savedStat = await fs.promises.lstat(diagramPath);
    if (!savedStat.isFile() || savedStat.isSymbolicLink()) {
        throw new Error('The saved diagram is not a regular file.');
    }
    const savedHtml = await fs.promises.readFile(diagramPath, 'utf8');
    if (savedHtml !== html) {
        throw new Error('The saved architecture HTML did not match the received data.');
    }

    return {
        diagramPath,
        bytes: savedStat.size
    };
}

module.exports = {
    saveArchitectureDiagram,
    openArchitectureDiagramPreview,
    MAX_DIAGRAM_BYTES
};
