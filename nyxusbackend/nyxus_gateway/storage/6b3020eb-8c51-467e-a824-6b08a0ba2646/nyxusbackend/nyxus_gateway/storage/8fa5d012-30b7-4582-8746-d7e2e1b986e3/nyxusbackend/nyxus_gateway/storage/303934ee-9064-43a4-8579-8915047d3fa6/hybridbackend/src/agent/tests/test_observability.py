import pytest
import os
from types import SimpleNamespace
import yaml
import json

from observability import AgentTracer, format_trace, setup_observability
from paths import resolve_agent_dir


def test_both_backends_off_adds_no_callbacks(monkeypatch):
    config = yaml.safe_load((resolve_agent_dir() / "config.yaml").read_text())
    config["observability"]["langfuse"]["enabled"] = False
    config["observability"]["langsmith"]["enabled"] = False
    config["observability"]["local_trace"] = {"enabled": False}
    monkeypatch.delenv("LANGSMITH_API_KEY", raising=False)
    monkeypatch.delenv("LANGSMITH_PROJECT", raising=False)

    tracing = setup_observability(config, "repo", "thread")

    assert tracing["callbacks"] == []
    assert tracing["metadata"] == {
        "repo_id": "repo",
        "phase": 1,
        "skill": "auto",
        "thread_id": "thread",
        "codegraph_version": "PIN-ME",
    }
    assert "tracer" in tracing


def test_local_tracer_records_llm_and_tool_events():
    tracer = AgentTracer()
    assert tracer.get_trace() == []

    tracer.on_llm_start({"name": "gemini-flash"}, ["Explain repository"], run_id="run-1")
    response = SimpleNamespace(
        generations=[[SimpleNamespace(text="Here is the overview.")]]
    )
    tracer.on_llm_end(response, run_id="run-1")

    tracer.on_tool_start({"name": "search"}, '{"query": "auth"}', run_id="tool-1")
    tracer.on_tool_end("Found 3 matches", run_id="tool-1")

    tracer.on_tool_start({"name": "read_file"}, '{"path": "missing.py"}', run_id="tool-2")
    tracer.on_tool_error(RuntimeError("File not found"), run_id="tool-2")

    trace = tracer.get_trace()
    assert len(trace) == 6

    # Verify steps
    assert trace[0]["action"] == "llm_start"
    assert trace[0]["status"] == "running"
    assert trace[1]["action"] == "llm_end"
    assert trace[1]["status"] == "ok"
    assert "duration_ms" in trace[1]

    assert trace[2]["action"] == "tool_start"
    assert trace[2]["name"] == "search"
    assert trace[3]["action"] == "tool_end"
    assert trace[3]["status"] == "ok"

    assert trace[4]["action"] == "tool_start"
    assert trace[5]["action"] == "tool_error"
    assert trace[5]["status"] == "error"
    assert "File not found" in trace[5]["output"]


def test_local_tracer_live_event_handler():
    events = []
    tracer = AgentTracer(on_event=lambda action, entry: events.append((action, entry["status"])))

    tracer.on_tool_start({"name": "grep"}, '{"pattern": "TODO"}', run_id="1")
    tracer.on_tool_end("0 matches", run_id="1")

    assert len(events) == 2
    assert events[0] == ("tool_start", "running")
    assert events[1] == ("tool_end", "ok")


def test_format_trace_renders_chronological_output():
    tracer = AgentTracer()
    tracer.add_entry(node="assistant", action="decided_tools", name="gemini", duration_ms=45.2, status="ok")
    tracer.add_entry(node="tools", action="tool_call:search", name="search", output="3 results", duration_ms=12.0, status="ok")

    rendered = tracer.format_trace()
    assert "Step 1 | assistant -> decided_tools (45.2ms)" in rendered
    assert "Step 2 | tools -> tool_call:search (12.0ms)" in rendered
    assert "3 results" in rendered


def test_hide_inputs_outputs_masks_sensitive_data():
    tracer = AgentTracer(hide_inputs_outputs=True)
    tracer.on_llm_start({"name": "model"}, ["secret prompt content"], run_id="1")
    tracer.on_llm_end(SimpleNamespace(generations=[[SimpleNamespace(text="secret answer")]]), run_id="1")
    tracer.on_tool_start({"name": "read_file"}, '{"path": ".env"}', run_id="2")

    trace = tracer.get_trace()
    for entry in trace:
        if "inputs" in entry:
            assert entry["inputs"] == "[masked]"
        if "output" in entry:
            assert entry["output"] == "[masked]"


def test_setup_observability_with_local_trace_and_live_events(tmp_path):
    config = {
        "phase": 1,
        "codegraph": {"version": "v1.0"},
        "observability": {
            "langfuse": {"enabled": False},
            "langsmith": {"enabled": False},
            "local_trace": {
                "enabled": True,
                "max_entries": 50,
                "directory": str(tmp_path / "traces"),
            },
        },
    }
    events = []
    tracing = setup_observability(
        config,
        repo_id="test-repo",
        thread_id="test-thread",
        on_event=lambda action, entry: events.append(action),
    )

    assert len(tracing["callbacks"]) == 1
    tracer = tracing["tracer"]
    assert tracer in tracing["callbacks"]
    assert tracer.max_entries == 50

    tracer.add_entry("assistant", "step_started")
    assert events == ["step_started"]


def test_local_trace_is_persisted_without_content_when_masking_enabled(tmp_path):
    trace_path = tmp_path / "traces" / "trace.json"
    tracer = AgentTracer(
        hide_inputs_outputs=True,
        max_entries=2,
        trace_path=trace_path,
    )
    tracer.add_entry(
        "assistant",
        "llm_start",
        inputs="private prompt",
        status="running",
    )
    tracer.add_entry("tools", "tool_start", inputs="private source")
    tracer.add_entry("assistant", "llm_end", output="private response")

    saved_trace = json.loads(trace_path.read_text(encoding="utf-8"))
    assert len(saved_trace) == 2
    assert saved_trace[0]["action"] == "tool_start"
    assert all(entry["inputs"] == "[masked]" for entry in saved_trace)
    assert all(entry["output"] == "[masked]" for entry in saved_trace)
    assert "private" not in trace_path.read_text(encoding="utf-8")
    assert trace_path.stat().st_mode & 0o777 == 0o600


def test_langsmith_uses_only_local_endpoint_and_keeps_agent_tracer(monkeypatch):
    config = {
        "phase": 1,
        "codegraph": {"version": "v1.0"},
        "observability": {
            "langfuse": {"enabled": False},
            "langsmith": {
                "enabled": True,
                "endpoint": "http://localhost:1984",
                "project": "nyxus-local",
            },
            "local_trace": {"enabled": True},
        },
    }
    monkeypatch.setenv("LANGSMITH_API_KEY", "local-test-key")
    monkeypatch.delenv("LANGSMITH_PROJECT", raising=False)

    tracing = setup_observability(config, "repo", "thread")

    assert tracing["tracer"] in tracing["callbacks"]
    assert os.environ["LANGSMITH_ENDPOINT"] == "http://localhost:1984"
    assert os.environ["LANGCHAIN_ENDPOINT"] == "http://localhost:1984"
    assert os.environ["LANGSMITH_TRACING"] == "true"
    assert os.environ["LANGSMITH_PROJECT"] == "nyxus-local"


def test_langsmith_rejects_nonlocal_endpoint(monkeypatch):
    config = {
        "phase": 1,
        "codegraph": {"version": "v1.0"},
        "observability": {
            "langfuse": {"enabled": False},
            "langsmith": {
                "enabled": True,
                "endpoint": "https://api.smith.langchain.com",
                "project": "nyxus",
            },
            "local_trace": {"enabled": True},
        },
    }
    monkeypatch.setenv("LANGSMITH_API_KEY", "test-key")

    with pytest.raises(RuntimeError, match="LangSmith endpoint must be local"):
        setup_observability(config, "repo", "thread")


def test_langsmith_validation(monkeypatch):
    config = {
        "phase": 1,
        "codegraph": {"version": "v1.0"},
        "observability": {
            "langfuse": {"enabled": False},
            "langsmith": {"enabled": True},
        },
    }
    monkeypatch.delenv("LANGSMITH_API_KEY", raising=False)
    with pytest.raises(RuntimeError, match="LANGSMITH_API_KEY is not set"):
        setup_observability(config, "repo", "thread")


def test_langfuse_validation(monkeypatch):
    config = {
        "phase": 1,
        "codegraph": {"version": "v1.0"},
        "observability": {
            "langfuse": {"enabled": True},
            "langsmith": {"enabled": False},
        },
    }
    monkeypatch.delenv("LANGFUSE_PUBLIC_KEY", raising=False)
    monkeypatch.delenv("LANGFUSE_SECRET_KEY", raising=False)
    with pytest.raises(RuntimeError, match="LANGFUSE_PUBLIC_KEY and LANGFUSE_SECRET_KEY are not set"):
        setup_observability(config, "repo", "thread")
