import express from "express";
import { createClient } from "redis";
import { MongoClient } from "mongodb";
import dotenv from "dotenv";
dotenv.config();



const redis = createClient({
  url: process.env.REDIS_URL || "redis://localhost:6379",
});

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  throw new Error("MONGODB_URI is missing. Check .env");
}

const client = new MongoClient(MONGODB_URI, {
  maxPoolSize: 50,
  minPoolSize: 5,
  waitQueueTimeoutMS: 2000,
});

redis.on("error", (err) => {
  console.error("Redis error:", err);
});

const SESSION_TTL = 90; // seconds
const app = express();
const router  = express.Router()



app.use(express.json());

let users;

const init_database = async () => {
  try {
    console.log("checking authentication via mongodb");
    const db = client.db("nyxus");
    const users = db.collection("users");
    await users.createIndex({ user_id: 1 }, { unique: true });
    return users;
  } catch (error) {
    console.error(error);
    throw error;
  }
};

router.use("/", async (req, res) => {
  const { user_id, api_key } = req.body ?? req.query ?? {};

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
        return res.status(200).json({ ok: true, user_id });
      }
      return res.status(401).json({ error: "invalid creds" });
    }

    if (record.api_key !== api_key) {
      return res.status(401).json({ error: "invalid creds" });
    }

    return res.status(200).json({ ok: true, user_id });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "internal server error" });
  }
});


router.post('/upload',async(req,res)=>{
  const {user_id,api_key,workspace} = req.params
  console.log('received upload request for the folder ',user_id,workspace,api_key)

})
router.post('/delete',async(req,res)=>{
  const {user_id,api_key,workspace_id} = req.params
  console.log('received delete request for the folder ',workspace_id)


})



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