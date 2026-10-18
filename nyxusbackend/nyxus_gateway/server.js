import express from "express";
import { createClient } from "redis";

import dotenv from "dotenv";
import uploadRouter from "./uplaod/workspace_upload.js";
import {client ,init_database}from './MonogoClient.js'
dotenv.config();

const redis = createClient({
  url: process.env.REDIS_URL || "redis://localhost:6379",
});



redis.on("error", (err) => {
  console.error("Redis error:", err);
});

const SESSION_TTL = 90; // seconds
const app = express();
const router = express.Router();

// Allow up to 250MB for workspace zip uploads
app.use(express.json({ limit: "250mb" }));
app.use(express.urlencoded({ extended: true, limit: "250mb" }));


monogo_db = await init_database()
const users = db.collection("users");


/**
 * Authentication middleware with Redis caching
 */
const authenticate = async (req, res, next) => {
  const user_id = req.body?.user_id ?? req.query?.user_id ?? req.headers["x-user-id"];
  const api_key = req.body?.api_key ?? req.query?.api_key ?? req.headers["x-api-key"];

  if (typeof user_id !== "string" || user_id.trim() === "") {
    console.error("unvalidated user_id tried to access");
    return res.status(401).json({ error: "user id is required" });
  }

  if (typeof api_key !== "string" || api_key.trim() === "") {
    console.error("invalid api key");
    return res.status(401).json({ error: "invalid api key" });
  }

  try {
    const record = await redis.hGetAll(`user_id:${user_id}`);

    if (!record || !record.user_id) {
      const user = await users.findOne({ user_id });
      if (user && user.api_key === api_key) {
        // Cache session in Redis
        await redis.hSet(`user_id:${user_id}`, { user_id, api_key });
        await redis.expire(`user_id:${user_id}`, SESSION_TTL);
        req.user = { user_id, api_key };
        return next();
      }
      return res.status(401).json({ error: "invalid creds" });
    }

    if (record.api_key !== api_key) {
      return res.status(401).json({ error: "invalid creds" });
    }

    await redis.expire(`user_id:${user_id}`, SESSION_TTL);
    req.user = { user_id, api_key };
    return next();
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "internal server error" });
  }
};

// Root auth verification route
router.post("/auth", authenticate, (req, res) => {
  return res.status(200).json({ ok: true, user_id: req.user.user_id });
});

router.get("/auth", authenticate, (req, res) => {
  return res.status(200).json({ ok: true, user_id: req.user.user_id });
});

// Delete workspace route
router.post("/delete", authenticate, async (req, res) => {
  const { user_id, api_key, workspace_id } = req.body ?? req.query ?? {};
  console.log("received delete request for workspace:", workspace_id);
  return res.status(200).json({ ok: true, message: `workspace ${workspace_id} deleted` });
});

// Mount the workspace upload router under /upload, /workspace, and /uplaod
app.use("/upload", uploadRouter);
app.use("/workspace", uploadRouter);
app.use("/uplaod", uploadRouter);

// Mount main router
app.use(router);

const port = process.env.PORT || 3000;

try {
  await redis.connect();
  await client.connect();
  users = await init_database();
  console.log("starting the server");
  app.listen(port, () => {
    console.log(`Gateway listening on port ${port}`);
  });
} catch (error) {
  console.error("Gateway startup failed:", error);
  process.exit(1);
}

export default app;