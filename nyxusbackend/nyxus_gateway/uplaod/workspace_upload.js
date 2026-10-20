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




// Helper to extract archive data from body or raw buffer
function getArchivePayload(req) {
    if (Buffer.isBuffer(req.body) && req.body.length > 0) {
        return req.body;
    }
    return req.body?.archive || req.body?.workspace || req.body?.zip || req.body?.file || null;
}
/**
 * using workspace collection to upload files and archives
 */

/**

const handleWorkspaceUpload = async (req, res) => {
    try {
        
        const {user_id,api_key,workspace_id} = req.body
        if(!user_id || !api_key || !workspace_id){
            return res.status(401).json({
         
 * Handle workspace upload and run the Python ingestion pipeline.
 * Supports /workspace, /upload, and / (when mounted under /upload or /workspace)
 */


const handleWorkspaceUpload = async (req, res) => {
    console.log('reached upload endpoint with workspace_id ',req.workspace_id)
    try {
        
        const {user_id,api_key,workspace_id} = req.body
        if(!user_id || !api_key || !workspace_id){
            return res.status(401).json({
                error:"invalid credentials"
            })
        }
        
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
        
        await mongostore.saveWorkspace(api_key, workspace_id, archive, result.file_count);

        console.log(`[Upload] Ingestion successful. Workspace ID: ${result.workspace_id}, Files: ${result.file_count}`);

        const workspacePath = path.resolve(result.file_path);
        const expectedWorkspacePath = path.resolve(STORAGE_ROOT, workspace_id);
        if (
            typeof result.file_path !== "string" ||
            path.dirname(expectedWorkspacePath) !== STORAGE_ROOT ||
            workspacePath !== expectedWorkspacePath
        ) {
            throw new Error("Workspace extraction path is invalid; refusing to delete it.");
        }
        await rm(workspacePath, { recursive: true, force: true });
        
        return res.status(200).json({
            ok: true,
            workspace_id: result.workspace_id,
            file_count: result.file_count,
            message: "Workspace archived successfully; temporary extracted files were removed.",
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
upload.use('/',(req,res,next)=>{
    console.log('request came')
    next()
})
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
