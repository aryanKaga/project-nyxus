from pathlib import Path

from tools.codegraph_wrapper import ToolRuntime


def test_runtime_rejects_paths_outside_repo(tmp_path):
    repo = tmp_path / "repo"
    repo.mkdir()
    outside = tmp_path / "outside.py"
    outside.write_text("secret")
    runtime = ToolRuntime(root=repo)

    result = runtime.call("read_file", {"path": str(outside)})

    assert "outside the repo root" in result


def test_runtime_rejects_unknown_arguments(tmp_path):
    repo = tmp_path / "repo"
    repo.mkdir()
    runtime = ToolRuntime(root=repo)

    result = runtime.call("search", {"query": "safe", "unexpected": "value"})

    assert "unknown argument" in result


def test_find_files_returns_matching_paths_without_running_codegraph(tmp_path):
    repo = tmp_path / "repo"
    (repo / "src" / "evals").mkdir(parents=True)
    (repo / ".git").mkdir()
    (repo / "src" / "evals" / "evaluation_cases.yaml").write_text("cases: []")
    (repo / "src" / "Harness_README.md").write_text("read-only")
    (repo / ".git" / "eval-cache").write_text("ignored")
    runtime = ToolRuntime(root=repo)

    result = runtime.call("find_files", {"pattern": "*harness*,*eval*"})

    assert "src/evals" in result
    assert "src/evals/evaluation_cases.yaml" in result
    assert "src/Harness_README.md" in result
    assert ".git" not in result
    assert runtime.calls == 1


def test_find_files_rejects_path_globs_and_confines_directory(tmp_path):
    repo = tmp_path / "repo"
    repo.mkdir()
    runtime = ToolRuntime(root=repo)

    traversal = runtime.call("find_files", {"pattern": "../*"})
    outside = runtime.call(
        "find_files", {"pattern": "*", "directory": "../"}
    )

    assert "without path components" in traversal
    assert "outside the repo root" in outside
    assert runtime.calls == 0


def test_run_shell_uses_workspace_and_can_modify_it(tmp_path):
    repo = tmp_path / "repo"
    repo.mkdir()
    runtime = ToolRuntime(root=repo)

    result = runtime.call(
        "run_shell",
        {"command": "pwd; printf 'hello\\n' > shell-output.txt; cat shell-output.txt"},
    )

    assert str(repo) in result
    assert "hello" in result
    assert (repo / "shell-output.txt").read_text() == "hello\n"
    assert runtime.calls == 1


def test_run_shell_reports_exit_status_and_respects_tool_budget(tmp_path):
    repo = tmp_path / "repo"
    repo.mkdir()
    runtime = ToolRuntime(root=repo)

    result = runtime.call("run_shell", {"command": "printf error >&2; exit 7"})
    runtime.limits["max_tool_calls_per_task"] = runtime.calls
    exhausted = runtime.call("run_shell", {"command": "echo must-not-run"})

    assert "Exit code: 7" in result
    assert "stderr:" in result
    assert "error" in result
    assert "budget reached" in exhausted
