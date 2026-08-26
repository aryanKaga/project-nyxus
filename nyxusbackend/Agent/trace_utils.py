from Agent.state import TraceEntry


def format_trace(trace: list[TraceEntry], last_n: int | None = 10) -> str:
    """Flat, chronological, non-LLM rendering of the execution trace."""
    if not trace:
        return "None"

    entries = trace[-last_n:] if last_n else trace

    return "\n".join(
        f"Step {t['step']}: {t['agent']} -> {t['action']} -> {t['result']}"
        for t in entries
    )