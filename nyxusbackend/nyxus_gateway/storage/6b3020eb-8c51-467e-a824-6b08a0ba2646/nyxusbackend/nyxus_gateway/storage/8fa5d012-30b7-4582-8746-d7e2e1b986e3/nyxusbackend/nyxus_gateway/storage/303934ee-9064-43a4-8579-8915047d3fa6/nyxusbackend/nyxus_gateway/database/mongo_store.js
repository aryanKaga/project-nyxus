/**
 * MongoDB persistence for workspace archives and conversation turns.
 * Mirrors hybridbackend/database/mongo_store.py in Node.js.
 *
 * Collections:
 *   - workspaces    : workspace metadata docs
 *   - conversations : per-user/workspace conversation history
 *   - workspace_archives (GridFS bucket) : raw ZIP archive blobs
 */
import crypto from "node:crypto";
import { Readable } from "node:stream";
import { MongoClient, GridFSBucket } from "mongodb";

// ---------------------------------------------------------------------------
// Helper: hash an API key → consistent user identity (same algo as Python)
// ---------------------------------------------------------------------------
export function userKey(apiKey) {
  if (typeof apiKey !== "string" || !apiKey.trim()) {
    throw new Error("An API key is required.");
  }
  return crypto.createHash("sha256").update(apiKey.trim()).digest("hex");
}

// ---------------------------------------------------------------------------
// MongoStore class — mirrors Python MongoStore
// ---------------------------------------------------------------------------
export class MongoStore {
  /**
   * @param {object} [opts]
   * @param {string}  [opts.uri]      - MongoDB URI (falls back to MONGODB_URI env)
   * @param {string}  [opts.username] - Atlas username  (falls back to MONGODB_USERNAME env)
   * @param {string}  [opts.password] - Atlas password  (falls back to MONGODB_PASSWORD env)
   * @param {string}  [opts.database] - DB name         (falls back to MONGODB_DATABASE env, default "nyxus")
   */
  constructor({ uri, username, password, database } = {}) {
    uri = uri || process.env.MONGODB_URI;
    if (!uri) throw new Error("MONGODB_URI is not configured.");

    username = username || process.env.MONGODB_USERNAME;
    password = password || process.env.MONGODB_PASSWORD;

    // Strip embedded credentials from the URI if separate ones are provided
    // (mirrors the urlsplit/urlunsplit logic in the Python version)
    if ((username || password) && /@/.test(uri)) {
      uri = uri.replace(/^(mongodb(?:\+srv)?:\/\/)[^@]+@/, "$1");
    }

    // Creates the MongoDB client for CRUD operations
    this.client = new MongoClient(uri, {
      ...(username && password ? { auth: { username, password } } : {}),
      serverSelectionTimeoutMS: 5000,
      maxPoolSize: 50,
      minPoolSize: 5,
    });

    const dbName = database || process.env.MONGODB_DATABASE || "nyxus";

    // Connect to the nyxus database
    this.db = this.client.db(dbName);
    this.workspaces = this.db.collection("workspaces");
    this.conversations = this.db.collection("conversations");

    // GridFS bucket — stores raw ZIP archive blobs
    this.archiveBucket = new GridFSBucket(this.db, {
      bucketName: "workspace_archives",
    });

    // Track whether indexes have been created
    this._indexesReady = false;
  }

  /** Ensure indexes exist (call once after connecting). */
  async ensureIndexes() {
    if (this._indexesReady) return;

    // Indexes for better retrieval (mirrors Python create_index calls)
    await this.workspaces.createIndex({ workspace_id: 1 }, { unique: true });
    await this.workspaces.createIndex({ user_id: 1, created_at: -1 });
    await this.conversations.createIndex({
      user_id: 1,
      workspace_id: 1,
      created_at: 1,
    });

    this._indexesReady = true;
  }

  /** Ping the server to verify connectivity. */
  async ping() {
    await this.client.db("admin").command({ ping: 1 });
  }

  // -------------------------------------------------------------------------
  // Workspace methods
  // -------------------------------------------------------------------------

  /**
   * Upload archive to GridFS and save workspace metadata.
   * Mirrors Python: save_workspace(api_key, workspace_id, archive, file_count)
   *
   * @param {string} apiKey
   * @param {string} workspaceId
   * @param {Buffer} archiveBuffer  - raw ZIP bytes
   * @param {number} fileCount
   * @returns {Promise<object>} the saved workspace document
   */
  async saveWorkspace(apiKey, workspaceId, archiveBuffer, fileCount) {
    const identity = userKey(apiKey);
    await this.ping();

    // Upload ZIP into GridFS
    const archiveId = await new Promise((resolve, reject) => {
      const uploadStream = this.archiveBucket.openUploadStream(
        `${workspaceId}.zip`,
        {
          metadata: { workspace_id: workspaceId, user_id: identity },
        }
      );
      uploadStream.on("finish", () => resolve(uploadStream.id));
      uploadStream.on("error", reject);
      Readable.from(archiveBuffer).pipe(uploadStream);
    });

    const document = {
      workspace_id: workspaceId,
      user_id: identity,
      archive_id: archiveId,
      file_count: fileCount,
      created_at: new Date(),
    };

    try {
      // Insert workspace into the database
      await this.workspaces.insertOne(document);
    } catch (err) {
      // Roll back GridFS upload on failure (mirrors Python DuplicateKeyError handling)
      await this.archiveBucket.delete(archiveId).catch(() => {});
      if (err.code === 11000) {
        throw new Error("Workspace id already exists.");
      }
      throw err;
    }

    return document;
  }

  /**
   * Fetch workspace metadata for a given user + workspace.
   * Mirrors Python: get_workspace(api_key, workspace_id)
   *
   * @param {string} apiKey
   * @param {string} workspaceId
   * @returns {Promise<object|null>}
   */
  async getWorkspace(apiKey, workspaceId) {
    await this.ping();
    return this.workspaces.findOne({
      workspace_id: workspaceId,
      user_id: userKey(apiKey),
    });
  }

  /**
   * Download a workspace's ZIP archive from GridFS as a Buffer.
   * Mirrors Python: read_workspace_archive(workspace_document)
   *
   * @param {object} workspaceDocument - document returned by getWorkspace()
   * @returns {Promise<Buffer>}
   */
  async readWorkspaceArchive(workspaceDocument) {
    await this.ping();
    const downloadStream = this.archiveBucket.openDownloadStream(
      workspaceDocument.archive_id
    );
    const chunks = [];
    for await (const chunk of downloadStream) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  }

  // -------------------------------------------------------------------------
  // Conversation methods
  // -------------------------------------------------------------------------

  /**
   * Append a prompt/answer turn to the conversation history.
   * Mirrors Python: append_turn(api_key, workspace_id, prompt, answer, execution_trace)
   *
   * @param {string}      apiKey
   * @param {string}      workspaceId
   * @param {string}      prompt
   * @param {string}      answer
   * @param {object|null} [executionTrace]
   */
  async appendTurn(apiKey, workspaceId, prompt, answer, executionTrace = null) {
    await this.ping();
    const turnDoc = {
      user_id: userKey(apiKey),
      workspace_id: workspaceId,
      prompt,
      answer,
      created_at: new Date(),
    };
    if (executionTrace) {
      turnDoc.execution_trace = executionTrace;
    }
    await this.conversations.insertOne(turnDoc);
  }

  /**
   * Load full conversation history for a user + workspace as a chat array.
   * Mirrors Python: load_conversation(api_key, workspace_id)
   *
   * @param {string} apiKey
   * @param {string} workspaceId
   * @returns {Promise<Array<{role: string, content: string}>>}
   */
  async loadConversation(apiKey, workspaceId) {
    await this.ping();
    const turns = await this.conversations
      .find(
        { user_id: userKey(apiKey), workspace_id: workspaceId },
        { projection: { _id: 0, prompt: 1, answer: 1, created_at: 1 } }
      )
      .sort({ created_at: 1, _id: 1 })
      .toArray();

    const history = [];
    for (const turn of turns) {
      history.push({ role: "user", content: turn.prompt });
      history.push({ role: "assistant", content: turn.answer });
    }
    return history;
  }

  /** Close the underlying MongoDB connection. */
  async close() {
    await this.client.close();
  }
}

// ---------------------------------------------------------------------------
// Singleton — mirrors Python get_mongo_store()
// ---------------------------------------------------------------------------
let _store = null;

/**
 * Returns the singleton MongoStore instance, creating it on first call.
 * The instance is connected and indexes are ready before returning.
 *
 * @param {object} [opts] - Same options as MongoStore constructor (only used on first call)
 * @returns {Promise<MongoStore>}
 */
export async function getMongoStore(opts = {}) {
  if (!_store) {
    _store = new MongoStore(opts);
    await _store.client.connect();
    await _store.ensureIndexes();
  }
  return _store;
}
