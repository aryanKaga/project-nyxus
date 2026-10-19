import express from "express";
import { createClient } from "redis";

import dotenv from "dotenv";
import uploadRouter from "./uplaod/workspace_upload.js";
import id_router from "./workspace_id/workspace_id.js";
import {client ,init_database}from './MonogoClient.js'
import getMongoStore from "./uplaod/MongoStore.js";
dotenv.config();

const redis = createClient({
  url: process.env.REDIS_URL || "redis://localhost:6379",
});



redis.on("error", (err) => {
  console.error("Redis error:", err);
});

const SESSION_TTL = 90; // seconds
const app = express();


// Allow up to 250MB for workspace zip uploads
app.use(express.json({ limit: "250mb" }));
app.use(express.urlencoded({ extended: true, limit: "250mb" }));


let users;
let mongo_db;

/**
 * Authentication middleware with Redis caching
 */

const authenticate = async (req, res, next) => {
  req.user_id = req.body?.user_id ?? req.query?.user_id ?? req.headers?.["x-user-id"];
  console.log('req has user id', req.user_id);
  next();
};

/**
 * Handler to delete / unstage a workspace and clean up its data.
 */
const handleWorkspaceDelete = async (req, res) => {
  const user_id = req.body?.user_id ?? req.query?.user_id ?? req.headers?.["x-user-id"] ?? req.user_id;
  const api_key = req.body?.api_key ?? req.query?.api_key ?? req.headers?.["x-api-key"];
  const workspace_id = req.body?.workspace_id ?? req.body?.workspaceId ?? req.query?.workspace_id ?? req.params?.workspace_id;

  if (!workspace_id) {
    return res.status(400).json({ ok: false, error: "workspace_id is required" });
  }

  console.log(`[Delete] Request to delete workspace: ${workspace_id} for user: ${user_id}`);

  try {
    const db = mongo_db || client.db("nyxus");

    // 1. Delete GridFS archive if it exists
    try {
      const mongostore = getMongoStore();
      const wsDoc = await db.collection("workspaces").findOne({ workspace_id });
      if (wsDoc?.archive_id) {
        try {
          await mongostore.archiveBucket.delete(wsDoc.archive_id);
          console.log(`[Delete] Deleted GridFS archive ${wsDoc.archive_id} for workspace ${workspace_id}`);
        } catch (e) {
          console.warn("[Delete] Archive bucket delete error:", e.message);
        }
      }
    } catch (e) {
      console.warn("[Delete] MongoStore check error:", e.message);
    }

    // 2. Remove workspace record from workspaces collection
    await db.collection("workspaces").deleteMany({ workspace_id });

    // 3. Remove conversation turns for this workspace
    await db.collection("conversations").deleteMany({ workspace_id });

    // 4. Remove any workspace_ids collection records if present
    try {
      await db.collection("workspace_ids").deleteMany({ workspace_id });
    } catch (e) {}

    // 5. Clean up any Redis cached entries
    try {
      await redis.del(`workspace:${workspace_id}`);
      await redis.del(`workspace_id:${workspace_id}`);
    } catch (e) {}

    return res.status(200).json({
      ok: true,
      message: "Workspace deleted successfully",
      workspace_id,
    });
  } catch (error) {
    console.error("[Delete] Failed to delete workspace:", error);
    return res.status(500).json({
      ok: false,
      error: error.message || "Failed to delete workspace.",
    });
  }
};

// Mount the workspace upload router under /upload, /workspace, and /uplaod
app.use("/upload", authenticate, uploadRouter);
app.use("/ID", authenticate, id_router);

// Delete workspace endpoints
app.post("/delete_workspace", authenticate, handleWorkspaceDelete);
app.delete("/delete_workspace", authenticate, handleWorkspaceDelete);
app.post("/ID/delete_workspace", authenticate, handleWorkspaceDelete);
app.delete("/ID/delete_workspace", authenticate, handleWorkspaceDelete);


const port = process.env.PORT || 3000;

try {
  await redis.connect();
  await client.connect();
  mongo_db = await init_database();
  users = mongo_db.collection("users");
  console.log("starting the server");
  app.listen(port, () => {
    console.log(`Gateway listening on port ${port}`);
  });
} catch (error) {
  console.error("Gateway startup failed:", error);
  process.exit(1);
}

export default app;