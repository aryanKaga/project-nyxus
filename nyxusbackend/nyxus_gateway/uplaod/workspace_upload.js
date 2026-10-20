import express from "express";
import { rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { unpackWorkspaceWithPython } from "./ingestion/ingest.js";
import getMongoStore from "../MongoStore.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STORAGE_ROOT = path.resolve(
    process.env.STORAGE_DIR || path.resolve(__dirname, "..", "storage")
);

const upload = express.Router();
const mongostore = getMongoStore();

// ── Helpers ───────────────────────────────────────────────────────────────────

function getArchivePayload(req) {
    if (Buffer.isBuffer(req.body) && req.body.length > 0) return req.body;
    return req.body?.archive || req.body?.workspace || req.body?.zip || req.body?.file || null;
}

function toBuffer(archive) {
    if (Buffer.isBuffer(archive)) return archive;
    if (typeof archive === "string") {
        return Buffer.from(archive.replace(/^data:[^;]+;base64,/, ""), "base64");
    }
    return null;
}

/**
 * Safely delete a workspace directory from disk.
 * Validates that the path is strictly inside STORAGE_ROOT before deleting.
 * @param {string} workspaceId - UUID returned by the Python receiver
 */
async function deleteWorkspaceFromDisk(workspaceId) {
    const workspacePath = path.resolve(STORAGE_ROOT, workspaceId);

    // Security: make sure the resolved path is exactly STORAGE_ROOT/<uuid>
    // and not something like ../../etc via a crafted workspace_id
    if (path.dirname(workspacePath) !== STORAGE_ROOT) {
        console.error(`[Cleanup] Refusing to delete suspicious path: ${workspacePath}`);
        return;
    }

    try {
        await rm(workspacePath, { recursive: true, force: true });
        console.log(`[Cleanup] Deleted workspace from disk: ${workspacePath}`);
    } catch (err) {
        // Non-fatal — log and move on
        console.warn(`[Cleanup] Could not delete ${workspacePath}: ${err.message}`);
    }
}

// ── Upload handler ────────────────────────────────────────────────────────────

const handleWorkspaceUpload = async (req, res) => {
    console.log("[Upload] Request received");

    // ── 1. Validate request fields ────────────────────────────────────────────
    const body = req.body ?? {};
    const { user_id, api_key, workspace_id } = body;

    if (!user_id || !api_key || !workspace_id) {
        return res.status(400).json({
            ok: false,
            error: "user_id, api_key and workspace_id are required",
        });
    }

    const rawArchive = req.file?.buffer ?? getArchivePayload(req);
    if (!rawArchive) {
        return res.status(400).json({
            ok: false,
            error: "Workspace archive is required. Send it as multipart field 'archive' or a base64 string in JSON body.",
        });
    }

    const archiveBuffer = toBuffer(rawArchive);
    if (!archiveBuffer || archiveBuffer.length === 0) {
        return res.status(400).json({ ok: false, error: "Could not parse archive payload." });
    }

    console.log(`[Upload] user=${user_id} workspace=${workspace_id} size=${archiveBuffer.length}B`);

    // ── 2. Unpack archive to disk ─────────────────────────────────────────────
    let result;
    try {
        result = await unpackWorkspaceWithPython(archiveBuffer, { workspace_id });
        console.log(`[Upload] Unpacked → workspace_id=${result.workspace_id} files=${result.file_count}`);
    } catch (unpackErr) {
        console.error("[Upload] Unpack failed:", unpackErr.message);
        return res.status(500).json({ ok: false, error: unpackErr.message });
    }

    // ── 3. Save to MongoDB, then ALWAYS delete from disk ─────────────────────
    try {
        await mongostore.saveWorkspace(api_key, result.workspace_id, archiveBuffer, result.file_count);
        console.log(`[Upload] Saved workspace ${result.workspace_id} to MongoDB`);
    } catch (dbErr) {
        console.error("[Upload] MongoDB save failed:", dbErr.message);
        // Delete extracted files from disk even if DB save failed
        await deleteWorkspaceFromDisk(result.workspace_id);
        return res.status(500).json({
            ok: false,
            error: `Failed to persist workspace to database: ${dbErr.message}`,
        });
    }

    // DB save succeeded — delete from disk (workspace lives in MongoDB only)
    await deleteWorkspaceFromDisk(result.workspace_id);

    return res.status(200).json({
        ok: true,
        workspace_id: result.workspace_id,
        file_count: result.file_count,
        message: "Workspace ingested and stored in database; temporary files removed from server.",
    });
};

// ── Routes ────────────────────────────────────────────────────────────────────

upload.use("/", (req, _res, next) => {
    console.log("[Upload] Incoming:", req.method, req.path);
    next();
});

upload.post("/workspace", handleWorkspaceUpload);
upload.post("/upload",    handleWorkspaceUpload);
upload.post("/",          handleWorkspaceUpload);

upload.get("/status", (_req, res) => {
    res.json({ ok: true, service: "workspace_upload_router", status: "ready" });
});

export default upload;
