const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);
const MAX_ARCHIVE_BYTES = 250 * 1024 * 1024;
const MAX_GIT_OUTPUT_BYTES = 16 * 1024 * 1024;
const DEFAULT_GITIGNORE = `# Dependencies
node_modules/
**/node_modules/
vendor/
venv/
.venv/

# Build output and caches
dist/
**/dist/
build/
**/build/
out/
coverage/
.cache/
__pycache__/
.pytest_cache/
.codegraph/

# Local secrets and logs
.env
.env.*
!.env.example
*.log
nyxus_auto_memory.txt
.nyxus/

# Database and media files
*.sqlite
*.sqlite3
*.db
*.mp4
*.zip
*.tar
*.gz

# Operating system and editor files
.DS_Store
Thumbs.db
.vscode/
`;

async function resolveGitRoot(workspaceRoot) {
    let result;
    try {
        result = await execFileAsync('git', ['-C', workspaceRoot, 'rev-parse', '--show-toplevel'], {
            encoding: 'utf8',
            maxBuffer: 1024 * 1024
        });
    } catch (error) {
        throw new Error(`The open folder must be inside an initialized Git repository: ${error.message}`);
    }
    return result.stdout.trim();
}

async function ensureGitIgnore(gitRoot) {
    const gitIgnorePath = path.join(gitRoot, '.gitignore');
    try {
        await fs.promises.access(gitIgnorePath);
    } catch (error) {
        if (error.code !== 'ENOENT') {
            throw error;
        }
        try {
            await fs.promises.writeFile(gitIgnorePath, DEFAULT_GITIGNORE, { flag: 'wx', encoding: 'utf8' });
        } catch (writeError) {
            if (writeError.code !== 'EEXIST') {
                throw writeError;
            }
        }
    }
}

async function stageAndCommit(gitRoot) {
    await execFileAsync('git', ['-C', gitRoot, 'add', '--all'], { maxBuffer: MAX_GIT_OUTPUT_BYTES });

    try {
        await execFileAsync('git', ['-C', gitRoot, 'diff', '--cached', '--quiet']);
        return false;
    } catch (error) {
        if (error.code !== 1) {
            throw error;
        }
    }

    await execFileAsync('git', [
        '-C',
        gitRoot,
        'commit',
        '--quiet',
        '-m',
        'Sync workspace for Nyxus'
    ], { maxBuffer: MAX_GIT_OUTPUT_BYTES });
    return true;
}

async function listGitFiles(gitRoot, subPath = '') {
    const args = ['-C', gitRoot, 'ls-tree', '-r', '--name-only', '-z', 'HEAD'];
    if (subPath) {
        args.push(subPath);
    }
    const { stdout } = await execFileAsync(
        'git',
        args,
        { encoding: 'buffer', maxBuffer: 256 * 1024 * 1024 }
    );
    return stdout.toString('utf8').split('\0').filter(Boolean);
}

async function create_workspace_archive(workspaceRoot) {
    const gitRoot = await resolveGitRoot(workspaceRoot);
    const relativeSubPath = path.relative(gitRoot, workspaceRoot).replace(/\\/g, '/');

    await ensureGitIgnore(gitRoot);
    const commitCreated = await stageAndCommit(gitRoot);
    const files = await listGitFiles(gitRoot, relativeSubPath);

    let archive;
    try {
        const archiveArgs = ['-C', gitRoot, 'archive', '--format=zip', 'HEAD'];
        if (relativeSubPath) {
            archiveArgs.push(relativeSubPath);
        }
        const result = await execFileAsync('git', archiveArgs, {
            encoding: 'buffer',
            maxBuffer: MAX_ARCHIVE_BYTES
        });
        archive = result.stdout;
    } catch (error) {
        if (error.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER') {
            throw new Error('The compressed workspace exceeds the 250 MB transfer limit.');
        }
        throw new Error(`Git could not create the workspace archive: ${error.message}`);
    }

    return {
        archive,
        fileCount: files.length,
        commitCreated,
        workspaceName: path.basename(workspaceRoot)
    };
}

module.exports = { create_workspace_archive, ensureGitIgnore, listGitFiles, stageAndCommit };
