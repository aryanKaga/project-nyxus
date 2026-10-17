"""Interactive and one-shot command-line interface."""
import argparse
from contextlib import ExitStack
import logging
from pathlib import Path
import sys
import uuid

from langgraph.checkpoint.memory import InMemorySaver
from langgraph.checkpoint.sqlite import SqliteSaver
import yaml

from agent_loop import build_graph, final_answer, run_task
from observability import format_trace, setup_observability
from paths import resolve_agent_dir, resolve_repo_root


def _check_python():
    if sys.version_info < (3, 11):
        raise RuntimeError("This agent requires Python 3.11 or newer.")


def _checkpointer(agent_dir, config, stack):
    if config["checkpoint"]["backend"] == "memory":
        return InMemorySaver()
    if config["checkpoint"]["backend"] == "sqlite":
        path = Path(config["checkpoint"]["sqlite_path"])
        if not path.is_absolute():
            path = agent_dir / path
        saver = stack.enter_context(SqliteSaver.from_conn_string(str(path)))
        saver.setup()
        return saver
    raise ValueError(
        f"Unsupported checkpoint backend: {config['checkpoint']['backend']}"
    )


def main(argv=None):
    parser = argparse.ArgumentParser(description="Read-only codegraph exploration agent")
    parser.add_argument("--repo", required=True, help="Repository root to explore")
    parser.add_argument("--question", help="Ask one question and exit")
    parser.add_argument("--thread-id", help="Resume an existing checkpoint thread")
    parser.add_argument("--trace", action="store_true", help="Print execution trace of agent steps and tool calls")
    args = parser.parse_args(argv)
    _check_python()
    logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")

    agent_dir = resolve_agent_dir()
    repo_root = resolve_repo_root(args.repo)
    repo_id = repo_root.name
    thread_id = args.thread_id or str(uuid.uuid4())
    with ExitStack() as stack:
        with_checkpointer = _checkpointer(
            agent_dir, yaml.safe_load((agent_dir / "config.yaml").read_text()), stack
        )
        graph = build_graph(
            root=repo_root,
            agent_dir=agent_dir,
            checkpointer=with_checkpointer,
        )
        run_options = setup_observability(
            graph.agent_config, repo_id, thread_id
        )
        while True:
            question = args.question
            if question is None:
                try:
                    question = input("\nQuestion (or 'exit'): ").strip()
                except EOFError:
                    break
                if question.lower() in {"exit", "quit"}:
                    break
                if not question:
                    continue
            task_id = str(uuid.uuid4())
            state = run_task(
                graph, question, thread_id, task_id, run_options
            )
            runtime = graph.agent_runtime
            print(final_answer(state))
            print(
                "\n--- usage ---\n"
                f"tool calls: {runtime.calls}\n"
                f"read_file calls: {runtime.read_calls}\n"
                f"truncations: {runtime.truncations}\n"
                f"peak context estimate: "
                f"{max(state.get('peak_context_tokens', 0), graph.agent_peak_context['value'])} tokens"
            )
            if args.trace:
                trace = state.get("execution_trace", []) or (
                    run_options.get("tracer").get_trace() if "tracer" in run_options else []
                )
                print("\n--- execution trace ---\n" + format_trace(trace))
            if args.question is not None:
                break
            question = None
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
