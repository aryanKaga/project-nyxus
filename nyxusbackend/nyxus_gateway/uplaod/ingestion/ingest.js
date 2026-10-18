import { spawn } from "node:child_process";

export function unpackWorkspaceWithPython(archiveBuffer) {
    return new Promise((resolve, reject) => {
        const python = spawn("python3", [
            "./workspace_receiver.py",
        ]);

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
                return reject(
                    new Error(stderr || `Python exited with code ${code}`)
                );
            }

            try {
                resolve(JSON.parse(stdout));
            } catch {
                reject(new Error("Python returned invalid JSON."));
            }
        });

        python.stdin.on("error", (error) => {
            if (error.code !== "EPIPE") {
                reject(error);
            }
        });

        python.stdin.end(JSON.stringify({
            archive: archiveBuffer.toString("base64"),
        }));
    });
}