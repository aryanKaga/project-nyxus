const vscode = require("vscode");
const fs = require('fs')
const path = require('path')
/**
 * Wait until language server starts returning symbols
 * @param {import('vscode').Uri[]} files
 */
async function waitForLanguageServer(files) {

    console.log("Waiting for language server...");

    const timeout = 60000;
    const start = Date.now();

    while (Date.now() - start < timeout) {

        for (const file of files.slice(0, 5)) {

            try {

                const symbols =
                    await vscode.commands.executeCommand(
                        "vscode.executeDocumentSymbolProvider",
                        file
                    );

                if (
                    Array.isArray(symbols) &&
                    symbols.length > 0
                ) {

                    console.log(
                        `Language server ready: ${file.fsPath}`
                    );

                    return true;
                }

            } catch (err) {
                console.log(err);
            }
        }

        await new Promise(resolve =>
            setTimeout(resolve, 1000)
        );
    }

    console.log(
        "Language server readiness timeout"
    );

    return false;
}

/**
 * @typedef {Object} AnalysisResult
 * @property {string[]} files
 * @property {any[]} symbols
 * @property {any[]} definitions
 * @property {any[]} references
 * @property {any[]} calls
 */

/**
 * Analyze workspace
 * @returns {Promise<AnalysisResult>}
 */
async function analyzeWorkspace() {

    /** @type {AnalysisResult} */
    const result = {
        files: [],
        symbols: [],
        definitions: [],
        references: [],
        calls: []
    };

    console.log(
        "Workspace folders:",
        vscode.workspace.workspaceFolders
    );

    const files =
        await vscode.workspace.findFiles(
            "**/*.{js,jsx,ts,tsx,py}",
            "**/{node_modules,.git,dist,build,out,target,coverage,venv,env,myenv,.venv,__pycache__,.pytest_cache,site-packages}/**"
            
        );

    console.log(
        `Found ${files.length} files`
    );

    if (files.length === 0) {
        return result;
    }

    // Open a few files to wake up language servers
    for (const file of files.slice(0, 5)) {

        try {

            const doc =
                await vscode.workspace.openTextDocument(
                    file
                );

            await vscode.window.showTextDocument(
                doc,
                {
                    preview: false,
                    preserveFocus: true
                }
            );

        } catch (err) {
            console.log(err);
        }
    }

    await waitForLanguageServer(files);

    console.log(
        "Starting analysis..."
    );

    for (const file of files) {

        console.log(
            `Analyzing: ${file.fsPath}`
        );

        result.files.push(
            file.fsPath
        );

        try {

            /** @type {import('vscode').DocumentSymbol[] | undefined} */
            const symbols =
                await vscode.commands.executeCommand(
                    "vscode.executeDocumentSymbolProvider",
                    file
                );

            if (
                !symbols ||
                !Array.isArray(symbols)
            ) {

                console.log(
                    `No symbols for ${file.fsPath}`
                );

                continue;
            }

            console.log(
                `${file.fsPath}: ${symbols.length} symbols`
            );

            await processSymbols(
                symbols,
                file,
                result
            );

        } catch (err) {

            console.log(
                `Error analyzing ${file.fsPath}`
            );

            console.log(err);
        }
    }

    console.log(
        "Analysis complete"
    );

    console.log(
        "Files:",
        result.files.length
    );

    console.log(
        "Symbols:",
        result.symbols.length
    );

    console.log(
        "Definitions:",
        result.definitions.length
    );

    console.log(
        "References:",
        result.references.length
    );

    console.log(
        "Calls:",
        result.calls.length
    );

    return result;
}

/**
 * @param {import('vscode').DocumentSymbol[]} symbols
 * @param {import('vscode').Uri} file
 * @param {AnalysisResult} result
 */
async function processSymbols(
    symbols,
    file,
    result
) {

    for (const symbol of symbols) {

        result.symbols.push({
            name: symbol.name,
            kind: symbol.kind,
            file: file.fsPath
        });

        console.log(
            `Symbol: ${symbol.name}`
        );

        // Definitions

        try {

            /** @type {import('vscode').Location[] | undefined} */
            const definitions =
                await vscode.commands.executeCommand(
                    "vscode.executeDefinitionProvider",
                    file,
                    symbol.selectionRange.start
                );

            if (
                Array.isArray(definitions)
            ) {

                for (const def of definitions) {

                    result.definitions.push({
                        symbol: symbol.name,
                        from: file.fsPath,
                        to: def.uri.fsPath
                    });
                }
            }

        } catch (err) {
            console.log(err);
        }

        // References

        try {

            /** @type {import('vscode').Location[] | undefined} */
            const references =
                await vscode.commands.executeCommand(
                    "vscode.executeReferenceProvider",
                    file,
                    symbol.selectionRange.start
                );

            if (
                Array.isArray(references)
            ) {

                for (const ref of references) {

                    result.references.push({
                        symbol: symbol.name,
                        from: file.fsPath,
                        to: ref.uri.fsPath
                    });
                }
            }

        } catch (err) {
            console.log(err);
        }

        // Call hierarchy

        try {

            /** @type {import('vscode').CallHierarchyItem[] | undefined} */
            const hierarchy =
                await vscode.commands.executeCommand(
                    "vscode.prepareCallHierarchy",
                    file,
                    symbol.selectionRange.start
                );

            if (
                Array.isArray(hierarchy)
            ) {

                for (const item of hierarchy) {

                    /** @type {import('vscode').CallHierarchyOutgoingCall[] | undefined} */
                    const outgoing =
                        await vscode.commands.executeCommand(
                            "vscode.provideOutgoingCalls",
                            item
                        );

                    if (
                        Array.isArray(outgoing)
                    ) {

                        for (const call of outgoing) {

                            result.calls.push({
                                from: item.name,
                                to: call.to.name,
                                fromFile:
                                    item.uri.fsPath,
                                toFile:
                                    call.to.uri.fsPath
                            });
                        }
                    }
                }
            }

        } catch (err) {
            // Many language servers don't support call hierarchy
        }

        // Recurse children

        if (
            symbol.children &&
            symbol.children.length > 0
        ) {

            await processSymbols(
                symbol.children,
                file,
                result
            );
        }
    }
}

async function create_code_graph(){
        await new Promise(resolve => setTimeout(resolve,1000))
        const result = await analyzeWorkspace()
        console.log('creating code graph')
        //console.log(result)
        const files = result.files
        //console.log(files)
        let map = new Map()
        let count = 0
        let negcount = 0
        console.log((result.calls.length))
        for(let ref of result.calls){
            console.log(files.includes(ref.fromFile),files.includes(ref.toFile))
            if(files.includes(ref.fromFile) && (files.includes(ref.toFile))){
                
                if(!map.has(ref.fromFile)){
                    map.set(ref.fromFile,new Set())
                }
                map.get(ref.fromFile).add(ref.toFile)
                count+=1
            }

            else{
                negcount+=1
                
            }
            if(ref.fromFile == undefined || ref.toFile == undefined){
                console.log('undefined found')
                break
            }
            
        }
        
        /**
         * @param {string} workspaceRoot
         */
        const workspaceRoot =
            vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if(!workspaceRoot){
            console.log('workspace not found')
            return
        }
        const graphDir = path.join(
            workspaceRoot,
            ".nyxus"
        );

        fs.mkdirSync(graphDir, {
            recursive: true
        });

        const outputFile = path.join(
            graphDir,
            "repo-graph.json"
        );

        fs.writeFileSync(
            outputFile,
            JSON.stringify(result, null, 2)
        );

        console.log(
            "Graph saved at:",
            outputFile
        );
        const outputmapfile = path.join(graphDir,"repo-mapping.json")
        

        /** @type {Record<string, string[]>} */
        const graph = {}
        for (const [file, deps] of map) {
            graph[file] = [...deps];
        }

        fs.writeFileSync(
            outputmapfile,
            JSON.stringify(graph, null, 2),
            "utf8"
        );
        console.log('saved')
        console.log('file written successfully')
    }

module.exports = {create_code_graph}