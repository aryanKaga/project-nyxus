import express from "express";
import { init_database,MongoClient } from "../MonogoClient";
import { UUID } from "mongodb";


db  = init_database()
id_router = express.Router()

async function assign_workspace_id(user_id){
    try{
        assign_id = UUID.UUID()
        db.users{['add a uuid workspace id in workspace key']} 
        return String(assign_id)
    }
    catch(err){
        console.err("error assinging the workspace id to the user ",user_id,err)
    }
}

id_router.use('/request_id',async (req,res)=>{
    user_id = req.user_id
    users = db['users']
    user = await users.findOne({user_id})
    if(user == null){
       return res.status(401).json({
        err:"User is not registered with nyxus"
       })
    }
    
})

