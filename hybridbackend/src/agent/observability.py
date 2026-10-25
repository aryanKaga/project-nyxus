"""Langfuse, LangSmith, and in-memory execution tracing for the agent."""
from datetime import datetime, timezone
import hashlib
import ipaddress
import json
import logging
import os
from pathlib import Path
import tempfile
import threading
import time
from typing import Any, Callable, TypedDict
from urllib.parse import urlparse

logger = logging.getLogger(__name__)
_warned_duplicate_traces = False


class TraceEntry(TypedDict, total=False):
    step: int
    timestamp: float
    iso_time: str
    node: str
    action: str
    name: str
    inputs: Any
    output: Any
    duration_ms: float
    status: str
    preview: str
    metadata: dict[str, Any]


def format_trace(trace: list[dict[str, Any]], last_n: int | None = None) -> str:
    """Format an execution trace into a clean, human-readable string."""
    if not trace:
        return "No execution trace recorded."
    entries = trace[-last_n:] if last_n else trace
    lines = []
    for entry in entries:
        step = entry.get("step", "?")
        node = entry.get("node", "agent")
        action = entry.get("action", "step")
        name = entry.get("name", "")
        duration = entry.get("duration_ms")
        duration_str = f" ({duration}ms)" if duration is not None else ""
        status = entry.get("status", "ok")
        preview = entry.get("preview") or entry.get("output") or ""
        if isinstance(preview, (dict, list)):
            preview = str(preview)
        preview_clean = str(preview).strip().replace("\n", " ")
        if len(preview_clean) > 80:
            preview_clean = preview_clean[:77] + "..."
        desc = f"{name} " if name else ""
        detail = f" -> {desc}[{status}]: {preview_clean}" if preview_clean else f" -> {desc}[{status}]"
        lines.append(f"Step {step} | {node} -> {action}{duration_str}{detail}")
    return "\n".join(lines)


try:
    from langchain_core.callbacks import BaseCallbackHandler
except ImportError:
    class BaseCallbackHandler:  # type: ignore[no-redef]
        """Fallback callback handler base class when langchain_core is unavailable."""
        pass


class AgentTracer(BaseCallbackHandler):
    """Structured callback tracer for LLM calls, tool executions, and graph transitions."""

    def __init__(
        self,
        on_event: Callable[[str, dict[str, Any]], None] | None = None,
        hide_inputs_outputs: bool = False,
        max_entries: int = 200,
        trace_path: Path | None = None,
        mongo_store: Any | None = None,
        workspace_id: str | None = None,
        api_key: str | None = None,
        thread_id: str | None = None,
        task_id: str | None = None,
    ):
        super().__init__()
        self.on_event = on_event
        self.hide_inputs_outputs = hide_inputs_outputs
        self.max_entries = max_entries
        self.trace_path = trace_path
        self.mongo_store = mongo_store
        self.workspace_id = workspace_id
        self.api_key = api_key
        self.thread_id = thread_id
        self.task_id = task_id
        self.trace: list[dict[str, Any]] = []
        self._trace_lock = threading.Lock()
        self._llm_starts: dict[str, float] = {}
        self._tool_starts: dict[str, float] = {}

    def add_entry(
        self,
        node: str,
        action: str,
        name: str = "",
        inputs: Any = None,
        output: Any = None,
        duration_ms: float | None = None,
        status: str = "ok",
        metadata: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """Record a structured trace event."""
        now = time.time()
        iso = datetime.now(timezone.utc).isoformat()
        entry: dict[str, Any] = {
            "step": len(self.trace) + 1,
            "timestamp": now,
            "iso_time": iso,
            "node": node,
            "action": action,
            "name": name,
            "status": status,
        }
        if duration_ms is not None:
            entry["duration_ms"] = round(duration_ms, 2)
        if not self.hide_inputs_outputs:
            if inputs is not None:
                entry["inputs"] = inputs
            if output is not None:
                entry["output"] = output
        else:
            entry["inputs"] = "[masked]"
            entry["output"] = "[masked]"
        if output is not None and not self.hide_inputs_outputs:
            text = str(output).strip().replace("\n", " ")
            entry["preview"] = text[:120] + "..." if len(text) > 120 else text
        if metadata:
            entry["metadata"] = metadata

        with self._trace_lock:
            if len(self.trace) >= self.max_entries:
                self.trace.pop(0)
            self.trace.append(entry)
            if self.trace_path:
                self._persist_trace()
            if self.mongo_store:
                self._persist_to_mongo(entry)

        if self.on_event:
            try:
                self.on_event(action, entry)
            except Exception:
                logger.exception("Local tracing callback failed.")
        return entry

    def _persist_to_mongo(self, entry: dict[str, Any]) -> None:
        """Persist an observation entry to MongoDB."""
        try:
            if hasattr(self.mongo_store, "save_observation"):
                self.mongo_store.save_observation(
                    api_key=self.api_key or "default",
                    workspace_id=self.workspace_id or "default",
                    observation=entry,
                    task_id=self.task_id,
                    thread_id=self.thread_id,
                    step=entry.get("step"),
                )
        except Exception:
            logger.exception("Could not persist observation to MongoDB.")

    def _persist_trace(self) -> None:
        """Atomically persist this bounded trace snapshot on the local machine."""
        temporary_path = None
        try:
            self.trace_path.parent.mkdir(parents=True, exist_ok=True)
            with tempfile.NamedTemporaryFile(
                mode="w",
                encoding="utf-8",
                dir=self.trace_path.parent,
                prefix=f".{self.trace_path.name}.",
                suffix=".tmp",
                delete=False,
            ) as output:
                temporary_path = Path(output.name)
                os.chmod(temporary_path, 0o600)
                json.dump(self.trace, output, ensure_ascii=False)
                output.write("\n")
                output.flush()
                os.fsync(output.fileno())
            os.replace(temporary_path, self.trace_path)
        except OSError:
            if temporary_path is not None:
                try:
                    temporary_path.unlink(missing_ok=True)
                except OSError:
                    logger.warning("Could not remove temporary local trace file %s.", temporary_path)
            logger.exception("Could not persist local agent trace to %s.", self.trace_path)

    def on_llm_start(
        self,
        serialized: dict[str, Any] | None = None,
        prompts: list[str] | None = None,
        *,
        run_id: Any = None,
        **kwargs: Any,
    ) -> None:
        key = str(run_id or "default_llm")
        self._llm_starts[key] = time.monotonic()
        name = (serialized or {}).get("name") or (kwargs.get("invocation_params") or {}).get("model", "llm")
        self.add_entry(
            node="assistant",
            action="llm_start",
            name=name,
            inputs=prompts[0] if prompts and not self.hide_inputs_outputs else None,
            status="running",
        )

    def on_llm_end(self, response: Any, *, run_id: Any = None, **kwargs: Any) -> None:
        key = str(run_id or "default_llm")
        duration_ms = None
        if key in self._llm_starts:
            duration_ms = (time.monotonic() - self._llm_starts.pop(key)) * 1000
        output_preview = ""
        try:
            generations = getattr(response, "generations", [])
            if generations and generations[0]:
                output_preview = getattr(generations[0][0], "text", "")
        except Exception:
            pass
        self.add_entry(
            node="assistant",
            action="llm_end",
            output=output_preview or "completion received",
            duration_ms=duration_ms,
            status="ok",
        )

    def on_llm_error(self, error: BaseException, *, run_id: Any = None, **kwargs: Any) -> None:
        key = str(run_id or "default_llm")
        duration_ms = None
        if key in self._llm_starts:
            duration_ms = (time.monotonic() - self._llm_starts.pop(key)) * 1000
        self.add_entry(
            node="assistant",
            action="llm_error",
            output=str(error),
            duration_ms=duration_ms,
            status="error",
        )

    def on_tool_start(
        self,
        serialized: dict[str, Any] | None = None,
        input_str: str = "",
        *,
        run_id: Any = None,
        **kwargs: Any,
    ) -> None:
        key = str(run_id or "default_tool")
        self._tool_starts[key] = time.monotonic()
        tool_name = (serialized or {}).get("name") or kwargs.get("name") or "tool"
        self.add_entry(
            node="tools",
            action="tool_start",
            name=tool_name,
            inputs=input_str if not self.hide_inputs_outputs else "[masked]",
            status="running",
        )

    def on_tool_end(self, output: Any, *, run_id: Any = None, **kwargs: Any) -> None:
        key = str(run_id or "default_tool")
        duration_ms = None
        if key in self._tool_starts:
            duration_ms = (time.monotonic() - self._tool_starts.pop(key)) * 1000
        self.add_entry(
            node="tools",
            action="tool_end",
            output=output,
            duration_ms=duration_ms,
            status="ok",
        )

    def on_tool_error(self, error: BaseException, *, run_id: Any = None, **kwargs: Any) -> None:
        key = str(run_id or "default_tool")
        duration_ms = None
        if key in self._tool_starts:
            duration_ms = (time.monotonic() - self._tool_starts.pop(key)) * 1000
        self.add_entry(
            node="tools",
            action="tool_error",
            output=str(error),
            duration_ms=duration_ms,
            status="error",
        )

    def get_trace(self) -> list[dict[str, Any]]:
        with self._trace_lock:
            return list(self.trace)

    def format_trace(self, last_n: int | None = None) -> str:
        return format_trace(self.trace, last_n)

    def clear(self) -> None:
        with self._trace_lock:
            self.trace.clear()
            self._llm_starts.clear()
            self._tool_starts.clear()
            if self.trace_path:
                self._persist_trace()


def _hide_langfuse_content(*, params):
    from langfuse.types import MaskOtelSpansResult, OtelSpanPatch

    sensitive = ("input", "output", "prompt", "completion", "content", "message")
    patches = {}
    for identifier, span in params.spans.items():
        keys = tuple(
            key
            for key in span.attributes
            if any(token in key.lower() for token in sensitive)
        )
        if keys:
            patches[identifier] = OtelSpanPatch(delete_attributes=keys)
    return MaskOtelSpansResult(span_patches=patches) if patches else None


def setup_observability(
    config,
    repo_id,
    thread_id,
    skill="auto",
    extra_tags=None,
    on_event=None,
    mongo_store=None,
    api_key=None,
    task_id=None,
):
    """Return the invocation config for tracing backends (Langfuse, LangSmith, AgentTracer/MongoDB)."""
    global _warned_duplicate_traces
    settings = config.get("observability", {})
    langfuse_enabled = settings.get("langfuse", {}).get("enabled", False)
    langsmith_enabled = settings.get("langsmith", {}).get("enabled", False)
    hide_io = settings.get("hide_inputs_outputs", False)
    local_trace_cfg = settings.get("local_trace", {})
    local_trace_enabled = local_trace_cfg.get("enabled", False)
    mongo_cfg = settings.get("mongodb", {})
    mongo_enabled = mongo_cfg.get("enabled", False)
    if mongo_store is None and mongo_enabled:
        try:
            from database.mongo_store import get_mongo_store
            mongo_store = get_mongo_store()
        except Exception:
            mongo_store = None

    callbacks = []

    tracer = AgentTracer(
        on_event=on_event,
        hide_inputs_outputs=hide_io,
        max_entries=local_trace_cfg.get("max_entries", 200),
        trace_path=(
            _local_trace_path(local_trace_cfg, thread_id)
            if local_trace_enabled
            else None
        ),
        mongo_store=mongo_store,
        workspace_id=repo_id,
        api_key=api_key,
        thread_id=thread_id,
        task_id=task_id,
    )
    if local_trace_enabled or mongo_store is not None or on_event:
        callbacks.append(tracer)

    if langsmith_enabled:
        api_key = os.environ.get("LANGSMITH_API_KEY")
        if not api_key:
            raise RuntimeError(
                "LangSmith tracing is enabled but LANGSMITH_API_KEY is not set."
            )
        langsmith_settings = settings.get("langsmith", {})
        endpoint = (
            langsmith_settings.get("endpoint")
            or os.environ.get("LANGSMITH_ENDPOINT")
            or "http://127.0.0.1:1984"
        )
        if not _is_local_endpoint(endpoint):
            raise RuntimeError(
                "LangSmith endpoint must be local. Set observability.langsmith.endpoint "
                "to a localhost URL to keep trace data on this machine."
            )
        os.environ["LANGSMITH_ENDPOINT"] = endpoint
        os.environ["LANGCHAIN_ENDPOINT"] = endpoint
        os.environ["LANGSMITH_TRACING"] = "true"
        project = langsmith_settings.get("project")
        if project:
            os.environ["LANGSMITH_PROJECT"] = project
        elif not os.environ.get("LANGSMITH_PROJECT"):
            raise RuntimeError(
                "LangSmith tracing is enabled but LANGSMITH_PROJECT is not set."
            )
        if hide_io:
            os.environ["LANGSMITH_HIDE_INPUTS"] = "true"
            os.environ["LANGSMITH_HIDE_OUTPUTS"] = "true"
    else:
        os.environ["LANGSMITH_TRACING"] = "false"

    if langfuse_enabled:
        if not (
            os.environ.get("LANGFUSE_PUBLIC_KEY")
            and os.environ.get("LANGFUSE_SECRET_KEY")
        ):
            raise RuntimeError(
                "Langfuse tracing is enabled but LANGFUSE_PUBLIC_KEY and "
                "LANGFUSE_SECRET_KEY are not set."
            )
        try:
            from langfuse import Langfuse
            from langfuse.langchain import CallbackHandler
        except ImportError as error:
            raise RuntimeError(
                "Langfuse tracing is enabled; install the pinned langfuse dependency."
            ) from error
        if hide_io:
            Langfuse(mask_otel_spans=_hide_langfuse_content)
        callbacks.append(CallbackHandler())

    if langfuse_enabled and langsmith_enabled and not _warned_duplicate_traces:
        logger.warning(
            "Langfuse and LangSmith tracing are both enabled; duplicate traces will be sent."
        )
        _warned_duplicate_traces = True

    tags = [
        f"repo_id:{repo_id}",
        f"phase:{config.get('phase', 1)}",
        f"skill:{skill}",
        f"thread_id:{thread_id}",
        f"codegraph_version:{config.get('codegraph', {}).get('version', 'PIN-ME')}",
    ]
    tags.extend(extra_tags or [])
    metadata = {
        "repo_id": repo_id,
        "phase": config.get("phase", 1),
        "skill": skill,
        "thread_id": thread_id,
        "codegraph_version": config.get("codegraph", {}).get("version", "PIN-ME"),
    }
    result = {
        "callbacks": callbacks,
        "tags": tags,
        "metadata": metadata,
        "tracer": tracer,
    }
    if mongo_store is not None:
        result["mongo_store"] = mongo_store
        result["api_key"] = api_key
        result["task_id"] = task_id
    return result


def _local_trace_path(local_trace_cfg, thread_id):
    configured_directory = Path(
        local_trace_cfg.get("directory", ".nyxus/traces")
    )
    if not configured_directory.is_absolute():
        configured_directory = Path(__file__).resolve().parents[2] / configured_directory
    safe_thread = hashlib.sha256(
        str(thread_id).encode("utf-8")
    ).hexdigest()[:12]
    trace_name = f"trace-{int(time.time() * 1000)}-{safe_thread}-{os.urandom(6).hex()}.json"
    return configured_directory / trace_name


def _is_local_endpoint(endpoint):
    if not isinstance(endpoint, str):
        return False
    parsed = urlparse(endpoint)
    if parsed.scheme not in ("http", "https") or not parsed.hostname:
        return False
    hostname = parsed.hostname.lower()
    if hostname == "localhost":
        return True
    try:
        return ipaddress.ip_address(hostname).is_loopback
    except ValueError:
        return False
