import express from "express";
import { unpackWorkspaceWithPython } from "./ingestion/ingest.js";

const upload = express.Router();

// Helper to extract archive data from body or raw buffer
function getArchivePayload(req) {
    if (Buffer.isBuffer(req.body) && req.body.length > 0) {
        return req.body;
    }
    return req.body?.archive || req.body?.workspace || req.body?.zip || req.body?.file || null;
}

/**
 * Handle workspace upload and run the Python ingestion pipeline.
 * Supports /workspace, /upload, and / (when mounted under /upload or /workspace)
 */
const handleWorkspaceUpload = async (req, res) => {
    try {
        const user_id =
            req.body?.user_id ??
            req.query?.user_id ??
            req.params?.user_id ??
            req.headers["x-user-id"];

        const api_key =
            req.body?.api_key ??
            req.body?.apiKey ??
            req.query?.api_key ??
            req.params?.api_key ??
            req.headers["x-api-key"];

        const workspace_id =
            req.body?.workspace_id ??
            req.query?.workspace_id ??
            req.params?.workspace_id ??
            req.headers["x-workspace-id"] ??
            null;

        const archive = getArchivePayload(req);

        if (!archive) {
            return res.status(400).json({
                ok: false,
                error: "Workspace archive is required. Send 'archive' (base64 string or binary) in request body.",
            });
        }

        console.log(`[Upload] Running ingestion pipeline for user: ${user_id || "anonymous"}, workspace: ${workspace_id || "new"}`);

        // Run the ingestion pipeline via Python workspace receiver
        const result = await unpackWorkspaceWithPython(archive, {
            workspace_id,
        });

        console.log(`[Upload] Ingestion successful. Workspace ID: ${result.workspace_id}, Files: ${result.file_count}`);

        return res.status(200).json({
            ok: true,
            workspace_id: result.workspace_id,
            file_count: result.file_count,
            message: "Workspace unpacked and ingested successfully",
        });
    } catch (error) {
        console.error("[Upload] Ingestion pipeline failed:", error);
        return res.status(500).json({
            ok: false,
            error: error.message || "Failed to process workspace archive.",
        });
    }
};

// Mount route handlers
upload.post("/workspace", handleWorkspaceUpload);
upload.post("/upload", handleWorkspaceUpload);
upload.post("/", handleWorkspaceUpload);

// Status route
upload.get("/status", (req, res) => {
    res.status(200).json({
        ok: true,
        service: "workspace_upload_router",
        status: "ready",
    });
});

export default upload;
