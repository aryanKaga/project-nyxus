from langchain_core.messages import AIMessage

from agent_loop import build_graph, final_answer, run_task
from paths import resolve_agent_dir
from skills_loader import SkillRegistry
from tools.codegraph_wrapper import ToolRuntime


class FakeModel:
    def __init__(self, responses):
        self.responses = iter(responses)
        self.bound = None

    def bind_tools(self, tools):
        self.bound = tools
        return self

    def invoke(self, messages):
        return next(self.responses)


class FakeDigest:
    def __init__(self):
        self.calls = 0

    def invoke(self, messages):
        self.calls += 1
        return AIMessage(content=(
            "goal: explore\n"
            "done: inspected files\n"
            "findings: [handle | src/example.py:12]\n"
            "ruled out: none\n"
            "open questions: none\n"
            "next step: answer"
        ))


def call(name, args, call_id):
    return AIMessage(
        content="",
        tool_calls=[{"name": name, "args": args, "id": call_id}],
    )


def _runtime():
    skills = SkillRegistry(resolve_agent_dir())
    runtime = ToolRuntime(
        resolve_agent_dir(),
        root=resolve_agent_dir(),
        skills=skills,
        llm_call=lambda system, user, max_tokens: "digest",
    )
    runtime._run = lambda argv: "finding [handle | src/example.py:12]\n" * 300
    return runtime, skills


def test_graph_loads_skill_calls_tool_compacts_and_answers():
    runtime, skills = _runtime()
    model = FakeModel([
        call("use_skill", {"name": "codebase-overview"}, "skill-1"),
        call("repo_orient", {"budget": "small"}, "orient-1"),
        call("repo_orient", {"budget": "small"}, "orient-2"),
        AIMessage(content="The repo overview is supported [handle | src/example.py:12]."),
    ])
    digest = FakeDigest()
    graph = build_graph(
        agent_dir=resolve_agent_dir(),
        root=resolve_agent_dir(),
        model=model,
        digest_model=digest,
        runtime=runtime,
        skills=skills,
    )
    graph.agent_config["context"].update(
        window_tokens=2200,
        compact_fraction=0.6,
        keep_last_messages=2,
    )

    state = run_task(graph, "What does this repo do?", "test-thread")

    assert state["loaded_skill"] == "codebase-overview"
    assert runtime.calls == 2
    assert digest.calls >= 1
    assert "repo overview" in final_answer(state)
    assert state["summary"]
    assert len(state["messages"]) >= 8


def test_budget_exhaustion_answers_with_existing_evidence():
    runtime, skills = _runtime()
    runtime.limits["max_tool_calls_per_task"] = 0
    model = FakeModel([
        call("repo_orient", {"budget": "small"}, "orient-budget"),
    ])
    graph = build_graph(
        agent_dir=resolve_agent_dir(),
        root=resolve_agent_dir(),
        model=model,
        digest_model=FakeDigest(),
        runtime=runtime,
        skills=skills,
    )

    state = run_task(graph, "What does this repo do?", "budget-thread")
    answer = final_answer(state)

    assert "budget" in answer.lower()
    assert "unverified" in answer.lower()
    assert runtime.calls == 0


def test_graph_performs_requested_filename_search(tmp_path):
    (tmp_path / "src" / "evaluation").mkdir(parents=True)
    (tmp_path / "src" / "evaluation" / "cases.yaml").write_text("cases: []")
    skills = SkillRegistry(resolve_agent_dir())
    runtime = ToolRuntime(
        resolve_agent_dir(),
        root=tmp_path,
        skills=skills,
    )
    model = FakeModel([
        call("use_skill", {"name": "locate-and-explain"}, "skill-find"),
        call(
            "find_files",
            {"pattern": "*harness*,*eval*"},
            "find-files",
        ),
        AIMessage(content="Found src/evaluation/cases.yaml."),
    ])
    graph = build_graph(
        agent_dir=resolve_agent_dir(),
        root=tmp_path,
        model=model,
        digest_model=FakeDigest(),
        runtime=runtime,
        skills=skills,
    )

    state = run_task(
        graph,
        "Find files or directories named harness or eval.",
        "find-files-thread",
    )

    assert "src/evaluation/cases.yaml" in final_answer(state)
    assert runtime.calls == 1


def test_architecture_request_runs_lazy_analyst_and_html_writer(tmp_path):
    (tmp_path / "src").mkdir()
    (tmp_path / "src" / "app.py").write_text("def main(): pass")
    skills = SkillRegistry(resolve_agent_dir())
    runtime = ToolRuntime(
        resolve_agent_dir(),
        root=tmp_path,
        skills=skills,
    )
    model = FakeModel([
        call(
            "create_architecture_diagram",
            {"question": "Diagram the whole repository."},
            "diagram-1",
        ),
        call(
            "find_files",
            {"pattern": "*.py"},
            "analyst-find",
        ),
        AIMessage(content=(
            "Scope: whole repository. Components: app.py contains main. "
            "Flow: user -> main [src/app.py]. Caveats: only one file found."
        )),
        AIMessage(content=(
            "<!doctype html><html><head><title>Architecture</title><style>"
            ".architecture-node{background:#dceeff}</style></head>"
            '<body><main class="diagram-canvas"><h1>Repository architecture</h1>'
            '<div class="architecture-node">User</div>'
            '<div class="architecture-node">Main</div>'
            '<svg><path d="M 1 1 L 2 2"/></svg></main></body></html>'
        )),
        AIMessage(content="Created and opened the architecture diagram."),
    ])
    graph = build_graph(
        agent_dir=resolve_agent_dir(),
        root=tmp_path,
        model=model,
        digest_model=FakeDigest(),
        runtime=runtime,
        skills=skills,
    )

    state = run_task(
        graph,
        "Create an architecture diagram for the whole repository.",
        "architecture-thread",
    )

    assert state["architecture_diagram"]["html"].startswith("<!doctype html>")
    assert runtime.calls == 1
    assert "opened" in final_answer(state)


def test_agent_loop_records_execution_trace():
    runtime, skills = _runtime()
    model = FakeModel([
        call("repo_orient", {"budget": "small"}, "orient-1"),
        AIMessage(content="Final answer about repo."),
    ])
    graph = build_graph(
        agent_dir=resolve_agent_dir(),
        root=resolve_agent_dir(),
        model=model,
        digest_model=FakeDigest(),
        runtime=runtime,
        skills=skills,
    )

    state = run_task(graph, "What does this repo do?", "trace-thread")

    trace = state.get("execution_trace", [])
    assert len(trace) >= 2
    nodes = [e["node"] for e in trace]
    assert "assistant" in nodes
    assert "tools" in nodes
    actions = [e["action"] for e in trace]
    assert "decided_tools" in actions
    assert "tool_call:repo_orient" in actions
    assert "final_answer" in actions

