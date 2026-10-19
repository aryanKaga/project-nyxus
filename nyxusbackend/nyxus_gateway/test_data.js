import { init_database } from "./MonogoClient.js";

const db = await init_database();
const users = db.collection("users");

const user_id = "123";
const user_name = "";
const email = "";

const result = await users.updateOne(
    { user_id },
    {
        $set: {
            user_name,
            email
        },
        $setOnInsert: {
            user_id,
            workspace_id: [],
            api_key: []
        }
    },
    { upsert: true }
);

console.log({
    matchedCount: result.matchedCount,
    modifiedCount: result.modifiedCount,
    upsertedId: result.upsertedId
});