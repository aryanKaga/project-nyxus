"""Allowlisted, budgeted wrapper around the codegraph CLI.

Usage:
    from skills_loader import SkillRegistry
    from tools.codegraph_wrapper import ToolRuntime

    skills = SkillRegistry("agent")
    rt = ToolRuntime("agent", root="/path/to/repo", skills=skills, llm_call=my_llm)
    tool_defs = rt.tool_definitions()          # register these with your LLM
    result = rt.call("find_symbol", {"name": "AuthService"})

`llm_call(system: str, user: str, max_tokens: int) -> str` is any cheap model
function; it is only used by the `digest` tool.

Requires: PyYAML.
"""
import fnmatch
import json
import os
import subprocess
import uuid
from pathlib import Path

import yaml

from paths import resolve_agent_dir, resolve_repo_root
from timeouts import check_deadline, remaining_seconds

CHARS_PER_TOKEN = 4          # rough budget conversion
MAX_DIGEST_INPUT_CHARS = 60_000


class ToolError(Exception):
    pass


class ToolRuntime:
    def __init__(self, agent_dir=None, root=None, skills=None, llm_call=None):
        self.agent_dir = resolve_agent_dir(agent_dir)
        self.root = resolve_repo_root(root)
        self.cfg = yaml.safe_load((self.agent_dir / "config.yaml").read_text())
        schema = json.loads((self.agent_dir / "tools" / "schemas.json").read_text())

        all_cli = {t["name"]: t for t in schema["tools"]}
        enabled = list(self.cfg["tools"])
        missing = [n for n in enabled if n not in all_cli]
        if missing:
            raise ValueError(f"config.yaml enables unknown tools: {missing}")

        self.cli_tools = {n: all_cli[n] for n in enabled}
        shell_enabled = self.cfg.get("shell", {}).get("enabled", False)
        self.builtins = {
            t["name"]: t
            for t in schema["builtin_tools"]
            if t["name"] != "run_shell" or shell_enabled
        }
        self.builtin_handlers = {}
        self.limits = self.cfg["limits"]
        self.binary = self.cfg["codegraph"]["binary"]
        self.skills = skills
        self.llm_call = llm_call

        self.calls = 0
        self.read_calls = 0
        self.truncations = 0
        self.results = {}   # result_id -> full text of truncated outputs
        self.scratch = {}

    # ---- tool definitions for the LLM -------------------------------------

    def tool_names(self):
        return set(self.cli_tools) | set(self.builtins)

    def tool_definitions(self):
        defs = []
        for tool in [*self.cli_tools.values(), *self.builtins.values()]:
            defs.append({
                "name": tool["name"],
                "description": tool["description"],
                "input_schema": self._input_schema(tool),
            })
        return defs

    def register_builtin_handler(self, name, handler):
        if name not in self.builtins:
            raise ValueError(f"'{name}' is not an enabled built-in tool.")
        self.builtin_handlers[name] = handler

    @staticmethod
    def _input_schema(tool):
        props, required = {}, []
        for a in tool["args"]:
            p = {"type": a["type"], "description": a.get("description", "")}
            if "enum" in a:
                p["enum"] = a["enum"]
            props[a["name"]] = p
            if a.get("required"):
                required.append(a["name"])
        return {
            "type": "object",
            "properties": props,
            "required": required,
            "additionalProperties": False,
        }

    # ---- dispatch ----------------------------------------------------------

    def call(self, name, args=None):
        check_deadline()
        args = args or {}
        if name in self.builtins:
            try:
                self._validate_builtin_args(self.builtins[name], args)
            except ToolError as e:
                return f"Error: {e}"
            handler = self.builtin_handlers.get(name)
            if handler is not None:
                return handler(args)
            return self._builtin(name, args)

        tool = self.cli_tools.get(name)
        if tool is None:
            return f"Error: tool '{name}' is not available."

        if self.calls >= self.limits["max_tool_calls_per_task"]:
            return ("Error: tool-call budget reached. Answer with what you have "
                    "and state what is unverified.")
        if name == "read_file" and self.read_calls >= self.limits["max_read_file_calls"]:
            return ("Error: read_file budget reached. Use what you have, or cite "
                    "file:line for the rest.")

        try:
            argv = self._build_argv(tool, args)
        except ToolError as e:
            return f"Error: {e}"

        self.calls += 1
        if name == "read_file":
            self.read_calls += 1
        return self._run(argv)

    def reset_budget(self):
        """Call at the start of each new user task."""
        self.calls = 0
        self.read_calls = 0
        self.truncations = 0

    def _validate_builtin_args(self, tool, args):
        known = {a["name"] for a in tool["args"]}
        unknown = set(args) - known
        if unknown:
            raise ToolError(f"unknown argument(s): {sorted(unknown)}")
        for arg in tool["args"]:
            value = args.get(arg["name"])
            if value is None:
                if arg.get("required"):
                    raise ToolError(f"missing required argument '{arg['name']}'")
                continue
            ToolRuntime._check_type(arg, value)
            if arg.get("path"):
                self._confine(value)

    # ---- argv construction (no shell, validated) ---------------------------

    def _build_argv(self, tool, args):
        known = {a["name"] for a in tool["args"]}
        unknown = set(args) - known
        if unknown:
            raise ToolError(f"unknown argument(s): {sorted(unknown)}")

        positional, flags = [], []
        for a in tool["args"]:
            value = args.get(a["name"])
            if value is None:
                if a.get("required"):
                    raise ToolError(f"missing required argument '{a['name']}'")
                continue

            self._check_type(a, value)
            if a.get("path"):
                self._confine(value)

            if a["type"] == "boolean":
                if value:
                    flags.append(a["flag"])
                continue

            text = str(value)
            if text.startswith("-"):
                raise ToolError(f"'{a['name']}' must not start with '-'")
            if a.get("positional"):
                positional.append(text)
            else:
                flags += [a["flag"], text]

        argv = [self.binary, *tool["command"], *positional, *flags]
        if tool.get("root_flag"):
            argv += ["--root", "."]
        if tool.get("json"):
            argv.append("--json")
        return argv

    @staticmethod
    def _check_type(arg, value):
        t = arg["type"]
        ok = (
            (t == "string" and isinstance(value, str))
            or (t == "integer" and isinstance(value, int) and not isinstance(value, bool))
            or (t == "boolean" and isinstance(value, bool))
        )
        if not ok:
            raise ToolError(f"argument '{arg['name']}' must be a {t}")
        if "enum" in arg and value not in arg["enum"]:
            raise ToolError(f"argument '{arg['name']}' must be one of {arg['enum']}")

    def _confine(self, value):
        try:
            (self.root / value).resolve().relative_to(self.root)
        except ValueError:
            raise ToolError("path is outside the repo root")

    # ---- execution and output shaping -------------------------------------

    def _run(self, argv):
        remaining = remaining_seconds()
        timeout = self.limits["command_timeout_seconds"]
        if remaining is not None:
            timeout = min(timeout, remaining)
        try:
            proc = subprocess.run(
                argv,
                cwd=self.root,
                capture_output=True,
                text=True,
                timeout=timeout,
            )
        except FileNotFoundError:
            return (f"Error: '{self.binary}' was not found. Install codegraph or "
                    "fix codegraph.binary in config.yaml.")
        except subprocess.TimeoutExpired:
            return ("Error: command timed out. Narrow the query or scope it to a "
                    "subdirectory. The first call on a large repo builds the index "
                    "and may need one retry.")

        if proc.returncode != 0:
            err = (proc.stderr or proc.stdout).strip()[:400]
            return (f"Error: codegraph exited with code {proc.returncode}: {err}\n"
                    "If this looks like an install or runtime problem, call doctor once.")

        return self._cap(proc.stdout.strip() or "(no output)")

    def _cap(self, text):
        max_chars = self.limits["tool_output_tokens"] * CHARS_PER_TOKEN
        if len(text) <= max_chars:
            return text
        self.truncations += 1
        rid = f"r_{uuid.uuid4().hex[:8]}"
        self.results[rid] = text
        return (text[:max_chars]
                + f"\n\n[truncated: showing {max_chars} of {len(text)} chars. "
                  f"Full result stored as {rid}. Narrow the query, or call "
                  f"digest(result_id=\"{rid}\", question=...).]")

    # ---- built-in tools ----------------------------------------------------

    def _builtin(self, name, args):
        if name == "use_skill":
            if self.skills is None:
                return "Error: no skills are loaded."
            text = self.skills.get(args.get("name", ""))
            return text if text else f"Error: unknown skill '{args.get('name')}'."

        if name == "scratchpad":
            action = args.get("action")
            key = args.get("key")
            if action == "list":
                return json.dumps(sorted(self.scratch)) if self.scratch else "(empty)"
            if not key:
                return "Error: 'key' is required."
            if action == "set":
                self.scratch[key] = args.get("value", "")
                return "ok"
            if action == "get":
                return self.scratch.get(key, "(not set)")
            return "Error: action must be set, get or list."

        if name == "find_files":
            return self._find_files(args)

        if name == "run_shell":
            return self._run_shell(args["command"])

        if name == "digest":
            if self.llm_call is None:
                return "Error: digest is not configured (no llm_call)."
            text = self.results.get(args.get("result_id", ""))
            if text is None:
                return "Error: unknown result_id."
            question = args.get("question", "")
            if not question:
                return "Error: 'question' is required."
            max_tokens = args.get("max_tokens") or 300
            system = (self.agent_dir / "digestor" / "prompt.md").read_text()
            user = f"Question: {question}\n\nMaterial:\n{text[:MAX_DIGEST_INPUT_CHARS]}"
            return self.llm_call(system, user, max_tokens)

        return f"Error: unhandled built-in '{name}'."

    def _find_files(self, args):
        patterns = [
            part.strip()
            for part in args["pattern"].split(",")
            if part.strip()
        ]
        if not patterns or any(
            pattern.startswith("-")
            or "\x00" in pattern
            or "/" in pattern
            or "\\" in pattern
            or ".." in pattern
            for pattern in patterns
        ):
            return "Error: use comma-separated filename globs without path components."
        if self.calls >= self.limits["max_tool_calls_per_task"]:
            return ("Error: tool-call budget reached. Answer with what you have "
                    "and state what is unverified.")

        directory = args.get("directory", ".")
        try:
            search_root = (self.root / directory).resolve()
            search_root.relative_to(self.root)
        except ValueError:
            return "Error: path is outside the repo root."
        if not search_root.is_dir():
            return "Error: search directory does not exist inside the repo."

        limit = min(args.get("limit", 50), 100)
        if limit < 1:
            return "Error: limit must be between 1 and 100."

        self.calls += 1
        matches = []
        truncated = False
        excluded = {
            ".git",
            ".hg",
            ".svn",
            ".venv",
            "venv",
            "node_modules",
            "__pycache__",
            ".mypy_cache",
            ".pytest_cache",
            "dist",
            "build",
            "target",
        }
        for current, directories, filenames in os.walk(search_root, followlinks=False):
            directories[:] = sorted(
                name for name in directories if name not in excluded
            )
            current_path = Path(current)
            candidates = sorted(directories) + sorted(filenames)
            for basename in candidates:
                if not any(
                    fnmatch.fnmatchcase(basename.casefold(), pattern.casefold())
                    for pattern in patterns
                ):
                    continue
                path = (current_path / basename).relative_to(self.root).as_posix()
                if len(matches) == limit:
                    truncated = True
                    break
                matches.append(path)
            if truncated:
                break

        if not matches:
            return "No matching files or directories were found."
        result = "\n".join(matches)
        if truncated:
            self.truncations += 1
            result += f"\n[truncated: showing first {limit} matching paths]"
        return self._cap(result)

    def _run_shell(self, command):
        check_deadline()
        if not command.strip():
            return "Error: command must not be empty."
        if len(command) > 10_000:
            return "Error: command exceeds the 10000-character limit."
        if self.calls >= self.limits["max_tool_calls_per_task"]:
            return ("Error: tool-call budget reached. Answer with what you have "
                    "and state what is unverified.")

        self.calls += 1
        timeout = self.cfg.get("shell", {}).get("timeout_seconds", 30)
        remaining = remaining_seconds()
        if remaining is not None:
            timeout = min(timeout, remaining)
        try:
            proc = subprocess.run(
                ["/bin/bash", "-c", command],
                cwd=self.root,
                capture_output=True,
                text=True,
                timeout=timeout,
            )
        except FileNotFoundError as exc:
            return f"Error: shell executable could not be started: {exc}"
        except subprocess.TimeoutExpired as exc:
            stdout = _decode_output(exc.stdout)
            stderr = _decode_output(exc.stderr)
            partial = _format_shell_output(stdout, stderr)
            message = (
                f"Error: shell command exceeded the "
                f"{timeout:g}-second "
                "timeout."
            )
            if partial:
                message += f"\nPartial output:\n{partial}"
            return self._cap(message)

        output = _format_shell_output(proc.stdout, proc.stderr)
        if proc.returncode:
            output = f"Exit code: {proc.returncode}\n{output}".rstrip()
        elif not output:
            output = "Command completed successfully with no output."
        return self._cap(output)


def _decode_output(value):
    if value is None:
        return ""
    return value.decode(errors="replace") if isinstance(value, bytes) else value


def _format_shell_output(stdout, stderr):
    sections = []
    if stdout:
        sections.append(f"stdout:\n{stdout.rstrip()}")
    if stderr:
        sections.append(f"stderr:\n{stderr.rstrip()}")
    return "\n".join(sections)
