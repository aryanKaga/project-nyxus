const vscode = require("vscode");
const fs = require("fs");
const path = require("path");

/**
 * @param {import('vscode').Uri[]} files
 */
async function waitForLanguageServer(files) {
    console.log("Waiting for language server...");
    const timeout = 60000;
    const start = Date.now();

    while (Date.now() - start < timeout) {
        for (const file of files.slice(0, 5)) {
            try {
                const symbols = await vscode.commands.executeCommand(
                    "vscode.executeDocumentSymbolProvider",
                    file
                );
                if (Array.isArray(symbols) && symbols.length > 0) {
                    console.log(`Language server ready: ${file.fsPath}`);
                    return true;
                }
            } catch (err) {
                console.log(err);
            }
        }
        await new Promise(resolve => setTimeout(resolve, 1000));
    }

    console.log("Language server readiness timeout");
    return false;
}

/**
 * @param {import('vscode').Uri} file
 * @param {Set<string>} fileSet
 */
async function extractImportsViaLSP(file, fileSet) {
    const doc = await vscode.workspace.openTextDocument(file);
    const text = doc.getText();
    const lines = text.split('\n');
    const resolved = new Set();
    const unresolved = [];

    const ext = file.fsPath.split('.').pop();
    const isPython = ext === 'py';

    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
        const line = lines[lineIndex];

        let moduleName = null;
        let charIndex = -1;

        if (isPython) {
            const m =
                line.match(/^\s*from\s+([\w.]+)/) ||
                line.match(/^\s*import\s+([\w.]+)/);

            if (m) {
                moduleName = m[1];
                charIndex = line.indexOf(moduleName);
            }
        } else {
            const fromMatch = line.match(
                /(?:import|export)[\s\S]*?from\s+['"]([^'"]+)['"]/
            );
            const requireMatch = line.match(
                /(?:require|import)\s*\(\s*['"]([^'"]+)['"]\s*\)/
            );

            const m = fromMatch || requireMatch;
            if (m) {
                moduleName = m[1];
                charIndex = line.indexOf(moduleName);
            }
        }

        if (!moduleName || charIndex === -1) continue;

        const position = new vscode.Position(lineIndex, charIndex);

        try {
            const definitions = await vscode.commands.executeCommand(
                'vscode.executeDefinitionProvider',
                file,
                position
            );

            if (Array.isArray(definitions) && definitions.length > 0) {
                for (const def of definitions) {
                    if (fileSet.has(def.uri.fsPath)) {
                        resolved.add(def.uri.fsPath);
                    }
                }
            } else {
                unresolved.push(line);
            }
        } catch (_) {
            unresolved.push(line);
        }
    }

    return { resolved, unresolved };
}

// ─── Regex fallback ───────────────────────────────────────────────

/**
 * @param {string} content
 * @param {string} filePath
 * @param {string} workspaceRoot
 * @returns {string[]}
 */
function extractImportsRegex(content, filePath, workspaceRoot) {
    const ext = path.extname(filePath);
    if (ext === '.py') {
        return extractPythonImports(content, filePath, workspaceRoot);
    }
    return extractJSImports(content, filePath);
}

/**
 * @param {string} content
 * @param {string} filePath
 * @returns {string[]}
 */
function extractJSImports(content, filePath) {
    const dir = path.dirname(filePath);
    const patterns = [
        /import\s+(?:type\s+)?(?:[\s\S]*?\s+from\s+)?['"]([^'"]+)['"]/g,
        /export\s+(?:type\s+)?(?:\*(?:\s+as\s+\w+)?\s+from\s+|\{[^}]*\}\s+from\s+)['"]([^'"]+)['"]/g,
        /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
        /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    ];

    const imports = new Set();
    for (const pattern of patterns) {
        let match;
        while ((match = pattern.exec(content)) !== null) {
            const importPath = match[1];
            if (!importPath.startsWith(".")) continue;
            const resolved = resolveJSImport(dir, importPath);
            if (resolved) imports.add(resolved);
        }
    }
    return [...imports];
}

/**
 * @param {string} content
 * @param {string} filePath
 * @param {string} workspaceRoot
 * @returns {string[]}
 */
function extractPythonImports(content, filePath, workspaceRoot) {
    const dir = path.dirname(filePath);
    const imports = new Set();

    const absImport = /^\s*import\s+([\w.]+)/gm;
    const absFrom   = /^\s*from\s+([\w.]+)\s+import\s+/gm;
    const relFrom   = /^\s*from\s+(\.+)([\w.]*)\s+import\s+/gm;

    let match;

    while ((match = absImport.exec(content)) !== null) {
        const resolved = resolvePythonAbsolute(match[1], dir, workspaceRoot);
        if (resolved) imports.add(resolved);
    }

    while ((match = absFrom.exec(content)) !== null) {
        const resolved = resolvePythonAbsolute(match[1], dir, workspaceRoot);
        if (resolved) imports.add(resolved);
    }

    while ((match = relFrom.exec(content)) !== null) {
        const dots = match[1].length;
        const rest = match[2];
        let base = dir;
        for (let i = 1; i < dots; i++) base = path.dirname(base);
        const resolved = resolvePythonRelative(base, rest);
        if (resolved) imports.add(resolved);
    }

    return [...imports];
}

/**
 * @param {string} modulePath
 * @param {string} fileDir
 * @param {string} workspaceRoot
 * @returns {string | null}
 */
function resolvePythonAbsolute(modulePath, fileDir, workspaceRoot) {
    const parts = modulePath.split(".");

    // 1. Same directory as importing file
    const fromFileDir = resolvePythonPath(path.join(fileDir, ...parts));
    if (fromFileDir) return fromFileDir;

    // 2. Workspace root
    const fromRoot = resolvePythonPath(path.join(workspaceRoot, ...parts));
    if (fromRoot) return fromRoot;

    // 3. Walk up from file dir
    let searchDir = path.dirname(fileDir);
    for (let i = 0; i < 5; i++) {
        const resolved = resolvePythonPath(path.join(searchDir, ...parts));
        if (resolved) return resolved;
        const parent = path.dirname(searchDir);
        if (parent === searchDir) break;
        searchDir = parent;
    }

    return null;
}

/**
 * @param {string} base
 * @param {string} rest
 * @returns {string | null}
 */
function resolvePythonRelative(base, rest) {
    if (!rest) return resolvePythonPath(path.join(base, "__init__"));
    const parts = rest.split(".");
    return resolvePythonPath(path.join(base, ...parts));
}

/**
 * @param {string} candidate
 * @returns {string | null}
 */
function resolvePythonPath(candidate) {
    if (fs.existsSync(candidate + ".py")) return candidate + ".py";
    const init = path.join(candidate, "__init__.py");
    if (fs.existsSync(init)) return init;
    return null;
}

/**
 * @param {string} dir
 * @param {string} importPath
 * @returns {string | null}
 */
function resolveJSImport(dir, importPath) {
    const extensions = [".js", ".jsx", ".ts", ".tsx"];
    const candidate = path.resolve(dir, importPath);

    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;

    for (const ext of extensions) {
        if (fs.existsSync(candidate + ext)) return candidate + ext;
    }

    for (const ext of extensions) {
        const index = path.join(candidate, "index" + ext);
        if (fs.existsSync(index)) return index;
    }

    return null;
}

// ─── Main ─────────────────────────────────────────────────────────

async function create_code_graph() {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceRoot) {
        console.log("Workspace not found");
        return;
    }
    console.log("Workspace Root:", workspaceRoot);

    const files = await vscode.workspace.findFiles(
        "**/*.{js,jsx,ts,tsx,py}",
        "**/{node_modules,.git,dist,build,out,target,coverage,venv,env,myenv,.venv,__pycache__,.pytest_cache,site-packages}/**"
    );

    console.log(`Found ${files.length} files`);

    if (files.length === 0) return;

    const fileSet = new Set(files.map(f => f.fsPath));

    // Wake up language servers
    for (const file of files.slice(0, 5)) {
        try {
            const doc = await vscode.workspace.openTextDocument(file);
            await vscode.window.showTextDocument(doc, {
                preview: false,
                preserveFocus: true
            });
        } catch (_) {}
    }

    await waitForLanguageServer(files);

    /** @type {Record<string, string[]>} */
    const graph = {};

    for (const file of files) {
        console.log(`Processing: ${file.fsPath}`);

        try {
            // Step 1: LSP
            const { resolved, unresolved } = await extractImportsViaLSP(file, fileSet);

            // Step 2: Regex fallback on lines LSP couldn't resolve
            const content = unresolved.join('\n');
            const fallback = extractImportsRegex(content, file.fsPath, workspaceRoot)
                .filter(dep => fileSet.has(dep));

            const all = new Set([...resolved, ...fallback]);

            if (all.size > 0) {
                // Use just the file's base name (e.g. "utils.js") instead of the full path.
                // Note: if two files in different folders share the same name, they will
                // collide under the same key/value here.
                const key = path.basename(file.fsPath);
                graph[key] = [...all].map(p => path.basename(p));
            }

        } catch (err) {
            console.log(`Error processing ${file.fsPath}:`, /** @type {Error} */(err).message);
        }
    }

    // Save
    const graphDir = path.join(workspaceRoot, ".nyxus");
    fs.mkdirSync(graphDir, { recursive: true });

    const outputFile = path.join(graphDir, "repo-mapping.json");
    fs.writeFileSync(outputFile, JSON.stringify(graph, null, 2), "utf8");

    console.log(`Graph saved at: ${outputFile}`);
    console.log(`Nodes: ${Object.keys(graph).length}`);
    console.log(`Edges: ${Object.values(graph).reduce((a, b) => a + b.length, 0)}`);
}

module.exports = { create_code_graph };