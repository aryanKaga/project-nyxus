from langchain_core.messages import AIMessage, HumanMessage, ToolMessage

from context import _render, safe_compaction_boundary


def test_stub_old_results_keeps_tool_call_and_result_pair():
    first_call = AIMessage(
        content="",
        tool_calls=[{"name": "search", "args": {"query": "old"}, "id": "call-1"}],
    )
    first_result = ToolMessage(
        content="old source finding [handle | src/old.py:7]",
        tool_call_id="call-1",
    )
    last_call = AIMessage(
        content="",
        tool_calls=[{"name": "search", "args": {"query": "new"}, "id": "call-2"}],
    )
    last_result = ToolMessage(content="new source finding", tool_call_id="call-2")
    view = _render(
        "system",
        "",
        [HumanMessage(content="question"), first_call, first_result, last_call, last_result],
        0,
        {
            "recent_tool_results": 1,
            "keep_last_messages": 6,
        },
        {},
    )

    assert view[2].tool_calls[0]["id"] == "call-1"
    assert view[3].tool_call_id == "call-1"
    assert "saved in the checkpoint tool result 'call-1'" in view[3].content
    assert "[handle | src/old.py:7]" in view[3].content
    assert view[4].tool_calls[0]["id"] == "call-2"
    assert view[5].content == "new source finding"


def test_compaction_cut_never_splits_call_and_result():
    messages = [
        HumanMessage(content="question"),
        AIMessage(
            content="",
            tool_calls=[{"name": "search", "args": {}, "id": "call-1"}],
        ),
        HumanMessage(content="intermediate"),
        ToolMessage(content="result", tool_call_id="call-1"),
        HumanMessage(content="later"),
    ]

    boundary = safe_compaction_boundary(messages, 3)
    assert boundary == 1
