import { createClient } from "redis";
import { client } from "../MonogoClient.js";
import { getMongoStore } from "../MongoStore.js";


const redis = createClient({
  url: process.env.REDIS_URL || "redis://localhost:6379",
});



redis.on("error", (err) => {
  console.error("Redis error:", err);
});




const handleWorkspaceDelete = async (req, res) => {
  console.log('request came for deleting a workspace')
  const user_id = req.body?.user_id ?? req.query?.user_id ?? req.headers?.["x-user-id"] ?? req.user_id;
  const api_key = req.body?.api_key ?? req.query?.api_key ?? req.headers?.["x-api-key"];
  const workspace_id = req.body?.workspace_id ?? req.body?.workspaceId ?? req.query?.workspace_id ?? req.params?.workspace_id;

  if (!workspace_id) {
    return res.status(400).json({ ok: false, error: "workspace_id is required" });
  }

  console.log(`[Delete] Request to delete workspace: ${workspace_id} for user: ${user_id}`);

  try {
    const db = client.db("nyxus");

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

export default handleWorkspaceDelete