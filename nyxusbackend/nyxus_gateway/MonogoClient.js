
import { MongoClient } from "mongodb";
import dotenv from "dotenv";

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  throw new Error("MONGODB_URI is missing. Check .env");
}

export const client = new MongoClient(MONGODB_URI, {
  maxPoolSize: 50,
  minPoolSize: 5,
  waitQueueTimeoutMS: 2000,
});

export async function init_database() {
  const db = client.db("nyxus");
  const users = db.collection("users");

  await users.createIndex({ user_id: 1 }, { unique: true });

  console.log("MongoDB initialized");
  return db;
}
