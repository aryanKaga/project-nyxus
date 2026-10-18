
import express from "express";

const upload = express.Router();

// POST /auth/login
upload.post("/workspace", (req, res) => {
    const {user_id,api_key,workspace_id} = req.params

});


export default authRouter;
