const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { afterEach, test } = require('node:test');

const {
    saveArchitectureDiagram,
    openArchitectureDiagramPreview
} = require('../../webviewprovider/architecture_diagram_file');

const temporaryDirectories = [];

async function makeWorkspace() {
    const workspace = await fs.mkdtemp(
        path.join(os.tmpdir(), 'nyxus-architecture-diagram-')
    );
    temporaryDirectories.push(workspace);
    return workspace;
}

afterEach(async () => {
    await Promise.all(
        temporaryDirectories.splice(0).map((directory) =>
            fs.rm(directory, { recursive: true, force: true })
        )
    );
});

test('writes and verifies the diagram in the prescribed workspace folder', async () => {
    const workspace = await makeWorkspace();
    const html = '<!doctype html><html><head></head><body>Diagram</body></html>';

    const saved = await saveArchitectureDiagram(
        workspace,
        'architecture-diagram-test123.html',
        html
    );

    assert.equal(
        saved.diagramPath,
        path.join(
            workspace,
            '.nyxus',
            'architecture-diagrams',
            'architecture-diagram-test123.html'
        )
    );
    assert.equal(saved.bytes, Buffer.byteLength(html, 'utf8'));
    assert.equal(await fs.readFile(saved.diagramPath, 'utf8'), html);
});

test('accepts a repeated event only when the existing file matches', async () => {
    const workspace = await makeWorkspace();
    const filename = 'architecture-diagram-retry.html';
    const html = '<html><head></head><body>Same diagram</body></html>';

    const firstSave = await saveArchitectureDiagram(workspace, filename, html);
    const retrySave = await saveArchitectureDiagram(workspace, filename, html);

    assert.deepEqual(retrySave, firstSave);
    await assert.rejects(
        saveArchitectureDiagram(
            workspace,
            filename,
            '<html><head></head><body>Different diagram</body></html>'
        ),
        /different diagram already exists/
    );
});

test('rejects unsafe filenames and diagram-directory symlinks', async () => {
    const workspace = await makeWorkspace();
    await assert.rejects(
        saveArchitectureDiagram(workspace, '../outside.html', '<html></html>'),
        /Invalid diagram filename/
    );

    const outside = await makeWorkspace();
    await fs.mkdir(path.join(workspace, '.nyxus'), { recursive: true });
    await fs.symlink(
        outside,
        path.join(workspace, '.nyxus', 'architecture-diagrams')
    );
    await assert.rejects(
        saveArchitectureDiagram(workspace, 'architecture-diagram-safe.html', '<html></html>'),
        /outside the workspace/
    );
});

test('opens the saved HTML as a rendered VS Code webview beside the editor', () => {
    const html = '<!doctype html><html><head></head><body><h1>Architecture</h1></body></html>';
    let panelOptions;
    let panelTitle;
    let renderedHtml;
    let revealOptions;
    const panel = {
        webview: {},
        reveal(...args) {
            revealOptions = args;
        }
    };
    const vscode = {
        ViewColumn: { Beside: 2 },
        window: {
            createWebviewPanel(...args) {
                [, panelTitle, , panelOptions] = args;
                return panel;
            }
        }
    };
    Object.defineProperty(panel.webview, 'html', {
        set(value) {
            renderedHtml = value;
        }
    });

    const result = openArchitectureDiagramPreview(vscode, 'Architecture', html);

    assert.equal(result, panel);
    assert.equal(panelTitle, 'Architecture');
    assert.equal(panelOptions.enableScripts, false);
    assert.deepEqual(panelOptions.localResourceRoots, []);
    assert.deepEqual(revealOptions, [vscode.ViewColumn.Beside, false]);
    assert.match(renderedHtml, /<h1>Architecture<\/h1>/);
    assert.match(renderedHtml, /Content-Security-Policy/);
});
