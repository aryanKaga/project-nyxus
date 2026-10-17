"""Custom LangGraph read-only exploration loop."""
import logging
import os
from pathlib import Path
import sys
import time
from typing import Annotated, Any, TypedDict
import uuid

from dotenv import load_dotenv
from langchain_core.language_models.chat_models import BaseChatModel
from langchain_core.messages import (
    AIMessage,
    AnyMessage,
    HumanMessage,
    SystemMessage,
    ToolMessage,
)
from langchain_core.outputs import ChatGeneration, ChatResult
from langgraph.checkpoint.memory import InMemorySaver
from langgraph.graph import END, START, StateGraph
from langgraph.graph.message import add_messages
from langgraph.errors import GraphRecursionError

import yaml
from pydantic import Field

SRC_DIR = Path(__file__).resolve().parents[1]
if str(SRC_DIR) not in sys.path:
    sys.path.insert(0, str(SRC_DIR))

from llm_provider.models import LLM
from context import _content, build_context, maybe_compact
from paths import resolve_agent_dir
from skills_loader import SkillRegistry
from tools.codegraph_wrapper import ToolRuntime
from timeouts import check_deadline, remaining_seconds, task_deadline

RATE_LIMIT_RETRY_DELAY_SECONDS = 35
MAX_RATE_LIMIT_RETRIES = 3
logger = logging.getLogger(__name__)


def _is_rate_limit_error(error):
    for source in (error, getattr(error, "response", None)):
        if source is None:
            continue
        for attribute in ("status_code", "code"):
            value = getattr(source, attribute, None)
            if value == 429 or str(value).strip() == "429":
                return True

    message = str(error).lower()
    return any(marker in message for marker in (
        "rate limit",
        "rate_limit",
        "resource_exhausted",
        "too many requests",
        "quota exceeded",
    ))


def _generate_with_rate_limit_retry(adapter, **kwargs):
    retries = 0
    while True:
        try:
            return adapter.generate_chat(**kwargs)
        except Exception as error:
            if not _is_rate_limit_error(error) or retries >= MAX_RATE_LIMIT_RETRIES:
                raise

            remaining = remaining_seconds()
            delay = RATE_LIMIT_RETRY_DELAY_SECONDS
            if remaining is not None:
                delay = min(delay, remaining)
            logger.warning(
                "LLM API rate limit reached; retrying in %.1f seconds (%d/%d).",
                delay,
                retries + 1,
                MAX_RATE_LIMIT_RETRIES,
            )
            time.sleep(delay)
            check_deadline()
            retries += 1


class ProviderChatModel(BaseChatModel):
    """LangChain chat interface backed by the project's Gemini provider."""

    adapter: Any
    tools: list[dict[str, Any]] = Field(default_factory=list)

    @property
    def _llm_type(self):
        return "project-gemini-provider"

    @property
    def _identifying_params(self):
        return {"model": self.adapter.model}

    def bind_tools(self, tools, **kwargs):
        declarations = []
        for tool in tools:
            if hasattr(tool, "model_dump"):
                tool = tool.model_dump()
            elif not isinstance(tool, dict):
                raise TypeError("Gemini tools must be dictionary definitions.")
            function = tool.get("function", tool)
            parameters = function.get("parameters", {"type": "object", "properties": {}})
            declarations.append({
                "name": function["name"],
                "description": function.get("description", ""),
                "parameters": _gemini_schema(parameters),
            })
        return self.model_copy(update={"tools": declarations})

    def _generate(self, messages, stop=None, run_manager=None, **kwargs):
        check_deadline()
        contents = []
        system_parts = []
        tool_names = {}

        for message in messages:
            if isinstance(message, SystemMessage):
                system_parts.append(_message_content(message))
            elif isinstance(message, HumanMessage):
                contents.append({
                    "role": "user",
                    "parts": [{"text": _message_content(message)}],
                })
            elif isinstance(message, AIMessage):
                parts = []
                text = _message_content(message)
                if text:
                    parts.append({"text": text})
                for tool_call in message.tool_calls:
                    name = tool_call["name"]
                    tool_names[tool_call["id"]] = name
                    function_part = {
                        "function_call": {
                            "name": name,
                            "args": tool_call.get("args", {}),
                        }
                    }
                    signature = message.additional_kwargs.get(
                        "gemini_thought_signatures", {}
                    ).get(tool_call["id"])
                    if signature is not None:
                        function_part["thought_signature"] = signature
                    parts.append(function_part)
                if parts:
                    contents.append({"role": "model", "parts": parts})
            elif isinstance(message, ToolMessage):
                name = tool_names.get(message.tool_call_id, message.name)
                if not name:
                    raise ValueError(
                        "Gemini tool result has no matching function-call name."
                    )
                contents.append({
                    "role": "user",
                    "parts": [{
                        "function_response": {
                            "name": name,
                            "response": {"result": _message_content(message)},
                        }
                    }],
                })
            else:
                raise TypeError(
                    f"Gemini chat provider cannot serialize {type(message).__name__}."
                )

        check_deadline()
        response = _generate_with_rate_limit_retry(
            self.adapter,
            contents=contents,
            tools=self.tools,
            system_instruction="\n\n".join(system_parts) or None,
        )
        text_parts = []
        tool_calls = []
        thought_signatures = {}
        candidate = getattr(response, "candidates", [None])[0]
        response_content = getattr(candidate, "content", None)
        for part in getattr(response_content, "parts", []) or []:
            text = getattr(part, "text", None)
            if text:
                text_parts.append(text)
            function_call = getattr(part, "function_call", None)
            name = getattr(function_call, "name", None)
            if name:
                arguments = getattr(function_call, "args", {}) or {}
                call_id = str(uuid.uuid4())
                tool_calls.append({
                    "name": name,
                    "args": dict(arguments),
                    "id": call_id,
                })
                signature = getattr(part, "thought_signature", None)
                if signature is not None:
                    thought_signatures[call_id] = signature

        answer = AIMessage(
            content="".join(text_parts),
            tool_calls=tool_calls,
            additional_kwargs={
                "gemini_thought_signatures": thought_signatures
            } if thought_signatures else {},
        )
        return ChatResult(generations=[ChatGeneration(message=answer)])


def _message_content(message):
    content = message.content
    if isinstance(content, str):
        return content
    return "\n".join(
        str(part.get("text", ""))
        for part in content
        if isinstance(part, dict) and part.get("text")
    )


def _gemini_schema(schema):
    if isinstance(schema, dict):
        return {
            key: _gemini_schema(value)
            for key, value in schema.items()
            if key != "additionalProperties"
        }
    if isinstance(schema, list):
        return [_gemini_schema(item) for item in schema]
    return schema


def _append_traces(existing, new_entries):
    result = list(existing or [])
    if new_entries:
        result.extend(new_entries)
    return result


class AgentState(TypedDict, total=False):
    messages: Annotated[list[AnyMessage], add_messages]
    summary: str
    summary_upto: int
    task_id: str
    last_task_id: str
    budget_exhausted: bool
    loaded_skill: str
    peak_context_tokens: int
    truncations: int
    scratchpad: dict[str, str]
    architecture_diagram: dict[str, Any] | None
    execution_trace: Annotated[list[dict[str, Any]], _append_traces]


def _load_config(agent_dir):
    return yaml.safe_load((agent_dir / "config.yaml").read_text())


def _make_model(spec):
    provider = spec["provider"]
    if provider != "gemini":
        raise ValueError(
            "The configured agent model must use the 'gemini' provider."
        )
    api_key = spec.get("api_key_env", "GOOGLE_API_KEY")
    key = os.environ.get(api_key)
    if not key:
        raise RuntimeError(
            f"{api_key} is not set. Add it to the environment or the hybridbackend .env file."
        )
    adapter_kwargs = {"model": spec["name"]}
    if "request_timeout_seconds" in spec:
        adapter_kwargs["request_timeout_seconds"] = spec["request_timeout_seconds"]
    adapter = LLM(provider, key, **adapter_kwargs)
    return ProviderChatModel(adapter=adapter)


def _tool_specs(runtime):
    return [
        {
            "name": tool["name"],
            "description": tool["description"],
            "parameters": tool["input_schema"],
        }
        for tool in runtime.tool_definitions()
    ]


def _message_text(message):
    content = getattr(message, "content", "")
    return content if isinstance(content, str) else str(content)


def _tool_calls(message):
    calls = getattr(message, "tool_calls", None)
    if calls:
        return calls
    raw = getattr(message, "additional_kwargs", {}).get("tool_calls", [])
    normalized = []
    for item in raw:
        function = item.get("function", {})
        arguments = function.get("arguments", {})
        if isinstance(arguments, str):
            import json
            try:
                arguments = json.loads(arguments)
            except json.JSONDecodeError:
                arguments = {}
        normalized.append({
            "name": function.get("name", ""),
            "args": arguments,
            "id": item.get("id", str(uuid.uuid4())),
        })
    return normalized


def _budget_answer(messages, exhausted):
    reason = (
        "The codegraph tool-call or read_file budget is exhausted."
        if exhausted
        else "The configured graph step limit was reached."
    )
    evidence = []
    for message in messages:
        if isinstance(message, ToolMessage):
            text = _content(message).strip()
            if text and not text.lower().startswith("error:"):
                evidence.append(text[:1200].replace("\n", " "))
    gathered = (
        "\n\nEvidence gathered so far:\n"
        + "\n".join(f"- {item}" for item in evidence[-4:])
        if evidence
        else "\n\nNo successful tool findings were gathered."
    )
    return (
        f"{reason} I will answer with the evidence gathered so far and state "
        "what remains unverified. No further repository queries were run."
        f"{gathered}\n\nUnverified: further repository details could not be checked."
    )


def build_graph(
    root=None,
    agent_dir=None,
    *,
    model=None,
    digest_model=None,
    runtime=None,
    skills=None,
    checkpointer=None,
):
    agent_dir = resolve_agent_dir(agent_dir)
    load_dotenv(agent_dir.parents[1] / ".env")
    cfg = _load_config(agent_dir)
    skills = skills or SkillRegistry(agent_dir)
    digest_model = digest_model or _make_model(cfg["digest_model"])
    if runtime is None:
        runtime = ToolRuntime(
            agent_dir,
            root=root,
            skills=skills,
            llm_call=lambda system, user, max_tokens: _message_text(
                digest_model.invoke(
                    [
                        SystemMessage(content=system),
                        HumanMessage(content=user),
                    ],
                    max_tokens=max_tokens,
                )
            ),
        )
    model = model or _make_model(cfg["model"])
    model_with_tools = model.bind_tools(_tool_specs(runtime))
    context_cfg = cfg["context"]
    peak_context = {"value": 0}
    architecture_result = {}

    def create_architecture(args):
        from architecture import generate_architecture_diagram

        diagram = generate_architecture_diagram(
            args["question"],
            runtime,
            model,
            model,
        )
        architecture_result["diagram"] = diagram
        return (
            f"Architecture diagram generated: {diagram['title']}. "
            "It will be delivered to the user as an HTML file and opened in VS Code."
        )

    if "create_architecture_diagram" in runtime.builtins:
        runtime.register_builtin_handler(
            "create_architecture_diagram",
            create_architecture,
        )

    def assistant(state):
        check_deadline()
        task_id = state.get("task_id") or str(uuid.uuid4())
        last_task_id = state.get("last_task_id")
        is_new_task = task_id != last_task_id
        runtime.scratch = dict(state.get("scratchpad", {}))
        if is_new_task:
            runtime.reset_budget()
            peak_context["value"] = 0
            architecture_result.clear()
        if state.get("budget_exhausted") and not is_new_task:
            return {
                "messages": [AIMessage(content=_budget_answer(
                    state.get("messages", []), True
                ))],
                "last_task_id": task_id,
                "budget_exhausted": False,
                "execution_trace": [{
                    "step": len(state.get("execution_trace", [])) + 1,
                    "timestamp": time.time(),
                    "node": "assistant",
                    "action": "budget_exhausted",
                    "status": "warning",
                }],
            }
        view = build_context(
            state.get("messages", []),
            state.get("summary", ""),
            state.get("summary_upto", 0),
            skills,
            runtime.scratch,
            digest_model,
            context_cfg,
        )
        peak_context["value"] = max(peak_context["value"], view.token_estimate)
        t0 = time.monotonic()
        response = model_with_tools.invoke(view.messages)
        duration_ms = round((time.monotonic() - t0) * 1000, 2)
        tool_calls = _tool_calls(response)
        step_entry = {
            "step": len(state.get("execution_trace", [])) + 1,
            "timestamp": time.time(),
            "node": "assistant",
            "action": "decided_tools" if tool_calls else "final_answer",
            "name": getattr(getattr(model, "adapter", None), "model", "assistant"),
            "tool_calls": [c["name"] for c in tool_calls] if tool_calls else [],
            "duration_ms": duration_ms,
            "status": "ok",
            "preview": _message_text(response)[:120],
        }
        result = {
            "messages": [response],
            "summary": view.summary,
            "summary_upto": view.summary_upto,
            "task_id": task_id,
            "last_task_id": task_id,
            "budget_exhausted": False if is_new_task else state.get("budget_exhausted", False),
            "loaded_skill": "" if is_new_task else state.get("loaded_skill", ""),
            "peak_context_tokens": max(
                0 if is_new_task else state.get("peak_context_tokens", 0),
                view.token_estimate,
            ),
            "execution_trace": [step_entry],
        }
        if is_new_task:
            result["architecture_diagram"] = None
        return result

    def tools(state):
        check_deadline()
        response = state["messages"][-1]
        outputs = []
        tool_traces = []
        diagram = None
        exhausted = state.get("budget_exhausted", False)
        selected_skill = state.get("loaded_skill", "")
        for tool_call in _tool_calls(response):
            check_deadline()
            name = tool_call.get("name", "")
            args = tool_call.get("args") or {}
            call_id = tool_call.get("id") or str(uuid.uuid4())
            t0 = time.monotonic()
            result = runtime.call(name, args)
            tool_duration_ms = round((time.monotonic() - t0) * 1000, 2)
            tool_traces.append({
                "step": len(state.get("execution_trace", [])) + len(tool_traces) + 1,
                "timestamp": time.time(),
                "node": "tools",
                "action": f"tool_call:{name}",
                "name": name,
                "duration_ms": tool_duration_ms,
                "status": "error" if str(result).lower().startswith("error:") else "ok",
                "preview": str(result)[:200],
            })
            if name == "create_architecture_diagram":
                diagram = architecture_result.pop("diagram", None)
                if diagram is not None:
                    outputs.append(
                        ToolMessage(
                            content=str(result),
                            tool_call_id=call_id,
                            name=name or None,
                        )
                    )
                    continue
            if name == "use_skill" and isinstance(args, dict):
                selected_skill = args.get("name", selected_skill)
            if "budget reached" in str(result).lower():
                exhausted = True
            outputs.append(
                ToolMessage(
                    content=str(result),
                    tool_call_id=call_id,
                    name=name or None,
                )
            )
        result = {
            "messages": outputs,
            "budget_exhausted": exhausted,
            "loaded_skill": selected_skill,
            "truncations": runtime.truncations,
            "scratchpad": dict(runtime.scratch),
            "execution_trace": tool_traces,
        }
        if diagram is not None:
            result["architecture_diagram"] = diagram
        return result

    def compact(state):
        system_prompt = (
            f"{skills.system_prompt()}\n\n## Current scratchpad contents\n"
            + ("\n".join(
                f"- {key}: {value}" for key, value in runtime.scratch.items()
            ) or "(empty)")
        )
        t0 = time.monotonic()
        view = maybe_compact(
            state.get("messages", []),
            state.get("summary", ""),
            state.get("summary_upto", 0),
            system_prompt,
            digest_model,
            context_cfg,
        )
        compact_entry = {
            "step": len(state.get("execution_trace", [])) + 1,
            "timestamp": time.time(),
            "node": "compact",
            "action": "context_compacted",
            "duration_ms": round((time.monotonic() - t0) * 1000, 2),
            "tokens": view.token_estimate,
            "summary_upto": view.summary_upto,
            "status": "ok",
        }
        return {
            "summary": view.summary,
            "summary_upto": view.summary_upto,
            "peak_context_tokens": max(
                state.get("peak_context_tokens", 0), view.token_estimate
            ),
            "execution_trace": [compact_entry],
        }

    def route_assistant(state):
        if state.get("budget_exhausted"):
            return END
        last = state.get("messages", [])[-1]
        return "tools" if _tool_calls(last) else END

    builder = StateGraph(AgentState)
    builder.add_node("assistant", assistant)
    builder.add_node("tools", tools)
    builder.add_node("compact", compact)
    builder.add_edge(START, "assistant")
    builder.add_conditional_edges("assistant", route_assistant)
    builder.add_edge("tools", "compact")
    builder.add_edge("compact", "assistant")
    checkpointer = checkpointer or InMemorySaver()
    graph = builder.compile(checkpointer=checkpointer)
    graph.agent_runtime = runtime
    graph.agent_config = cfg
    graph.agent_skills = skills
    graph.agent_digest_model = digest_model
    graph.agent_peak_context = peak_context
    return graph


def run_task(
    graph,
    question,
    thread_id,
    task_id=None,
    callbacks_config=None,
    history=None,
    timeout_seconds=None,
):
    task_id = task_id or str(uuid.uuid4())
    initial_messages = []
    for item in history or []:
        if item["role"] == "user":
            initial_messages.append(HumanMessage(content=item["content"]))
        elif item["role"] == "assistant":
            initial_messages.append(AIMessage(content=item["content"]))
    config = {
        "configurable": {"thread_id": thread_id},
        "recursion_limit": graph.agent_config["limits"]["max_steps"],
        **(callbacks_config or {}),
    }
    with task_deadline(timeout_seconds):
        try:
            state = graph.invoke(
                {
                    "messages": [
                        *initial_messages,
                        HumanMessage(content=question),
                    ],
                    "task_id": task_id,
                },
                config=config,
            )
        except GraphRecursionError:
            snapshot = graph.get_state(config)
            state = dict(snapshot.values)
            state["messages"] = [
                *state.get("messages", []),
                AIMessage(content=_budget_answer(
                    state.get("messages", []), state.get("budget_exhausted", False)
                )),
            ]
    return state


def final_answer(state):
    for message in reversed(state.get("messages", [])):
        if isinstance(message, AIMessage) and not _tool_calls(message):
            return _message_text(message)
    return "The agent did not produce a final answer."


__all__ = [
    "AgentState",
    "GraphRecursionError",
    "build_graph",
    "final_answer",
    "run_task",
]
