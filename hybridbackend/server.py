import asyncio
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
import logging
import os
from pathlib import Path
import shutil
import sys
import threading
import time
import uuid
from typing import Optional

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Response, status
from fastapi.middleware.cors import CORSMiddleware
import socketio as python_socketio
import uvicorn

from database.mongo_store import get_mongo_store, user_key
from ingestion.workspace_receiver import (
    MAX_ARCHIVE_BYTES,
    ArchiveError,
    unpack_workspace_archive,
)
from ingestion.workspace_loader import load_workspace


BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / "atlas-credentials.env")
AGENT_DIR = BASE_DIR / "src" / "agent"
STORAGE_DIR = Path(os.environ.get("WORKSPACE_STORAGE", BASE_DIR / "workspaces")).resolve()

# Dedicated runtime session identifier generated for this container execution
RUNTIME_SESSION_ID = f"sess-{uuid.uuid4().hex[:12]}"

# Container environment configuration
CONTAINER_WORKSPACE_ID = os.environ.get("WORKSPACE_ID") or os.environ.get("NYXUS_WORKSPACE_ID")
CONTAINER_USER_ID = os.environ.get("USER_ID") or os.environ.get("NYXUS_USER_ID") or os.environ.get("NYXUS_API_KEY", "abc123")
EXPECTED_API_KEY = os.environ.get("NYXUS_API_KEY", "abc123")
HOST = os.environ.get("NYXUS_HOST", os.environ.get("HOST", "0.0.0.0"))
PORT = int(os.environ.get("PORT", os.environ.get("NYXUS_PORT", "3000")))
CHAT_TIMEOUT_SECONDS = int(os.environ.get("NYXUS_CHAT_TIMEOUT_SECONDS", "900"))

if str(AGENT_DIR) not in sys.path:
    sys.path.insert(0, str(AGENT_DIR))
from timeouts import AgentTimeoutError, task_deadline
from readme_writer import stream_readme_answer, write_readme_answer

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("hybridbackend")

_main_loop = None
_container_ready = False
_container_init_error = None


@dataclass
class DedicatedSession:
    """Dedicated single-user workspace session for this container runtime."""
    workspace_id: str
    thread_id: str
    graph: object
    session_id: str = field(default_factory=lambda: RUNTIME_SESSION_ID)
    history: list = field(default_factory=list)
    history_pending: bool = True
    lock: threading.Lock = field(default_factory=threading.Lock)


# Backwards compatibility alias
WorkspaceSession = DedicatedSession

# Single active dedicated session for this container
current_session: Optional[DedicatedSession] = None
_session_lock = threading.Lock()


# Compatibility dict-like mapping for legacy callers / tests
class _SessionWorkspaceMapping(dict):
    def __getitem__(self, key):
        return current_session.workspace_id if current_session else None

    def get(self, key, default=None):
        return current_session.workspace_id if current_session else default

    def __contains__(self, key):
        return current_session is not None


user_to_workspaceid = _SessionWorkspaceMapping()
workspace_sessions = {}


def _session_matches(sid=None, workspace_id=None, api_key=None):
    return current_session is not None and (
        not workspace_id or current_session.workspace_id == workspace_id
    )


def _touch_workspace(workspace_id=None):
    pass


def _begin_workspace_task(workspace_id=None):
    pass


def _end_workspace_task(workspace_id=None):
    pass


class SocketIOTestClient:
    def __init__(self, sio, app=None):
        self.sio = sio
        self.app = app
        self.sid = "test-sid-" + uuid.uuid4().hex[:8]
        self.received = []
        self._orig_emit = sio.emit

        def test_emit(event, data=None, to=None, **kwargs):
            if to is None or to == self.sid:
                self.received.append({"name": event, "args": [data] if data is not None else []})
            return None

        sio.emit = test_emit

    def emit(self, event, *args, callback=False):
        handler = self.sio.handlers.get("/", {}).get(event)
        if not handler:
            return None
        try:
            loop = asyncio.get_event_loop()
        except RuntimeError:
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)

        if asyncio.iscoroutinefunction(handler):
            res = loop.run_until_complete(handler(self.sid, *args))
        else:
            res = handler(self.sid, *args)
        return res

    def get_received(self):
        r = list(self.received)
        self.received.clear()
        return r

    def disconnect(self):
        self.sio.emit = self._orig_emit
        handler = self.sio.handlers.get("/", {}).get("disconnect")
        if handler:
            try:
                loop = asyncio.get_event_loop()
            except RuntimeError:
                loop = asyncio.new_event_loop()
                asyncio.set_event_loop(loop)
            if asyncio.iscoroutinefunction(handler):
                loop.run_until_complete(handler(self.sid))
            else:
                handler(self.sid)


class AsyncSocketIOServer(python_socketio.AsyncServer):
    def emit(self, event, data=None, to=None, **kwargs):
        coro = super().emit(event, data, to=to, **kwargs)
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            loop = None

        if loop and loop.is_running():
            return loop.create_task(coro)
        elif _main_loop and _main_loop.is_running():
            return asyncio.run_coroutine_threadsafe(coro, _main_loop)
        else:
            try:
                return asyncio.run(coro)
            except RuntimeError:
                return coro

    def start_background_task(self, target, *args, **kwargs):
        if asyncio.iscoroutinefunction(target):
            try:
                loop = asyncio.get_running_loop()
                return loop.create_task(target(*args, **kwargs))
            except RuntimeError:
                pass
        thread = threading.Thread(target=target, args=args, kwargs=kwargs, daemon=True)
        thread.start()
        return thread

    def test_client(self, app=None):
        return SocketIOTestClient(self, app)


socketio = AsyncSocketIOServer(
    async_mode="asgi",
    cors_allowed_origins="*",
    max_http_buffer_size=MAX_ARCHIVE_BYTES + 1024 * 1024,
)
sio = socketio


def init_dedicated_session(workspace_id: str, api_key: str = None) -> DedicatedSession:
    """Download workspace from MongoDB if needed and compile the agent graph for this container."""
    global current_session
    with _session_lock:
        if current_session is not None and current_session.workspace_id == workspace_id:
            return current_session

        api_key = api_key or CONTAINER_USER_ID
        store = None
        try:
            store = get_mongo_store()
        except Exception as exc:
            logger.warning("MongoDB store unavailable during workspace init: %s", exc)

        result = load_workspace(
            workspace_id,
            api_key,
            STORAGE_DIR,
            store,
        ) if store is not None else None

        if result is None:
            raise LookupError(f"Workspace {workspace_id} not found in MongoDB for this user.")

        from agent_loop import build_graph

        graph = build_graph(root=result["workspace_path"], agent_dir=AGENT_DIR)
        history = store.load_conversation(api_key, workspace_id) if store else []
        session = DedicatedSession(
            session_id=RUNTIME_SESSION_ID,
            workspace_id=workspace_id,
            thread_id=f"{workspace_id}:{user_key(api_key)}",
            graph=graph,
            history=history,
        )
        current_session = session
        workspace_sessions[RUNTIME_SESSION_ID] = session
        return session


# Compatibility helpers
def _get_workspace_session(sid=None, api_key=None):
    global current_session
    if current_session is not None:
        return current_session
    ws_id = CONTAINER_WORKSPACE_ID
    if not ws_id:
        raise LookupError("Upload or select a workspace before chatting.")
    return init_dedicated_session(ws_id, api_key)


def _activate_workspace(sid, workspace_id, api_key):
    return init_dedicated_session(workspace_id, api_key)


async def _init_container_workspace():
    """Startup task: download and initialize workspace for the dedicated container."""
    global _container_ready, _container_init_error
    try:
        logger.info(
            "Container startup: downloading workspace %s from MongoDB (dedicated session: %s)...",
            CONTAINER_WORKSPACE_ID,
            RUNTIME_SESSION_ID,
        )
        await asyncio.to_thread(init_dedicated_session, CONTAINER_WORKSPACE_ID, CONTAINER_USER_ID)
        _container_ready = True
        logger.info("Dedicated session %s ready for workspace %s.", RUNTIME_SESSION_ID, CONTAINER_WORKSPACE_ID)
    except Exception as exc:
        _container_init_error = str(exc)
        logger.exception("Failed to initialize workspace for container")


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _main_loop
    _main_loop = asyncio.get_running_loop()
    if CONTAINER_WORKSPACE_ID:
        asyncio.create_task(_init_container_workspace())
    yield


app = FastAPI(title="Nyxus Dedicated Agent Container", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
@app.get("/live")
async def health_check():
    """Kubernetes liveness probe endpoint."""
    return {
        "status": "ok",
        "mode": "dedicated_container",
        "session_id": RUNTIME_SESSION_ID,
        "workspace_id": CONTAINER_WORKSPACE_ID or (current_session.workspace_id if current_session else None),
    }


@app.get("/ready")
async def readiness_check(response: Response):
    """Kubernetes readiness probe endpoint."""
    if CONTAINER_WORKSPACE_ID and not _container_ready:
        if _container_init_error:
            response.status_code = status.HTTP_500_INTERNAL_SERVER_ERROR
            return {
                "status": "error",
                "session_id": RUNTIME_SESSION_ID,
                "workspace_id": CONTAINER_WORKSPACE_ID,
                "error": _container_init_error,
            }
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
        return {
            "status": "initializing",
            "session_id": RUNTIME_SESSION_ID,
            "workspace_id": CONTAINER_WORKSPACE_ID,
            "message": "Downloading workspace from MongoDB...",
        }
    return {
        "status": "ready",
        "session_id": RUNTIME_SESSION_ID,
        "workspace_id": CONTAINER_WORKSPACE_ID or (current_session.workspace_id if current_session else "dynamic"),
        "ready": True,
    }


asgi_app = python_socketio.ASGIApp(socketio, other_asgi_app=app)


def _authorized(data):
    if not isinstance(data, dict):
        return False
    key = data.get("apiKey") or data.get("apikey")
    if key and (key == EXPECTED_API_KEY or key == CONTAINER_USER_ID):
        return True
    uid = data.get("user_id") or data.get("userId")
    if uid and uid == CONTAINER_USER_ID:
        return True
    if EXPECTED_API_KEY in ("*", ""):
        return True
    return key == EXPECTED_API_KEY


def _chat_progress(sid, stop_event):
    while not stop_event.wait(10):
        socketio.emit(
            "assistant_progress",
            {"message": "Still working on your request…"},
            to=sid,
        )


def _run_agent_chat(
    sid,
    prompt,
    api_key,
    workspace_id=None,
    readme_mode=False,
):
    global current_session
    from agent_loop import final_answer, run_task
    from observability import setup_observability

    progress_stop = threading.Event()
    session = _get_workspace_session(sid, api_key)
    if session is None:
        socketio.emit("assistant_error", {"error": "Workspace is not loaded."}, to=sid)
        return
    current_session = session

    chat_started_at = time.monotonic()
    try:
        socketio.start_background_task(_chat_progress, sid, progress_stop)
        with session.lock:
            def on_trace_event(action, entry):
                try:
                    name = entry.get("name") or entry.get("status") or ""
                    detail = f"{action}:{name}" if name else action
                    socketio.emit("flow_event", {"event": f"agent.{detail}"}, to=sid)
                except Exception:
                    pass

            tracing = setup_observability(
                session.graph.agent_config,
                session.workspace_id,
                session.thread_id,
                on_event=on_trace_event,
            )
            state = run_task(
                session.graph,
                prompt,
                session.thread_id,
                task_id=str(uuid.uuid4()),
                callbacks_config=tracing,
                history=session.history if session.history_pending else None,
                timeout_seconds=CHAT_TIMEOUT_SECONDS,
            )
            answer = final_answer(state)
            trace = state.get("execution_trace", []) or (
                tracing["tracer"].get_trace() if "tracer" in tracing else []
            )
            diagram = state.get("architecture_diagram")
            if diagram is not None:
                filename = f"architecture-diagram-{uuid.uuid4().hex[:12]}.html"
                socketio.emit(
                    "architecture_diagram",
                    {
                        "filename": filename,
                        "title": diagram["title"],
                        "html": diagram["html"],
                    },
                    to=sid,
                )
                answer += (
                    f"\n\nThe architecture diagram was generated and sent to VS Code "
                    f"for saving as `.nyxus/architecture-diagrams/{filename}` and "
                    "automatic rendering."
                )
            if readme_mode:
                socketio.emit(
                    "assistant_progress",
                    {"message": "Formatting answer as polished README…"},
                    to=sid,
                )
                writer_model = getattr(session.graph, "agent_digest_model", None)
                if writer_model is None:
                    raise RuntimeError("The README writer model is not configured.")
                remaining_budget = CHAT_TIMEOUT_SECONDS - (
                    time.monotonic() - chat_started_at
                )
                if remaining_budget <= 0:
                    raise AgentTimeoutError(
                        "The chat request exceeded its configured time limit."
                    )
                with task_deadline(remaining_budget):
                    answer = stream_readme_answer(
                        writer_model,
                        prompt,
                        answer,
                        on_chunk=lambda chunk: socketio.emit(
                            "assistant_chunk", {"token": chunk}, to=sid
                        ),
                    )
            else:
                socketio.emit("assistant_chunk", {"token": answer}, to=sid)
            session.history_pending = False
            try:
                get_mongo_store().append_turn(
                    api_key,
                    session.workspace_id,
                    prompt,
                    answer,
                    execution_trace=trace,
                )
            except Exception:
                logger.warning("Could not persist conversation turn to MongoDB")

            session.history.extend((
                {"role": "user", "content": prompt},
                {"role": "assistant", "content": answer},
            ))
        if trace:
            socketio.emit("agent_trace", {"trace": trace}, to=sid)
        if readme_mode:
            socketio.emit(
                "readme_answer",
                {"filename": "answer.md", "markdown": answer},
                to=sid,
            )
        socketio.emit("assistant_end", {}, to=sid)
    except AgentTimeoutError:
        logger.warning(
            "Chat request for dedicated session %s exceeded its %ss deadline",
            RUNTIME_SESSION_ID,
            CHAT_TIMEOUT_SECONDS,
        )
        socketio.emit(
            "assistant_error",
            {
                "error": (
                    f"This request exceeded the {CHAT_TIMEOUT_SECONDS}-second "
                    "time limit. Try a narrower question or request a smaller diagram."
                )
            },
            to=sid,
        )
    except Exception:
        logger.exception("Agent loop failed for a chat request")
        socketio.emit(
            "assistant_error",
            {"error": "The codebase agent could not complete that request."},
            to=sid,
        )
    finally:
        progress_stop.set()


@socketio.on("connect")
async def connect_client(sid, environ, auth=None):
    logger.info("Client connected: %s (dedicated session: %s)", sid, RUNTIME_SESSION_ID)
    return True


@socketio.on("workspace_archive")
def receive_workspace_archive(sid, data):
    if not isinstance(data, dict):
        return {"ok": False, "error": "Invalid workspace archive request."}
    if not _authorized(data):
        return {"ok": False, "error": "Invalid API key."}

    api_key = data.get("apiKey") or data.get("apikey") or CONTAINER_USER_ID
    result = None
    try:
        result = unpack_workspace_archive(data.get("archive"), STORAGE_DIR)
        get_mongo_store().save_workspace(
            api_key,
            result["workspace_id"],
            data["archive"],
            result["file_count"],
        )
        workspace_path = STORAGE_DIR / result["workspace_id"]
        try:
            from agent_loop import build_graph
            graph = build_graph(root=workspace_path, agent_dir=AGENT_DIR)
        except Exception:
            graph = None
        global current_session
        current_session = DedicatedSession(
            workspace_id=result["workspace_id"],
            thread_id=f"{result['workspace_id']}:{user_key(api_key)}",
            graph=graph,
            history=[],
        )
    except ArchiveError as error:
        return {"ok": False, "error": str(error)}
    except Exception:
        if result is not None:
            shutil.rmtree(STORAGE_DIR / result["workspace_id"], ignore_errors=True)
        logger.exception("Failed to receive workspace archive")
        return {
            "ok": False,
            "error": "The server could not persist the workspace. Check MongoDB configuration and try again.",
        }

    logger.info(
        "Received workspace %s with %s files for dedicated session %s",
        result["workspace_id"],
        result["file_count"],
        RUNTIME_SESSION_ID,
    )
    return {"ok": True, "session_id": RUNTIME_SESSION_ID, **result}


@socketio.on("workspace_resume")
def resume_workspace(sid, data):
    if not isinstance(data, dict) or not _authorized(data):
        return {"ok": False, "error": "Invalid API key."}
    workspace_id = data.get("workspace_id") or (current_session.workspace_id if current_session else CONTAINER_WORKSPACE_ID)
    if not isinstance(workspace_id, str) or not workspace_id:
        return {"ok": False, "error": "A workspace id is required."}

    api_key = data.get("apiKey") or data.get("apikey") or CONTAINER_USER_ID
    try:
        session = init_dedicated_session(workspace_id, api_key)
    except LookupError:
        return {
            "ok": False,
            "workspace_required": True,
            "error": "That workspace id is not available for this Nyxus user. Upload the workspace to continue.",
        }
    except Exception:
        logger.exception("Failed to load workspace from MongoDB")
        return {"ok": False, "error": "The server could not load that workspace from MongoDB."}

    return {
        "ok": True,
        "workspace_id": session.workspace_id,
        "history": session.history,
        "session_id": session.session_id,
    }


@socketio.on("chat")
def receive_chat(sid, data):
    if not isinstance(data, dict):
        return {"ok": False, "error": "Invalid chat request."}
    if not _authorized(data):
        return {"ok": False, "error": "Invalid API key."}
    if not isinstance(data.get("prompt"), str) or not data["prompt"].strip():
        return {"ok": False, "error": "Enter a message before sending."}
    if "readme_mode" in data and not isinstance(data["readme_mode"], bool):
        return {"ok": False, "error": "README mode must be a boolean."}

    api_key = data.get("apiKey") or data.get("apikey") or CONTAINER_USER_ID
    requested_workspace_id = data.get("workspace_id")
    if requested_workspace_id is not None and not isinstance(requested_workspace_id, str):
        return {"ok": False, "error": "Workspace id must be a string."}

    target_ws = requested_workspace_id or (current_session.workspace_id if current_session else CONTAINER_WORKSPACE_ID)
    if not target_ws:
        return {
            "ok": False,
            "error": "A workspace is required. Upload one or provide a saved workspace id.",
        }

    if not current_session or current_session.workspace_id != target_ws:
        try:
            init_dedicated_session(target_ws, api_key)
        except LookupError:
            return {
                "ok": False,
                "error": "That workspace id is not available for this Nyxus user. Select a saved workspace or upload it again.",
            }
        except Exception:
            logger.exception("Failed to activate workspace for chat")
            return {"ok": False, "error": "The server could not load the requested workspace."}

    try:
        socketio.emit("assistant_start", {}, to=sid)
        socketio.start_background_task(
            _run_agent_chat,
            sid,
            data["prompt"].strip(),
            api_key,
            current_session.workspace_id,
            data.get("readme_mode", False),
        )
    except Exception:
        logger.exception("Could not start chat task")
        socketio.emit(
            "assistant_error",
            {"error": "The server could not start this chat request. Please retry."},
            to=sid,
        )
        return {"ok": False, "error": "The server could not start the chat request."}
    return {"ok": True}


@socketio.on("architecture_diagram_status")
def architecture_diagram_status(sid, data):
    if not isinstance(data, dict) or not _authorized(data):
        return {"ok": False, "error": "Invalid API key."}
    status = data.get("status")
    if status not in {"rendered", "failed"}:
        return {"ok": False, "error": "Invalid diagram rendering status."}

    if status == "failed":
        logger.error(
            "Architecture preview failed: %s",
            str(data.get("error", "unknown client rendering error"))[:300],
        )
        socketio.emit(
            "assistant_error",
            {"error": "The architecture HTML arrived, but VS Code could not render it. Check the Nyxus Replica output log."},
            to=sid,
        )
    else:
        logger.info(
            "Architecture preview rendered as %s",
            str(data.get("filename", ""))[:100],
        )
    return {"ok": True}


@socketio.on("disconnect")
def disconnect_workspace(sid, *args):
    logger.info("Client disconnected: %s (dedicated session remains active)", sid)


if __name__ == "__main__":
    uvicorn.run(asgi_app, host=HOST, port=PORT )
