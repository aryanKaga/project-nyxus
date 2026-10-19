import pytest
from langchain_core.messages import AIMessage

from architecture import MAX_ANALYSIS_STEPS, generate_architecture_diagram


class FakeModel:
    def __init__(self, responses):
        self.responses = iter(responses)
        self.invocations = []

    def bind_tools(self, tools):
        self.tools = tools
        return self

    def invoke(self, messages):
        self.invocations.append(messages)
        return next(self.responses)


class FakeRuntime:
    cli_tools = {"search": {}}
    builtins = {"find_files": {}}

    def __init__(self):
        self.calls = []

    def tool_definitions(self):
        return [
            {
                "name": "search",
                "description": "Search source",
                "input_schema": {"type": "object", "properties": {}},
            },
            {
                "name": "find_files",
                "description": "Find paths",
                "input_schema": {"type": "object", "properties": {}},
            },
            {
                "name": "run_shell",
                "description": "Run shell",
                "input_schema": {"type": "object", "properties": {}},
            },
        ]

    def call(self, name, args):
        self.calls.append((name, args))
        return "src/app.py: main entry"


def test_architecture_agents_are_separate_and_analyst_gets_readonly_tools():
    runtime = FakeRuntime()
    analyst = FakeModel([
        AIMessage(
            content="",
            tool_calls=[{
                "name": "search",
                "args": {"query": "entry point"},
                "id": "search-1",
            }],
        ),
        AIMessage(content="Components: app.py. Flow: request -> main. Citation: src/app.py."),
    ])
    writer = FakeModel([
        AIMessage(content=(
            "<!doctype html><html><head><title>Diagram</title><style>"
            ".architecture-node{background:#dceeff}</style></head>"
            '<body><main class="diagram-canvas">'
            '<div class="architecture-node">Request</div>'
            '<div class="architecture-node">Main</div>'
            '<svg><path d="M 1 1 L 2 2"/></svg>'
            "</main></body></html>"
        )),
    ])

    result = generate_architecture_diagram(
        "Diagram the request flow.",
        runtime,
        analyst,
        writer,
    )

    assert result["html"].startswith("<!doctype html>")
    assert [tool["name"] for tool in analyst.tools] == ["search", "find_files"]
    assert runtime.calls == [("search", {"query": "entry point"})]


def test_analyst_summarizes_gathered_evidence_after_query_step_limit():
    runtime = FakeRuntime()
    tool_rounds = [
        AIMessage(
            content="",
            tool_calls=[{
                "name": "search",
                "args": {"query": f"component {index}"},
                "id": f"search-{index}",
            }],
        )
        for index in range(MAX_ANALYSIS_STEPS)
    ]
    analyst = FakeModel([
        *tool_rounds,
        AIMessage(content=(
            "Partial architecture: search evidence identifies src/app.py as "
            "the entry point. The full requested scope remains unverified."
        )),
    ])
    writer = FakeModel([AIMessage(content=(
        "<!doctype html><html><head><style>"
        ".architecture-node{background:#dceeff}</style></head>"
        '<body><main class="diagram-canvas">'
        '<div class="architecture-node">App</div>'
        '<div class="architecture-node">External system</div>'
        "<svg><path d='M 1 1 L 2 2'></path></svg>"
        "</main></body></html>"
    ))])

    result = generate_architecture_diagram(
        "Diagram the whole repository.",
        runtime,
        analyst,
        writer,
    )

    assert len(runtime.calls) == MAX_ANALYSIS_STEPS
    assert len(analyst.invocations) == MAX_ANALYSIS_STEPS + 1
    assert "synthesize a concise architecture brief" in (
        analyst.invocations[-1][0].content.lower()
    )
    assert result["html"].startswith("<!doctype html>")


@pytest.mark.parametrize(
    "dangerous_html",
    [
        "<html><head></head><script>alert(1)</script></html>",
        '<html><head></head><body onload="run()"></body></html>',
        '<html><head></head><body><a href="javascript:run()">x</a></body></html>',
    ],
)
def test_html_writer_rejects_active_content(dangerous_html):
    analyst = FakeModel([AIMessage(content="Components: app.")])
    writer = FakeModel([AIMessage(content=dangerous_html)])

    with pytest.raises(ValueError, match="disallowed active content"):
        generate_architecture_diagram("Diagram the app.", FakeRuntime(), analyst, writer)


def test_html_writer_rejects_non_block_diagram():
    analyst = FakeModel([AIMessage(content="Components: app.")])
    writer = FakeModel([AIMessage(content=(
        "<html><head></head><body><p>Component A, Component B</p></body></html>"
    ))])

    with pytest.raises(ValueError, match="diagram canvas"):
        generate_architecture_diagram(
            "Diagram the app.",
            FakeRuntime(),
            analyst,
            writer,
        )


def test_html_writer_accepts_inline_node_styles_and_svg_polyline():
    analyst = FakeModel([AIMessage(content="Components: app and database.")])
    writer = FakeModel([AIMessage(content=(
        "<!doctype html><html><head><style>.diagram-canvas{display:grid}</style>"
        "</head><body><main class='diagram-canvas'>"
        '<div class="architecture-node" style="background:#dceeff">App</div>'
        '<div class="architecture-node" style="background:#e5ddff">Database</div>'
        "<svg><polyline points='0,0 10,10'/></svg>"
        "</main></body></html>"
    ))])

    result = generate_architecture_diagram(
        "Diagram the application.",
        FakeRuntime(),
        analyst,
        writer,
    )

    assert "<polyline" in result["html"]


def test_html_writer_accepts_simple_css_diagram_without_svg():
    analyst = FakeModel([AIMessage(content="Components: API and database.")])
    writer = FakeModel([AIMessage(content=(
        "<!doctype html><html><head><style>"
        ".diagram-canvas{display:grid;gap:1rem}"
        ".architecture-node{padding:1rem;background:#dceeff;border:1px solid #246}"
        "</style></head><body><main class='diagram-canvas'>"
        "<h1>Request flow</h1>"
        '<div class="architecture-node">API</div>'
        '<div class="architecture-node">Database</div>'
        "</main></body></html>"
    ))])

    result = generate_architecture_diagram(
        "Diagram the API and database.",
        FakeRuntime(),
        analyst,
        writer,
    )

    assert 'class="architecture-node"' in result["html"]
    assert "<svg" not in result["html"]


def test_html_writer_rejects_unstyled_nodes():
    analyst = FakeModel([AIMessage(content="Components: app and database.")])
    writer = FakeModel([AIMessage(content=(
        "<html><head></head><body><main class='diagram-canvas'>"
        '<div class="architecture-node">App</div>'
        '<div class="architecture-node">Database</div>'
        "<svg><path d='M 1 1 L 2 2'/></svg>"
        "</main></body></html>"
    ))])

    with pytest.raises(ValueError, match="must style component blocks"):
        generate_architecture_diagram(
            "Diagram the application.",
            FakeRuntime(),
            analyst,
            writer,
        )
