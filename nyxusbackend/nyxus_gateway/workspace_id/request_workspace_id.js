import express from "express";
import { init_database } from "../MonogoClient.js";
import { randomUUID } from "node:crypto";

const db = await init_database();
const id_router = express.Router();
const users = db.collection("users");

async function assign_workspace_id(user_id) {
    console.log('request came for generate a workspae id by ',user_id)
    try {
        const assign_id = randomUUID();

        const result = await users.updateOne(
            { user_id },
            { $addToSet: { workspace_ids: assign_id } }
        );

        if (result.matchedCount === 0) {
            throw new Error("User not found while assigning workspace ID");
        }

        return String(assign_id);
    } catch (err) {
        console.error(
            "Error assigning the workspace ID to the user",
            user_id,
            err
        );
        throw err;
    }
}

id_router.post("/request_id", async (req, res) => {
    console.log('request came for generating a workspace ids')
    console.log(req.body.user_id,req.user_id)
    try {
        const user_id = req.user.user_id;
        console.log(req.body)
        console.log('user has user id', user_id)
        if (!user_id) {
            return res.status(401).json({
                ok: false,
                error: "Authentication required"
            });
        }

        const user = await users.findOne({ user_id });

        if (user == null) {
            return res.status(401).json({
                ok: false,
                error: "User is not registered with Nyxus"
            });
        }

        const assigned_workspace_ids = Array.isArray(user.workspace_ids)
            ? user.workspace_ids.length
            : 0;

        if (
            typeof user.max_limit !== "number" ||
            assigned_workspace_ids >= user.max_limit
        ) {
            return res.status(403).json({
                ok: false,
                error: "User has reached the maximum number of allowed workspaces"
            });
        }

        const assingned_id = await assign_workspace_id(user_id);

        if (!assingned_id) {
            return res.status(500).json({
                ok: false,
                error: "Internal server error. Please try again."
            });
        }

        return res.status(200).json({
            ok: true,
            workspace_id: assingned_id
        });

    } catch (err) {
        console.error("Error processing workspace ID request:", err);

        return res.status(500).json({
            ok: false,
            error: "Unable to assign a workspace ID. Please try again."
        });
    }
});

export default id_router;