import logging
import os
import shutil
import time
from dataclasses import dataclass, field
from pathlib import Path
import sys
import threading
import uuid

from dotenv import load_dotenv
from flask import Flask, request
from flask_socketio import SocketIO

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
EXPECTED_API_KEY = os.environ.get("NYXUS_API_KEY", "abc123")
HOST = os.environ.get("NYXUS_HOST", "127.0.0.1")
PORT = int(os.environ.get("NYXUS_PORT", "3000"))
CHAT_TIMEOUT_SECONDS = int(os.environ.get("NYXUS_CHAT_TIMEOUT_SECONDS", "900"))
WORKSPACE_IDLE_TIMEOUT_SECONDS = 10 * 60
WORKSPACE_CLEANUP_INTERVAL_SECONDS = 30
if str(AGENT_DIR) not in sys.path:
    sys.path.insert(0, str(AGENT_DIR))
from timeouts import AgentTimeoutError, task_deadline
from readme_writer import stream_readme_answer, write_readme_answer

app = Flask(__name__)
socketio = SocketIO(
    app,
    cors_allowed_origins="*",
    async_mode="threading",
    max_http_buffer_size=MAX_ARCHIVE_BYTES + 1024 * 1024,
)
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("hybridbackend")


@dataclass
class WorkspaceSession:
    workspace_id: str
    thread_id: str
    graph: object
    history: list = field(default_factory=list)
    history_pending: bool = True
    lock: threading.Lock = field(default_factory=threading.Lock)


user_to_workspaceid = {}
workspace_sessions = {}
_workspace_sessions_lock = threading.Lock()
workspace_last_access = {}
_workspace_task_counts = {}


def _touch_workspace(workspace_id):
    if not isinstance(workspace_id, str):
        return
    try:
        if str(uuid.UUID(workspace_id)) != workspace_id:
            return
    except (TypeError, ValueError, AttributeError):
        return

    now = time.time()
    marker = STORAGE_DIR / ".workspace-activity" / workspace_id
    try:
        marker.parent.mkdir(parents=True, exist_ok=True)
        marker.touch(exist_ok=True)
        os.utime(marker, (now, now))
    except OSError:
        logger.exception("Could not update activity marker for workspace %s", workspace_id)
    with _workspace_sessions_lock:
        workspace_last_access[workspace_id] = now


def _begin_workspace_task(workspace_id):
    _touch_workspace(workspace_id)
    with _workspace_sessions_lock:
        _workspace_task_counts[workspace_id] = (
            _workspace_task_counts.get(workspace_id, 0) + 1
        )


def _end_workspace_task(workspace_id):
    _touch_workspace(workspace_id)
    with _workspace_sessions_lock:
        count = _workspace_task_counts.get(workspace_id, 0)
        if count <= 1:
            _workspace_task_counts.pop(workspace_id, None)
        else:
            _workspace_task_counts[workspace_id] = count - 1


def _workspace_activity_time(workspace_id, root):
    with _workspace_sessions_lock:
        last_access = workspace_last_access.get(workspace_id)
    if last_access is not None:
        return last_access

    marker = STORAGE_DIR / ".workspace-activity" / workspace_id
    try:
        return marker.stat().st_mtime
    except FileNotFoundError:
        try:
            return root.stat().st_mtime
        except OSError:
            return 0
    except OSError:
        logger.exception("Could not read activity marker for workspace %s", workspace_id)
        return 0


def _cleanup_expired_workspaces(now=None):
    now = time.time() if now is None else now
    STORAGE_DIR.mkdir(parents=True, exist_ok=True)
    expired = []
    with os.scandir(STORAGE_DIR) as entries:
        storage_entries = list(entries)

    for entry in storage_entries:
        if entry.name.startswith(".expired-") and entry.is_dir(follow_symlinks=False):
            try:
                shutil.rmtree(entry.path)
                logger.info("Removed interrupted workspace cleanup directory %s", entry.name)
            except OSError:
                logger.exception("Could not remove interrupted cleanup directory %s", entry.name)

    workspace_entries = [
        entry for entry in storage_entries
        if entry.is_dir(follow_symlinks=False)
    ]

    for entry in workspace_entries:
        workspace_id = entry.name
        try:
            if str(uuid.UUID(workspace_id)) != workspace_id:
                continue
            root = Path(entry.path)
            if now - _workspace_activity_time(workspace_id, root) < WORKSPACE_IDLE_TIMEOUT_SECONDS:
                continue
        except (TypeError, ValueError, OSError):
            continue

        with _workspace_sessions_lock:
            last_access = workspace_last_access.get(workspace_id, 0)
            marker = STORAGE_DIR / ".workspace-activity" / workspace_id
            try:
                last_access = max(last_access, marker.stat().st_mtime)
            except FileNotFoundError:
                try:
                    last_access = max(last_access, root.stat().st_mtime)
                except OSError:
                    pass
            except OSError:
                logger.exception(
                    "Could not recheck activity marker for workspace %s",
                    workspace_id,
                )
                continue
            if now - last_access < WORKSPACE_IDLE_TIMEOUT_SECONDS:
                continue
            if _workspace_task_counts.get(workspace_id, 0):
                continue
            if any(
                session.workspace_id == workspace_id and session.lock.locked()
                for session in workspace_sessions.values()
            ):
                continue
            expired_path = STORAGE_DIR / f".expired-{workspace_id}-{uuid.uuid4().hex}"
            try:
                root.rename(expired_path)
            except FileNotFoundError:
                continue
            except OSError:
                logger.exception("Could not expire idle workspace %s", workspace_id)
                continue
            for sid, session in list(workspace_sessions.items()):
                if session.workspace_id == workspace_id:
                    workspace_sessions.pop(sid, None)
            workspace_last_access.pop(workspace_id, None)
            marker = STORAGE_DIR / ".workspace-activity" / workspace_id
            try:
                marker.unlink(missing_ok=True)
            except OSError:
                logger.exception(
                    "Could not remove activity marker for workspace %s",
                    workspace_id,
                )
            expired.append((workspace_id, expired_path))

    deleted = []
    for workspace_id, expired_path in expired:
        try:
            shutil.rmtree(expired_path)
            deleted.append(workspace_id)
            logger.info(
                "Deleted workspace %s after %s seconds without activity",
                workspace_id,
                WORKSPACE_IDLE_TIMEOUT_SECONDS,
            )
        except OSError:
            logger.exception("Could not finish deleting expired workspace %s", workspace_id)
            try:
                with _workspace_sessions_lock:
                    original_path = STORAGE_DIR / workspace_id
                    if not original_path.exists():
                        expired_path.rename(original_path)
            except OSError:
                logger.exception("Could not restore expired workspace %s", workspace_id)

    return deleted


def _workspace_cleanup_loop():
    while True:
        socketio.sleep(WORKSPACE_CLEANUP_INTERVAL_SECONDS)
        try:
            _cleanup_expired_workspaces()
        except Exception:
            logger.exception("Workspace cleanup failed")


def _authorized(data):
    return isinstance(data, dict) and (
        data.get("apiKey") or data.get("apikey")
    ) == EXPECTED_API_KEY


def _workspace_root(workspace_id):
    root = (STORAGE_DIR / workspace_id).resolve()
    try:
        root.relative_to(STORAGE_DIR)
    except ValueError as error:
        raise ValueError("Workspace path is outside the configured storage.") from error
    if not root.is_dir():
        raise FileNotFoundError("The uploaded workspace is no longer available.")
    return root


def _activate_workspace(sid, workspace_id, api_key):
    _touch_workspace(workspace_id)
    result = load_workspace(
        workspace_id,
        api_key,
        STORAGE_DIR,
        get_mongo_store(),
    )
    if result is None:
        raise LookupError("Workspace id was not found for this Nyxus user.")

    from agent_loop import build_graph

    with _workspace_sessions_lock:
        workspace_sessions.pop(sid, None)
        user_to_workspaceid[sid] = workspace_id
        graph = build_graph(root=result["workspace_path"], agent_dir=AGENT_DIR)
        session = WorkspaceSession(
            workspace_id=workspace_id,
            thread_id=f"{workspace_id}:{user_key(api_key)}",
            graph=graph,
            history=get_mongo_store().load_conversation(api_key, workspace_id),
        )
        workspace_sessions[sid] = session
        return session


def _get_workspace_session(sid, api_key):
    with _workspace_sessions_lock:
        session = workspace_sessions.get(sid)
        workspace_id = user_to_workspaceid.get(sid)
    if session is not None:
        _touch_workspace(session.workspace_id)
        return session
    if not workspace_id:
        raise LookupError("Upload or select a workspace before chatting.")
    return _activate_workspace(sid, workspace_id, api_key)


def _session_matches(sid, workspace_id, api_key):
    with _workspace_sessions_lock:
        session = workspace_sessions.get(sid)
        return (
            session is not None
            and session.workspace_id == workspace_id
            and session.thread_id == f"{workspace_id}:{user_key(api_key)}"
        )


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
    from agent_loop import final_answer, run_task
    from observability import setup_observability

    progress_stop = threading.Event()
    workspace_id = workspace_id or user_to_workspaceid.get(sid)
    chat_started_at = time.monotonic()
    try:
        socketio.start_background_task(_chat_progress, sid, progress_stop)
        session = _get_workspace_session(sid, api_key)
        workspace_id = session.workspace_id
        _touch_workspace(workspace_id)
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
            get_mongo_store().append_turn(
                api_key,
                session.workspace_id,
                prompt,
                answer,
                execution_trace=trace,
            )
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
            "Chat request for workspace %s exceeded its %ss deadline",
            user_to_workspaceid.get(sid, "unknown"),
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
        if workspace_id:
            _end_workspace_task(workspace_id)


@socketio.on("workspace_archive")
def receive_workspace_archive(data):
    if not isinstance(data, dict):
        return {"ok": False, "error": "Invalid workspace archive request."}
    if not _authorized(data):
        return {"ok": False, "error": "Invalid API key."}

    api_key = data.get("apiKey") or data.get("apikey")
    result = None
    try:
        result = unpack_workspace_archive(data.get("archive"), STORAGE_DIR)
        get_mongo_store().save_workspace(
            api_key,
            result["workspace_id"],
            data["archive"],
            result["file_count"],
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

    sid = request.sid
    _touch_workspace(result["workspace_id"])
    with _workspace_sessions_lock:
        previous = workspace_sessions.pop(sid, None)
        if previous is not None:
            user_to_workspaceid.pop(sid, None)
        user_to_workspaceid[sid] = result["workspace_id"]

    logger.info(
        "Received workspace %s with %s files",
        result["workspace_id"],
        result["file_count"],
    )
    return {"ok": True, **result}


@socketio.on("workspace_resume")
def resume_workspace(data):
    if not isinstance(data, dict) or not _authorized(data):
        return {"ok": False, "error": "Invalid API key."}
    workspace_id = data.get("workspace_id")
    if not isinstance(workspace_id, str) or not workspace_id:
        return {"ok": False, "error": "A workspace id is required."}

    api_key = data.get("apiKey") or data.get("apikey")
    sid = request.sid
    try:
        session = _activate_workspace(sid, workspace_id, api_key)
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
    }


@socketio.on("chat")
def receive_chat(data):
    if not isinstance(data, dict):
        return {"ok": False, "error": "Invalid chat request."}
    if not _authorized(data):
        return {"ok": False, "error": "Invalid API key."}
    if not isinstance(data.get("prompt"), str) or not data["prompt"].strip():
        return {"ok": False, "error": "Enter a message before sending."}
    if "readme_mode" in data and not isinstance(data["readme_mode"], bool):
        return {"ok": False, "error": "README mode must be a boolean."}
    sid = request.sid
    api_key = data.get("apiKey") or data.get("apikey")
    workspace_id = data.get("workspace_id")
    if workspace_id is not None and not isinstance(workspace_id, str):
        return {"ok": False, "error": "Workspace id must be a string."}
    if workspace_id:
        if not _session_matches(sid, workspace_id, api_key):
            try:
                _activate_workspace(sid, workspace_id, api_key)
            except LookupError:
                return {
                    "ok": False,
                    "error": "That workspace id is not available for this Nyxus user. Select a saved workspace or upload it again.",
                }
            except Exception:
                logger.exception("Failed to activate workspace for chat")
                return {"ok": False, "error": "The server could not load the requested workspace."}
    elif sid not in user_to_workspaceid:
        return {
            "ok": False,
            "error": "A workspace is required. Upload one or provide a saved workspace id.",
        }

    with _workspace_sessions_lock:
        active_workspace_id = user_to_workspaceid.get(sid)
    if not active_workspace_id:
        return {
            "ok": False,
            "error": "A workspace is required. Upload one or provide a saved workspace id.",
        }
    _begin_workspace_task(active_workspace_id)
    try:
        socketio.emit("assistant_start", {}, to=sid)
        socketio.start_background_task(
            _run_agent_chat,
            sid,
            data["prompt"].strip(),
            api_key,
            active_workspace_id,
            data.get("readme_mode", False),
        )
    except Exception:
        _end_workspace_task(active_workspace_id)
        logger.exception("Could not start chat task for workspace %s", active_workspace_id)
        socketio.emit(
            "assistant_error",
            {"error": "The server could not start this chat request. Please retry."},
            to=sid,
        )
        return {"ok": False, "error": "The server could not start the chat request."}
    return {"ok": True}


@socketio.on("architecture_diagram_status")
def architecture_diagram_status(data):
    if not isinstance(data, dict) or not _authorized(data):
        return {"ok": False, "error": "Invalid API key."}
    workspace_id = data.get("workspace_id")
    status = data.get("status")
    if status not in {"rendered", "failed"}:
        return {"ok": False, "error": "Invalid diagram rendering status."}
    if not _session_matches(
        request.sid,
        workspace_id,
        data.get("apiKey") or data.get("apikey"),
    ):
        return {"ok": False, "error": "Workspace session does not match."}
    _touch_workspace(workspace_id)

    if status == "failed":
        logger.error(
            "Architecture preview failed for workspace %s: %s",
            workspace_id,
            str(data.get("error", "unknown client rendering error"))[:300],
        )
        socketio.emit(
            "assistant_error",
            {"error": "The architecture HTML arrived, but VS Code could not render it. Check the Nyxus Replica output log."},
            to=request.sid,
        )
    else:
        logger.info(
            "Architecture preview rendered for workspace %s as %s",
            workspace_id,
            str(data.get("filename", ""))[:100],
        )
    return {"ok": True}


@socketio.on("disconnect")
def disconnect_workspace():
    sid = request.sid
    with _workspace_sessions_lock:
        user_to_workspaceid.pop(sid, None)
        workspace_sessions.pop(sid, None)


if __name__ == "__main__":
    socketio.start_background_task(_workspace_cleanup_loop)
    socketio.run(app, host=HOST, port=PORT, allow_unsafe_werkzeug=True)
