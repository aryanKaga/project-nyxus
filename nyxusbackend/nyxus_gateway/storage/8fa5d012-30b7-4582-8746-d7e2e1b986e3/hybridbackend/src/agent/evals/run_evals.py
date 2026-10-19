"""Run configured repository exploration evaluation cases."""
import argparse
import json
from pathlib import Path
import re
import sys

import yaml
from langgraph.checkpoint.memory import InMemorySaver

AGENT_DIR = Path(__file__).resolve().parents[1]
if str(AGENT_DIR) not in sys.path:
    sys.path.insert(0, str(AGENT_DIR))

from agent_loop import build_graph, final_answer, run_task
from observability import setup_observability
from paths import resolve_agent_dir


_FILE_CITATION = re.compile(
    r"(?<![\w./-])[\w./-]+\.[A-Za-z0-9_-]+:\d+(?:-\d+)?"
)


def _resolve_repo(raw_path, cases_path):
    repo_path = Path(raw_path)
    if not repo_path.is_absolute():
        repo_path = cases_path.parent / repo_path
    return repo_path.resolve()


def run_evals(cases_path, json_path):
    cases_path = Path(cases_path).resolve()
    data = yaml.safe_load(cases_path.read_text())
    repos = {item["id"]: item for item in data.get("repos", [])}
    agent_dir = resolve_agent_dir()
    results = []

    for case in data.get("cases", []):
        result = {
            "eval_id": case["id"],
            "skill_loaded": None,
            "skill_matches": None,
            "tool_calls": 0,
            "max_tool_calls": case.get("max_tool_calls"),
            "cited_files": [],
            "must_cite_files": case.get("must_cite_files", []),
            "unsupported_declined": None,
            "answer": "",
            "error": None,
        }
        repo_spec = repos.get(case.get("repo"))
        if not repo_spec:
            result["error"] = f"unknown repo id: {case.get('repo')}"
            results.append(result)
            continue
        root = _resolve_repo(repo_spec["path"], cases_path)
        if not root.is_dir():
            result["error"] = f"repository path does not exist: {root}"
            results.append(result)
            continue

        try:
            graph = build_graph(
                root=root,
                agent_dir=agent_dir,
                checkpointer=InMemorySaver(),
            )
            thread_id = f"eval:{case['id']}"
            tracing = setup_observability(
                graph.agent_config,
                repo_spec["id"],
                thread_id,
                extra_tags=[f"eval_id:{case['id']}"],
            )
            state = run_task(
                graph,
                case["question"],
                thread_id,
                callbacks_config=tracing,
            )
            answer = final_answer(state)
            runtime = graph.agent_runtime
            skill = state.get("loaded_skill") or None
            citations = list(dict.fromkeys(_FILE_CITATION.findall(answer)))
            result.update({
                "skill_loaded": skill,
                "skill_matches": (
                    skill == case.get("expected_skill")
                    if case.get("expected_skill") is not None
                    else None
                ),
                "tool_calls": runtime.calls,
                "cited_files": citations,
                "answer": answer,
            })
            expected_cites = case.get("must_cite_files", [])
            result["must_cite_files_present"] = all(
                file_path in answer for file_path in expected_cites
            )
            if result["max_tool_calls"] is not None:
                result["within_tool_budget"] = (
                    runtime.calls <= result["max_tool_calls"]
                )
            if case.get("expected_skill") is None:
                result["unsupported_declined"] = (
                    "not available" in answer.lower()
                    or "cannot perform" in answer.lower()
                )
        except Exception as error:
            result["error"] = f"{type(error).__name__}: {error}"
        results.append(result)

    json_path = Path(json_path)
    json_path.parent.mkdir(parents=True, exist_ok=True)
    json_path.write_text(json.dumps(results, indent=2) + "\n")
    _print_table(results)
    print(f"\nJSON report: {json_path}")
    return results


def _print_table(results):
    columns = (
        "eval_id",
        "skill loaded (match)",
        "calls/max",
        "cited / required files",
        "unsupported declined",
        "error",
    )
    rows = [columns]
    for item in results:
        skill = item["skill_loaded"] or "-"
        if item["skill_loaded"]:
            skill = f"{skill} ({item['skill_matches']})"
        citation_summary = (
            ", ".join(item["cited_files"]) or "-"
        ) + " / " + (
            ", ".join(item["must_cite_files"]) or "none required"
        )
        rows.append((
            item["eval_id"],
            skill,
            f"{item['tool_calls']}/{item['max_tool_calls'] or '-'}",
            citation_summary,
            str(item["unsupported_declined"] if item["unsupported_declined"] is not None else "-"),
            item["error"] or "-",
        ))
    widths = [max(len(str(row[i])) for row in rows) for i in range(len(columns))]
    for row_index, row in enumerate(rows):
        print(" | ".join(str(cell).ljust(widths[i]) for i, cell in enumerate(row)))
        if row_index == 0:
            print("-+-".join("-" * width for width in widths))


def main(argv=None):
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--cases",
        default=str(Path(__file__).with_name("cases.yaml")),
        help="Evaluation YAML file",
    )
    parser.add_argument(
        "--json",
        default="evals/results.json",
        help="Path for the JSON report",
    )
    args = parser.parse_args(argv)
    run_evals(args.cases, args.json)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
