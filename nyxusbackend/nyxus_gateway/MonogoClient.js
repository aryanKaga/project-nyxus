import { MongoClient } from "mongodb";
const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  throw new Error("MONGODB_URI is missing. Check .env");
}

const client = new MongoClient(MONGODB_URI, {
  maxPoolSize: 50,
  minPoolSize: 5,
  waitQueueTimeoutMS: 2000,
});


const init_database = async () => {
  try {
    console.log("checking authentication via mongodb");
    const db = client.db("nyxus");
    const users = db.collection("users");
    await users.createIndex({ user_id: 1 }, { unique: true });
    return db;
  } catch (error) {
    console.error(error);
    throw error;
  }
};

try{
    init_database()
}
catch(err){
    console.err("error starting the database that is ",e)
}

export default {client,init_database}