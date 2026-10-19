/** MongoDB persistence for workspace archives and conversation turns. */
import crypto from "node:crypto";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { MongoClient, GridFSBucket } from "mongodb";
import dotenv from "dotenv";
dotenv.config()
// hash user api key
export function userKey(apiKey) {
  if (typeof apiKey !== "string" || !apiKey) {
    throw new Error("An API key is required.");
  }
  return crypto.createHash("sha256").update(apiKey, "utf8").digest("hex");
}

export class MongoStore {
  constructor({ uri, username, password, database } = {}) {
    uri = uri || process.env.MONGODB_URI;
    if (!uri) {
      throw new Error("MONGODB_URI is not configured.");
    }
    username = username || process.env.MONGODB_USERNAME;
    password = password || process.env.MONGODB_PASSWORD;

    // If explicit credentials are supplied, strip any credentials embedded in the URI.
    const parsed = new URL(uri);
    if ((parsed.username || parsed.password) && (username || password)) {
      parsed.username = "";
      parsed.password = "";
      uri = parsed.toString();
    }

    const options = { serverSelectionTimeoutMS: 5000 };
    if (username || password) {
      options.auth = { username, password };
    }

    // mongo client used for all crud operations
    this.client = new MongoClient(uri, options);

    const databaseName = database || process.env.MONGODB_DATABASE || "nyxus";

    // connecting to the nyxus database
    this.database = this.client.db(databaseName);
    this.workspaces = this.database.collection("workspaces");
    this.conversations = this.database.collection("conversations");

    // GridFS bucket: a file driver that stores/retrieves files using MongoDB as storage
    this.archiveBucket = new GridFSBucket(this.database, {
      bucketName: "workspace_archives",
    });

    // Index creation is async in JS, so it runs once on first use via init().
    this._ready = null;
  }

  /** Creates indexes once. Called automatically by every public method. */
  init() {
    if (!this._ready) {
      this._ready = (async () => {
        await this.workspaces.createIndex({ workspace_id: 1 }, { unique: true });
        await this.workspaces.createIndex({ user_id: 1, created_at: -1 });
        await this.conversations.createIndex({
          user_id: 1,
          workspace_id: 1,
          created_at: 1,
        });
      })().catch((err) => {
        this._ready = null; // allow retry after a failure
        throw err;
      });
    }
    return this._ready;
  }

  async ping() {
    await this.client.db("admin").command({ ping: 1 });
  }

  async _prepare() {
    await this.ping();
    await this.init();
  }

  async saveWorkspace(apiKey, workspaceId, archive, fileCount) {
    const identity = userKey(apiKey);
    await this._prepare();

    // archive must be a Buffer / Uint8Array
    const uploadStream = this.archiveBucket.openUploadStream(
      `${workspaceId}.zip`,
      { metadata: { workspace_id: workspaceId, user_id: identity } }
    );
    await pipeline(Readable.from([Buffer.from(archive)]), uploadStream);
    const archiveId = uploadStream.id;

    const document = {
      workspace_id: workspaceId,
      user_id: identity,
      archive_id: archiveId,
      file_count: fileCount,
      created_at: new Date(),
    };

    try {
      // inserts a workspace into our database
      await this.workspaces.insertOne(document);
    } catch (err) {
      await this.archiveBucket.delete(archiveId);
      if (err?.code === 11000) {
        throw new Error("Workspace id already exists.");
      }
      throw err;
    }
    return document;
  }

  async getWorkspace(apiKey, workspaceId) {
    await this._prepare();
    return this.workspaces.findOne({
      workspace_id: workspaceId,
      user_id: userKey(apiKey),
    });
  }

  async readWorkspaceArchive(workspaceDocument) {
    await this._prepare();
    const stream = this.archiveBucket.openDownloadStream(
      workspaceDocument.archive_id
    );
    const chunks = [];
    for await (const chunk of stream) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  }

  async appendTurn(apiKey, workspaceId, prompt, answer, executionTrace = null) {
    await this._prepare();
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

  async loadConversation(apiKey, workspaceId) {
    await this._prepare();
    const turns = this.conversations
      .find(
        { user_id: userKey(apiKey), workspace_id: workspaceId },
        { projection: { _id: 0, prompt: 1, answer: 1 } }
      )
      .sort({ created_at: 1, _id: 1 });

    const history = [];
    for await (const turn of turns) {
      history.push(
        { role: "user", content: turn.prompt },
        { role: "assistant", content: turn.answer }
      );
    }
    return history;
  }

  async close() {
    await this.client.close();
  }
}

let _store = null;

export function getMongoStore() {
  if (!_store) {
    _store = new MongoStore();
  }
  return _store;
}


export default getMongoStore