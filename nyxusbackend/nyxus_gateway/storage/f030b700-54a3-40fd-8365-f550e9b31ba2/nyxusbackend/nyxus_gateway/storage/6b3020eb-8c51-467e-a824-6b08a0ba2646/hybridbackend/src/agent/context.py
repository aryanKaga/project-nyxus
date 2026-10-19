"""Conversation context shaping without mutating the checkpointed history."""
from dataclasses import dataclass
import re

from langchain_core.messages import HumanMessage, SystemMessage, ToolMessage


_CITATION = re.compile(r"\[[^\]\n]*\|\s*[^]\n]+\]")
_FILE_LINE = re.compile(r"(?<![\w./-])[\w./-]+\.[A-Za-z0-9_-]+:\d+(?:-\d+)?")
_HANDLE = re.compile(r"\b(?:[A-Za-z][A-Za-z0-9_-]*@[A-Za-z0-9_-]+|h_[A-Za-z0-9_-]+)\b")

SUMMARY_INSTRUCTIONS = """Summarize the supplied exploration history using exactly these
sections: goal, done, findings (with citations), ruled out, open questions, next
step. Keep source identifiers, handles, and file:line citations verbatim. Be
concise, do not infer facts, and label unsupported conclusions unverified."""


@dataclass
class ContextView:
    messages: list
    summary: str
    summary_upto: int
    token_estimate: int
    compacted: bool

#collecting the raw content of the messages list consisting of human messages,ai messages and tool calls and results
def _content(message):
    value = getattr(message, "content", "")
    text = value if isinstance(value, str) else str(value)
    calls = getattr(message, "tool_calls", [])
    if calls:
        text += f"\nTool calls: {calls}"
    return text

#estimate the number of tokens that will be used for the 
def estimate_tokens(messages):
    return sum(max(1, len(_content(message)) // 4) for message in messages)

#collecting all tool calls from the message
def _tool_call_ids(message):
    return {
        call.get("id")
        for call in getattr(message, "tool_calls", [])
        if call.get("id")
    }


def safe_compaction_boundary(messages, proposed):
    """Move a cut back until every tool call in the prefix has its result."""
    boundary = min(max(proposed, 0), len(messages))
    #boundary = basically the min_ messages that will be preserved
    while boundary:
        calls = set()
        results = set()
        for message in messages[:boundary]:
            calls.update(_tool_call_ids(message))
            if isinstance(message, ToolMessage) and message.tool_call_id:
                results.add(message.tool_call_id)
        if calls <= results:
            return boundary
        unfinished = calls - results
        caller = next(
            (
                index
                for index, message in enumerate(messages[:boundary])
                if _tool_call_ids(message) & unfinished
            ),
            None,
        )
        boundary = caller if caller is not None else boundary - 1
    return 0


def _citation_tokens(text):
    found = []
    for pattern in (_CITATION, _FILE_LINE, _HANDLE):
        found.extend(match.group(0) for match in pattern.finditer(text))
    return list(dict.fromkeys(found))


def _summary_text(summary):
    return summary.strip() if summary else ""


def _as_text(response):
    content = getattr(response, "content", response)
    if isinstance(content, str):
        return content.strip()
    return str(content).strip()


def _summarize(digest_model, old_messages, previous_summary, current_question):
    if digest_model is None:
        raise RuntimeError("Context compaction requires a configured digest model.")
    material = "\n\n".join(
        f"{message.type}: {_content(message)}" for message in old_messages
    )
    if previous_summary:
        material = f"Previous rolling summary:\n{previous_summary}\n\n{material}"
    if current_question:
        material += f"\n\nCurrent user question (preserve exactly):\n{current_question}"
    response = digest_model.invoke(
        [
            SystemMessage(content=SUMMARY_INSTRUCTIONS),
            HumanMessage(content=f"Exploration history:\n{material}"),
        ]
    )
    result = _as_text(response)
    for section in (
        "goal",
        "done",
        "findings",
        "ruled out",
        "open questions",
        "next step",
    ):
        if not re.search(rf"(?im)^\s*(?:#+\s*)?{re.escape(section)}\s*:", result):
            result += f"\n{section}: no item recorded."
    preserved = _citation_tokens(material)
    missing = [token for token in preserved if token not in result]
    if missing:
        result += "\n\nPreserved handles and citations: " + ", ".join(missing)
    return result


def _latest_user_index(messages):
    return next(
        (i for i in range(len(messages) - 1, -1, -1) if messages[i].type == "human"),
        None,
    )


def maybe_compact(
    messages,
    summary,
    summary_upto,
    system_prompt,
    digest_model,
    context_config,
):
    """Compact a safe prefix when the rendered model view crosses its threshold."""
    messages = list(messages)
    summary_upto = min(summary_upto, len(messages))
    initial = _render(system_prompt, summary, messages, summary_upto, context_config, {})
    window = context_config["window_tokens"]
    if estimate_tokens(initial) <= window * context_config["compact_fraction"]:
        return ContextView(initial, summary or "", summary_upto, estimate_tokens(initial), False)

    keep = context_config["keep_last_messages"]
    proposed = max(summary_upto, len(messages) - keep)
    boundary = safe_compaction_boundary(messages, proposed)
    current_index = _latest_user_index(messages)
    if current_index is not None and summary_upto <= current_index < boundary:
        current_question = _content(messages[current_index])
        old = messages[summary_upto:boundary]
        old = [m for i, m in enumerate(old, summary_upto) if i != current_index]
    else:
        current_question = ""
        old = messages[summary_upto:boundary]

    if not old or boundary <= summary_upto:
        return ContextView(initial, summary or "", summary_upto, estimate_tokens(initial), False)

    updated_summary = _summarize(digest_model, old, summary, current_question)
    new_upto = boundary
    visible = [m for i, m in enumerate(messages[new_upto:], new_upto)
               if i != current_index]
    if current_index is not None and current_index < new_upto:
        visible.insert(0, messages[current_index])
    rendered = _render(
        system_prompt, updated_summary, visible, 0, context_config, {}
    )
    return ContextView(
        rendered, updated_summary, new_upto, estimate_tokens(rendered), True
    )


def _render(system_prompt, summary, messages, summary_upto, config, saved_results):
    visible = list(messages[summary_upto:])
    tool_results = [
        i for i, message in enumerate(visible) if isinstance(message, ToolMessage)
    ]
    recent_count = config["recent_tool_results"]
    old_results = set(tool_results[:-recent_count] if recent_count else tool_results)
    shaped = []
    for index, message in enumerate(visible):
        if index in old_results:
            key = saved_results.get(message.tool_call_id)
            location = (
                f"scratchpad key '{key}'"
                if key
                else f"checkpoint tool result '{message.tool_call_id}'"
            )
            citations = _citation_tokens(_content(message))
            citation_note = (
                " Citations/handles: " + ", ".join(citations)
                if citations
                else ""
            )
            shaped.append(
                message.model_copy(
                    update={
                        "content": (
                            "Earlier tool finding omitted from this view; it is saved "
                            f"in the {location}.{citation_note}"
                        )
                    }
                )
            )
        else:
            shaped.append(message)

    system_content = system_prompt
    summary_text = _summary_text(summary)
    if summary_text:
        summary_message = HumanMessage(
            content=f"Rolling exploration summary:\n{summary_text}"
        )
    else:
        summary_message = None
    return [
        SystemMessage(content=system_content),
        *([summary_message] if summary_message else []),
        *shaped,
    ]


def build_context(
    messages,
    summary,
    summary_upto,
    skills,
    scratchpad,
    digest_model,
    context_config,
    saved_results=None,
):
    scratch = "\n".join(
        f"- {key}: {value}" for key, value in scratchpad.items()
    ) or "(empty)"
    system_prompt = (
        f"{skills.system_prompt()}\n\n"
        "## Current scratchpad contents\n"
        f"{scratch}"
    )
    view = maybe_compact(
        messages,
        summary,
        summary_upto,
        system_prompt,
        digest_model,
        context_config,
    )
    # Re-render with durable finding locations after compacting, while leaving
    # the full message list in graph state untouched.
    latest_user = _latest_user_index(messages)
    visible = list(messages[view.summary_upto:])
    if latest_user is not None and latest_user < view.summary_upto:
        visible.insert(0, messages[latest_user])
    rendered = _render(
        system_prompt,
        view.summary,
        visible,
        0,
        context_config,
        saved_results or {},
    )
    return ContextView(
        rendered,
        view.summary,
        view.summary_upto,
        estimate_tokens(rendered),
        view.compacted,
    )
