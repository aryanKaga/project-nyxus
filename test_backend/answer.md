# Making Antigravity File Changes Persistent

If Antigravity makes changes to files during a session but you cannot see them reflected on your disk, it typically means the modifications are currently isolated in memory, a temporary sandbox, or an uncommitted workspace layer. 

To make these changes persistent to your actual files, ensure the modifications are explicitly written back to disk storage and synced to the database by checking the following key mechanisms:

## 1. Verify the Target Storage Path (`STORAGE_DIR`)
Workspaces are not necessarily stored in your project's root directory. 
* **Location:** They are stored under the directory specified by the `WORKSPACE_STORAGE` environment variable, or in the default `workspaces/` folder relative to the server root (`server.py:27`).
* **Action:** Ensure you are navigating to the exact workspace UUID folder inside that directory (`STORAGE_DIR / workspace_id`) rather than your local development directory.

## 2. Trigger the Workspace Sync and Archive
The application relies on archives being explicitly saved or transmitted to write data back to the disk and database layer.
* **Mechanism:** Changes must be packed into an archive and sent to the server/database layer via handlers like the Socket.IO event `workspace_archive` or explicit save operations.
* **Backend:** This triggers `MongoStore.save_workspace` (`database/mongo_store.py:65-89`), which persists the data to MongoDB and unpacks it into the designated workspace storage directory.

## 3. Check for Sandbox-Only or In-Memory Isolation
If tools are editing files inside an isolated container, temporary directory, or in-memory file system, they will not automatically bleed into the host filesystem.
* **Action:** Verify that your workflow or agent invokes the upload/save pipeline (such as `unpack_workspace_archive`) after completing edits. Without triggering this save/archive endpoint, changes remain trapped in isolation and will not appear in the main workspace directory on disk.