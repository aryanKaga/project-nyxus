"""MongoDB persistence for workspace archives and conversation turns."""
import hashlib
import io
import os
from datetime import datetime, timezone
from urllib.parse import urlsplit, urlunsplit

from gridfs import GridFSBucket
from pymongo import MongoClient
from pymongo.errors import DuplicateKeyError

#hash user api key
def user_key(api_key):
    if not isinstance(api_key, str) or not api_key:
        raise ValueError("An API key is required.")
    return hashlib.sha256(api_key.encode("utf-8")).hexdigest()


class MongoStore:
    def __init__(self, uri=None, username=None, password=None, database=None):
        uri = uri or os.environ.get("MONGODB_URI")
        if not uri:
            raise RuntimeError("MONGODB_URI is not configured.")
        username = username or os.environ.get("MONGODB_USERNAME")
        password = password or os.environ.get("MONGODB_PASSWORD")
        parsed_uri = urlsplit(uri)
        if "@" in parsed_uri.netloc and (username or password):
            uri = urlunsplit((
                parsed_uri.scheme,
                parsed_uri.netloc.rsplit("@", 1)[-1],
                parsed_uri.path,
                parsed_uri.query,
                parsed_uri.fragment,
            ))
        timeout_ms = int(os.environ.get("MONGODB_TIMEOUT_MS", "30000"))
        client_kwargs = {
            "serverSelectionTimeoutMS": timeout_ms,
            "connectTimeoutMS": min(timeout_ms, 20000),
            "socketTimeoutMS": 45000,
        }
        if username:
            client_kwargs["username"] = username
        if password:
            client_kwargs["password"] = password
        self.client = MongoClient(uri, **client_kwargs)
        database_name = database or os.environ.get("MONGODB_DATABASE", "nyxus")


        "connecting to the nyxus database"
        self.database = self.client[database_name]
        self.workspaces = self.database["workspaces"]
        self.conversations = self.database["conversations"]  


        self.archive_bucket = GridFSBucket(self.database, bucket_name="workspace_archives")


    def ping(self):
        self.client.admin.command("ping")

    def save_workspace(self, api_key, workspace_id, archive, file_count):
        identity = user_key(api_key)
        self.ping()
        archive_id = self.archive_bucket.upload_from_stream(
            f"{workspace_id}.zip",
            io.BytesIO(archive),
            metadata={"workspace_id": workspace_id, "user_id": identity},
        )
        document = {
            "workspace_id": workspace_id,
            "user_id": identity,
            "archive_id": archive_id,
            "file_count": file_count,
            "created_at": datetime.now(timezone.utc),
        }
        try:
            "inserts a workspace into our databse prrobably important most"
            self.workspaces.insert_one(document)
        except DuplicateKeyError:
            self.archive_bucket.delete(archive_id)
            raise ValueError("Workspace id already exists.")
        except Exception:
            self.archive_bucket.delete(archive_id)
            raise
        return document

    def get_workspace(self, api_key, workspace_id):
        self.ping()
        if not api_key:
            return self.workspaces.find_one({"workspace_id": workspace_id})
        try:
            doc = self.workspaces.find_one(
                {"workspace_id": workspace_id, "user_id": user_key(api_key)}
            )
            if doc:
                return doc
        except Exception:
            pass
        doc = self.workspaces.find_one(
            {"workspace_id": workspace_id, "user_id": api_key}
        )
        if doc:
            return doc
        return self.workspaces.find_one({"workspace_id": workspace_id})

    def read_workspace_archive(self, workspace_document):
        self.ping()
        return self.archive_bucket.open_download_stream(
            workspace_document["archive_id"]
        ).read()

    def append_turn(self, api_key, workspace_id, prompt, answer, execution_trace=None):
        self.ping()
        uid = api_key
        try:
            uid = user_key(api_key)
        except Exception:
            pass
        turn_doc = {
            "user_id": uid,
            "workspace_id": workspace_id,
            "prompt": prompt,
            "answer": answer,
            "created_at": datetime.now(timezone.utc),
        }
        if execution_trace:
            turn_doc["execution_trace"] = execution_trace
        self.conversations.insert_one(turn_doc)

    def load_conversation(self, api_key, workspace_id):
        self.ping()
        turns = None
        if api_key:
            try:
                turns = list(self.conversations.find(
                    {"user_id": user_key(api_key), "workspace_id": workspace_id},
                    {"_id": 0, "prompt": 1, "answer": 1},
                ).sort([("created_at", 1), ("_id", 1)]))
            except Exception:
                pass
            if not turns:
                turns = list(self.conversations.find(
                    {"user_id": api_key, "workspace_id": workspace_id},
                    {"_id": 0, "prompt": 1, "answer": 1},
                ).sort([("created_at", 1), ("_id", 1)]))
        if not turns:
            turns = list(self.conversations.find(
                {"workspace_id": workspace_id},
                {"_id": 0, "prompt": 1, "answer": 1},
            ).sort([("created_at", 1), ("_id", 1)]))

        history = []
        for turn in turns:
            history.extend((
                {"role": "user", "content": turn["prompt"]},
                {"role": "assistant", "content": turn["answer"]},
            ))
        return history


_store = None


def get_mongo_store():
    global _store
    if _store is None:
        _store = MongoStore()
    return _store
