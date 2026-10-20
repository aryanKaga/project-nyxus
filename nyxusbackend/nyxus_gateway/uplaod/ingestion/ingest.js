import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PYTHON_RECEIVER_PATH = path.join(__dirname, "workspace_receiver.py");

/**
 * Unpacks a workspace archive using the Python workspace_receiver script.
 * @param {Buffer|string} archiveBuffer - ZIP archive as Buffer or base64 string
 * @param {object} [options] - Optional settings (workspace_id, storage_root)
 * @returns {Promise<{ ok: boolean, workspace_id: string, file_count: number, file_path: string }>}
 */
export function unpackWorkspaceWithPython(archiveBuffer, options = {}) {
    return new Promise((resolve, reject) => {
        const python = spawn("python3", [PYTHON_RECEIVER_PATH], {
            cwd: __dirname,
        });
        

        let stdout = "";
        let stderr = "";
        python.stdout.setEncoding("utf8");
        python.stderr.setEncoding("utf8");
        python.stdout.on("data", (chunk) => {
            stdout += chunk;
        });
        python.stderr.on("data", (chunk) => {
            stderr += chunk;
        });
        python.on("error", reject);

        python.on("close", (code) => {
            if (code !== 0) {
                try {
                    const parsed = JSON.parse(stdout);
                    return reject(new Error(parsed.error || stderr || `Python exited with code ${code}`));
                } catch {
                    return reject(
                        new Error(stderr.trim() || `Python exited with code ${code}`)
                    );
                }
            }

            try {
                const parsed = JSON.parse(stdout);
                resolve(parsed);
            } catch {
                reject(new Error(`Python returned invalid JSON: ${stdout || stderr}`));
            }
        });

        python.stdin.on("error", (error) => {
            if (error.code !== "EPIPE") {
                reject(error);
            }
        });

        const base64Archive = Buffer.isBuffer(archiveBuffer)
            ? archiveBuffer.toString("base64")
            : typeof archiveBuffer === "string"
            ? archiveBuffer.replace(/^data:[^;]+;base64,/, "")
            : "";

        python.stdin.end(JSON.stringify({
            archive: base64Archive,
            workspace_id: options.workspace_id || options.workspaceId,
            storage_root: options.storage_root || options.storageRoot,
        }));
    });
}