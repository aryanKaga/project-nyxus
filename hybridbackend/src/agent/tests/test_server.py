import os
from types import SimpleNamespace

import agent_loop
import observability
import pytest
import server


@pytest.fixture(autouse=True)
def reset_server_state():
    server.current_session = None
    server.CONTAINER_WORKSPACE_ID = None
    server.CONTAINER_USER_ID = "container-user"
    yield
    server.current_session = None
    server.CONTAINER_WORKSPACE_ID = None


class FakeStopEvent:
    def __init__(self):
        self.calls = 0

    def wait(self, seconds):
        assert seconds == 10
        self.calls += 1
        return self.calls > 1


class FakeStore:
    def __init__(self):
        self.workspaces = []
        self.turns = []

    def save_workspace(self, api_key, workspace_id, archive, file_count):
        self.workspaces.append((api_key, workspace_id, archive, file_count))

    def load_conversation(self, api_key, workspace_id):
        return [{"role": "user", "content": "Earlier question"}]

    def append_turn(self, api_key, workspace_id, prompt, answer, execution_trace=None):
        self.turns.append((api_key, workspace_id, prompt, answer))


def test_chat_requires_uploaded_workspace_and_schedules_agent(monkeypatch):
    store = FakeStore()
    monkeypatch.setattr(server, "get_mongo_store", lambda: store)
    monkeypatch.setattr(
        server,
        "unpack_workspace_archive",
        lambda archive, storage: {
            "workspace_id": "workspace-test",
            "file_count": 1,
        },
    )
    scheduled = []
    monkeypatch.setattr(
        server.socketio,
        "start_background_task",
        lambda *args: scheduled.append(args),
    )
    client = server.socketio.test_client(server.app)

    archive_response = client.emit(
        "workspace_archive",
        {"apiKey": server.EXPECTED_API_KEY, "archive": b"test archive"},
        callback=True,
    )
    response = client.emit(
        "chat",
        {"apikey": server.EXPECTED_API_KEY, "prompt": "Where is startup handled?"},
        callback=True,
    )

    assert archive_response["ok"] is True
    assert store.workspaces == [
        (server.EXPECTED_API_KEY, "workspace-test", b"test archive", 1)
    ]
    assert response == {"ok": True}
    assert len(scheduled) == 1
    sid, prompt, api_key, _, readme_mode = scheduled[0][1:]
    assert server.user_to_workspaceid[sid] == "workspace-test"
    assert prompt == "Where is startup handled?"
    assert api_key == server.EXPECTED_API_KEY
    assert readme_mode is False
    assert scheduled[0][0] == server._run_agent_chat
    assert [item["name"] for item in client.get_received()] == ["assistant_start"]
    client.disconnect()


def test_chat_rejects_missing_workspace():
    client = server.socketio.test_client(server.app)

    response = client.emit(
        "chat",
        {"apikey": server.EXPECTED_API_KEY, "prompt": "Question"},
        callback=True,
    )

    assert response == {
        "ok": False,
        "error": "A workspace is required. Upload one or provide a saved workspace id.",
    }
    client.disconnect()


def test_chat_progress_emits_heartbeat_until_stopped(monkeypatch):
    emitted = []
    monkeypatch.setattr(
        server.socketio,
        "emit",
        lambda name, data, to: emitted.append((name, data, to)),
    )

    server._chat_progress("sid", FakeStopEvent())

    assert emitted == [
        (
            "assistant_progress",
            {"message": "Still working on your request…"},
            "sid",
        )
    ]


def test_background_chat_invokes_graph_and_emits_answer(monkeypatch):
    store = FakeStore()
    monkeypatch.setattr(server, "get_mongo_store", lambda: store)
    calls = []
    session = server.WorkspaceSession(
        workspace_id="workspace",
        thread_id="workspace:sid",
        graph=SimpleNamespace(agent_config={"observability": {}}),
    )
    monkeypatch.setattr(server, "_get_workspace_session", lambda sid, api_key: session)
    monkeypatch.setattr(
        observability,
        "setup_observability",
        lambda *args, **kwargs: {"callbacks": []},
    )
    monkeypatch.setattr(server.socketio, "start_background_task", lambda *args: None)
    monkeypatch.setattr(
        agent_loop,
        "run_task",
        lambda *args, **kwargs: calls.append(
            (args, {**kwargs, "history": list(kwargs.get("history", []))})
        ) or {"messages": []},
    )
    monkeypatch.setattr(agent_loop, "final_answer", lambda state: "Evidence-backed answer.")
    emitted = []
    monkeypatch.setattr(
        server.socketio,
        "emit",
        lambda name, data, to: emitted.append((name, data, to)),
    )

    server._run_agent_chat("sid", "Question", server.EXPECTED_API_KEY)

    assert calls[0][0][1:3] == ("Question", "workspace:sid")
    assert calls[0][1]["history"] == []
    assert store.turns == [
        (server.EXPECTED_API_KEY, "workspace", "Question", "Evidence-backed answer.")
    ]
    assert emitted == [
        ("assistant_chunk", {"token": "Evidence-backed answer."}, "sid"),
        ("assistant_end", {}, "sid"),
    ]
    assert calls[0][1]["timeout_seconds"] == server.CHAT_TIMEOUT_SECONDS


def test_background_chat_formats_and_emits_readme_answer(monkeypatch):
    store = FakeStore()
    monkeypatch.setattr(server, "get_mongo_store", lambda: store)
    writer_model = object()
    session = server.WorkspaceSession(
        workspace_id="workspace",
        thread_id="workspace:sid",
        graph=SimpleNamespace(
            agent_config={"observability": {}},
            agent_digest_model=writer_model,
        ),
    )
    monkeypatch.setattr(server, "_get_workspace_session", lambda sid, api_key: session)
    monkeypatch.setattr(
        observability,
        "setup_observability",
        lambda *args, **kwargs: {"callbacks": []},
    )
    monkeypatch.setattr(server.socketio, "start_background_task", lambda *args: None)
    monkeypatch.setattr(agent_loop, "run_task", lambda *args, **kwargs: {"messages": []})
    monkeypatch.setattr(agent_loop, "final_answer", lambda state: "Evidence-backed answer.")
    formatter_calls = []

    def format_answer(model, question, answer):
        formatter_calls.append((model, question, answer))
        return "# README answer\n\nFormatted for the user."

    def stream_answer(model, question, answer, on_chunk):
        markdown = format_answer(model, question, answer)
        on_chunk(markdown)
        return markdown

    monkeypatch.setattr(server, "stream_readme_answer", stream_answer)
    emitted = []
    monkeypatch.setattr(
        server.socketio,
        "emit",
        lambda name, data, to: emitted.append((name, data, to)),
    )

    server._run_agent_chat(
        "sid",
        "Question",
        server.EXPECTED_API_KEY,
        "workspace",
        True,
    )

    markdown = "# README answer\n\nFormatted for the user."
    assert formatter_calls == [(writer_model, "Question", "Evidence-backed answer.")]
    assert store.turns == [
        (server.EXPECTED_API_KEY, "workspace", "Question", markdown)
    ]
    assert emitted == [
        (
            "assistant_progress",
            {"message": "Formatting answer as polished README…"},
            "sid",
        ),
        ("assistant_chunk", {"token": markdown}, "sid"),
        (
            "readme_answer",
            {"filename": "answer.md", "markdown": markdown},
            "sid",
        ),
        ("assistant_end", {}, "sid"),
    ]


def test_background_chat_reports_deadline_and_does_not_save_turn(monkeypatch):
    from timeouts import AgentTimeoutError

    store = FakeStore()
    monkeypatch.setattr(server, "get_mongo_store", lambda: store)
    session = server.WorkspaceSession(
        workspace_id="workspace",
        thread_id="workspace:sid",
        graph=SimpleNamespace(agent_config={"observability": {}}),
    )
    monkeypatch.setattr(server, "_get_workspace_session", lambda sid, api_key: session)
    monkeypatch.setattr(
        observability,
        "setup_observability",
        lambda *args, **kwargs: {"callbacks": []},
    )
    monkeypatch.setattr(server.socketio, "start_background_task", lambda *args: None)
    monkeypatch.setattr(
        agent_loop,
        "run_task",
        lambda *args, **kwargs: (_ for _ in ()).throw(
            AgentTimeoutError("deadline exceeded")
        ),
    )
    emitted = []
    monkeypatch.setattr(
        server.socketio,
        "emit",
        lambda name, data, to: emitted.append((name, data, to)),
    )

    server._run_agent_chat("sid", "Question", server.EXPECTED_API_KEY)

    assert store.turns == []
    assert emitted == [
        (
            "assistant_error",
            {
                "error": (
                    f"This request exceeded the {server.CHAT_TIMEOUT_SECONDS}-second "
                    "time limit. Try a narrower question or request a smaller diagram."
                )
            },
            "sid",
        )
    ]


def test_background_chat_delivers_generated_architecture_html(monkeypatch):
    store = FakeStore()
    monkeypatch.setattr(server, "get_mongo_store", lambda: store)
    session = server.WorkspaceSession(
        workspace_id="workspace",
        thread_id="workspace:sid",
        graph=SimpleNamespace(agent_config={"observability": {}}),
    )
    monkeypatch.setattr(
        server,
        "_get_workspace_session",
        lambda sid, api_key: session,
    )
    monkeypatch.setattr(
        observability,
        "setup_observability",
        lambda *args, **kwargs: {"callbacks": []},
    )
    monkeypatch.setattr(server.socketio, "start_background_task", lambda *args: None)
    monkeypatch.setattr(
        agent_loop,
        "run_task",
        lambda *args, **kwargs: {
            "architecture_diagram": {
                "title": "Workspace architecture",
                "html": "<!doctype html><html><head></head><body></body></html>",
            }
        },
    )
    monkeypatch.setattr(
        agent_loop,
        "final_answer",
        lambda state: "Diagram generated.",
    )
    emitted = []
    monkeypatch.setattr(
        server.socketio,
        "emit",
        lambda name, data, to: emitted.append((name, data, to)),
    )

    server._run_agent_chat("sid", "Draw architecture", server.EXPECTED_API_KEY)

    diagram_event = emitted[0]
    assert diagram_event[0] == "architecture_diagram"
    assert diagram_event[1]["html"].startswith("<!doctype html>")
    assert diagram_event[1]["filename"].endswith(".html")
    assert emitted[1][0] == "assistant_chunk"
    assert "automatic rendering" in emitted[1][1]["token"]


def test_architecture_render_status_acknowledges_preview(monkeypatch):
    client = server.socketio.test_client(server.app)
    monkeypatch.setattr(server, "_session_matches", lambda *args: True)

    response = client.emit(
        "architecture_diagram_status",
        {
            "apikey": server.EXPECTED_API_KEY,
            "workspace_id": "workspace",
            "filename": "architecture.html",
            "status": "rendered",
        },
        callback=True,
    )

    assert response == {"ok": True}
    client.disconnect()


def test_workspace_resume_returns_saved_id_and_conversation(monkeypatch, tmp_path):
    store = FakeStore()
    monkeypatch.setattr(server, "get_mongo_store", lambda: store)
    monkeypatch.setattr(
        server,
        "load_workspace",
        lambda workspace_id, api_key, storage, repository: {
            "workspace_id": workspace_id,
            "workspace_path": tmp_path,
            "file_count": 1,
        },
    )
    monkeypatch.setattr(
        agent_loop,
        "build_graph",
        lambda **kwargs: SimpleNamespace(agent_config={}),
    )
    client = server.socketio.test_client(server.app)

    response = client.emit(
        "workspace_resume",
        {
            "apiKey": server.EXPECTED_API_KEY,
            "workspace_id": "workspace-saved",
        },
        callback=True,
    )

    assert response["ok"] is True
    assert response["workspace_id"] == "workspace-saved"
    assert response["history"] == [{"role": "user", "content": "Earlier question"}]
    assert "session_id" in response
    client.disconnect()


def test_workspace_resume_rejects_an_unknown_workspace_id(monkeypatch):
    monkeypatch.setattr(
        server,
        "load_workspace",
        lambda *args: None,
    )
    client = server.socketio.test_client(server.app)

    response = client.emit(
        "workspace_resume",
        {
            "apikey": server.EXPECTED_API_KEY,
            "workspace_id": "unknown-workspace",
        },
        callback=True,
    )

    assert response["ok"] is False
    assert response["workspace_required"] is True
    assert "Upload the workspace" in response["error"]
    client.disconnect()


def test_single_dedicated_session_preserves_instance_across_requests(monkeypatch, tmp_path):
    store = FakeStore()
    monkeypatch.setattr(server, "get_mongo_store", lambda: store)
    monkeypatch.setattr(
        server,
        "load_workspace",
        lambda workspace_id, api_key, storage, repository: {
            "workspace_id": workspace_id,
            "workspace_path": tmp_path,
            "file_count": 1,
        },
    )
    monkeypatch.setattr(
        agent_loop,
        "build_graph",
        lambda **kwargs: SimpleNamespace(agent_config={}),
    )
    client = server.socketio.test_client(server.app)

    res1 = client.emit(
        "workspace_resume",
        {"apiKey": server.EXPECTED_API_KEY, "workspace_id": "ws-dedicated"},
        callback=True,
    )
    assert res1["ok"] is True
    session_id_1 = res1.get("session_id")
    assert session_id_1 is not None

    res2 = client.emit(
        "workspace_resume",
        {"apiKey": server.EXPECTED_API_KEY, "workspace_id": "ws-dedicated"},
        callback=True,
    )
    assert res2["ok"] is True
    assert res2.get("session_id") == session_id_1
    assert server.current_session.session_id == session_id_1
    client.disconnect()


def test_container_health_and_readiness_endpoints(monkeypatch):
    from starlette.testclient import TestClient

    monkeypatch.setattr(server, "CONTAINER_WORKSPACE_ID", "test-container-ws")
    monkeypatch.setattr(server, "_container_ready", True)

    client = TestClient(server.app)
    health_resp = client.get("/health")
    assert health_resp.status_code == 200
    assert health_resp.json()["workspace_id"] == "test-container-ws"

    live_resp = client.get("/live")
    assert live_resp.status_code == 200

    ready_resp = client.get("/ready")
    assert ready_resp.status_code == 200
    assert ready_resp.json()["ready"] is True


def test_container_chat_auto_resolves_container_workspace(monkeypatch):
    monkeypatch.setattr(server, "CONTAINER_WORKSPACE_ID", "container-ws-123")
    monkeypatch.setattr(server, "CONTAINER_USER_ID", "container-user-456")
    scheduled = []
    monkeypatch.setattr(
        server.socketio,
        "start_background_task",
        lambda *args: scheduled.append(args),
    )
    fake_session = server.WorkspaceSession(
        workspace_id="container-ws-123",
        thread_id="container-ws-123:container-user-456",
        graph=SimpleNamespace(agent_config={}),
    )
    monkeypatch.setattr(server, "current_session", fake_session)
    monkeypatch.setattr(server, "_get_workspace_session", lambda *args, **kwargs: fake_session)

    client = server.socketio.test_client(server.app)
    # Chat sent without workspace_id should automatically use CONTAINER_WORKSPACE_ID
    response = client.emit(
        "chat",
        {"apikey": "container-user-456", "prompt": "Hello container agent"},
        callback=True,
    )

    assert response == {"ok": True}
    assert len(scheduled) == 1
    assert scheduled[0][4] == "container-ws-123"
    client.disconnect()
