# Codegraph exploration agent: Phase 1

Read-only codebase exploration on top of
[lzehrung/codegraph](https://github.com/lzehrung/codegraph).

## Layout

```
agent/
├── config.yaml              # phase, enabled skills/tools, limits, codegraph version
├── skills_loader.py         # loads skills, builds system prompt, serves use_skill
├── check.py                 # sanity check (no codegraph call)
├── skills/
│   ├── base.md              # always in system prompt: rules, output format, digestor
│   ├── ensure-indexed/SKILL.md
│   ├── codebase-overview/SKILL.md
│   ├── locate-and-explain/SKILL.md
│   └── trace-flow/SKILL.md
├── tools/
│   ├── schemas.json         # tool allowlist: descriptions, args, CLI mapping
│   └── codegraph_wrapper.py # runs codegraph safely, enforces budgets and caps
├── digestor/prompt.md       # system prompt for the cheap summarizer model
└── evals/cases.yaml         # repos + questions to test against
```

## Wiring

```python
from skills_loader import SkillRegistry
from tools.codegraph_wrapper import ToolRuntime

skills = SkillRegistry()
rt = ToolRuntime(root="/path/to/repo", skills=skills, llm_call=cheap_model)

system_prompt = skills.system_prompt()   # base.md + generated skill index
tools = rt.tool_definitions()            # register with your LLM
# in your agent loop, for each tool call the model makes:
result_text = rt.call(tool_name, tool_args)
# call rt.reset_budget() at the start of each new user task
```

Agent asset paths default to this `src/agent` directory, and the repository
root defaults to the parent project directory. Relative paths supplied to
`SkillRegistry` or `ToolRuntime` are resolved from the current working
directory; pass an explicit `root` when analyzing a different repository.

Run `python src/agent/check.py` from the project directory, or
`python check.py` from `src/agent` (needs `pip install pyyaml`), after any
change to skills, schemas or config. An optional first argument sets the
repository root, for example `python src/agent/check.py /path/to/repo`.

## Before you rely on it

1. Install codegraph, pin its version in `config.yaml`.
2. Verify the entries in `schemas.json` that have a `verify` field
   (`refs`, `callers`, `goto`, `deps`, `rdeps`, `grep`) with
   `codegraph help advanced`. Add flags or `--json` where supported.
3. This wrapper uses the CLI. If you switch to MCP, keep the same tool names
   and replace `_run`.
4. Run the cases in `evals/cases.yaml` and read the tool-call logs.

## Later phases (not loaded)

| Phase | Adds | Codegraph commands |
|---|---|---|
| 2 | `impact-analysis`, `find-gaps` | `impact`, `review`, `drift`, `duplicates`, health counts |
| 3 | refactor support | `refactor-plan`, `rename-preview` (read-only) |
| 4 | fingerprints, similar-repo search, comparison, recommendations | your own layer over codegraph facts |

To add a phase: create the skill folders, add the tools to `schemas.json`,
then list them in `config.yaml`.

## Agent loop

The LangGraph loop is implemented in `agent_loop.py`. It keeps complete
conversation history in the graph checkpoint, calls every tool via
`ToolRuntime.call`, and builds a compacted/stubbed model view in `context.py`.
The in-memory checkpointer is the default; set `checkpoint.backend: sqlite` to
persist threads in the SQLite file named by `checkpoint.sqlite_path`.

Repository filename searches can use the bounded `find_files` tool
(comma-separated basename globs such as `*harness*,*eval*`). The `run_shell`
tool is enabled and executes commands with the selected workspace as its
working directory. Shell commands can modify files and are **not sandboxed**:
they run with the backend process's permissions and can access paths outside
the workspace. Use only with trusted users and workspaces. Commands share the
tool-call budget, time out after `shell.timeout_seconds`, and have output
capped by `limits.tool_output_tokens`. Content and structural searches can
continue to use the codegraph tools.

### Setup

Use Python 3.11 or newer:

```bash
python3.11 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
```

Install the codegraph CLI separately, then set `codegraph.version` to the
version you installed. The agent uses the project Gemini provider configured in `config.yaml` with
`gemini-3.5-flash-lite` for both answering and digesting. It loads
`hybridbackend/.env` and reads `GOOGLE_API_KEY`; the same key may also be
provided in the process environment. The Gemini provider uses the pinned
`google-genai` SDK to handle chat messages and tool calls. Update the
`model.name` and `digest_model.name` settings to change models.

Review `config.yaml` before running:

* `model` and `digest_model` select separate provider/model pairs.
* `limits.max_steps` becomes LangGraph's `recursion_limit`; tool-call,
  `read_file`, output, and timeout limits remain enforced by `ToolRuntime`.
* The server enforces a 300-second total chat deadline by default
  (`NYXUS_CHAT_TIMEOUT_SECONDS` overrides it); Gemini API calls are capped at
  60 seconds (`model.request_timeout_seconds` and
  `digest_model.request_timeout_seconds`). Codegraph and shell subprocesses
  are capped by whichever is shorter: their own configured timeout or the
  remaining chat deadline. Timed-out requests return a visible timeout error.
  LLM rate-limit responses wait 35 seconds before retrying, up to three times,
  subject to the remaining chat deadline.
* `context.window_tokens` and `compact_fraction` set the approximate
  compaction threshold. `recent_tool_results` and `keep_last_messages`
  configure result stubs and the verbatim tail.
* `observability.langsmith.enabled` opts into a local LangSmith server at
  `http://127.0.0.1:1984` by default. Set `LANGSMITH_API_KEY` to the key for
  that local instance; the project defaults to `nyxus-local` and can be
  overridden in config. Non-local LangSmith endpoints are rejected so traces
  cannot be sent to LangSmith Cloud from this setup.
* `observability.langfuse.enabled` is a separate opt-in switch and is off by
  default.
* `observability.local_trace.enabled` keeps a bounded JSON trace locally under
  `hybridbackend/.nyxus/traces/` by default; change `directory` to relocate it.
  Each file is restricted to the current user and atomically updated. Set
  `observability.hide_inputs_outputs` to mask prompts, source, and outputs in
  both local and remote-backend traces.
* `observability.hide_inputs_outputs` suppresses LangSmith inputs/outputs and
  configures Langfuse span-attribute masking for source-bearing content.

### Run

From this directory:

```bash
python cli.py --repo /path/to/repo
python cli.py --repo /path/to/repo --question "What does this repo do?"
```

Pass `--thread-id` with SQLite checkpoints to resume a conversation. The CLI
prints the final answer and per-task tool, `read_file`, truncation, and peak
context-estimate counts. `python check.py /path/to/repo` validates the loaded
skills and allowlist without invoking codegraph.

The Flask-SocketIO backend serves the same graph for the VS Code chat. From
the `hybridbackend` directory, run `python server.py` with Python 3.11+, the
dependencies installed, `NYXUS_API_KEY` configured to match the extension,
and the model provider's API key set. After a `workspace_archive` upload, the
`chat` event runs against that uploaded workspace; responses use the existing
`assistant_start`, `assistant_chunk`, `assistant_end`, and `assistant_error`
events. Each connected workspace gets a checkpointed conversation thread.
Clients may set `readme_mode: true` on a `chat` event to format the completed
answer through the dedicated README-writer prompt. The server persists and
streams that Markdown answer and emits `readme_answer` with the `answer.md`
filename for the VS Code extension to save and preview in the active workspace.

### MongoDB workspace and conversation persistence

The server loads MongoDB connection settings from
`hybridbackend/atlas-credentials.env` (or the process environment):

```dotenv
MONGODB_URI=your-atlas-srv-uri
MONGODB_USERNAME=your-database-user
MONGODB_PASSWORD=your-database-password
MONGODB_DATABASE=nyxus
```

Install dependencies from `requirements.txt` after configuring the Atlas
credentials. Nyxus sends the workspace archive once; the server stores the
archive in MongoDB GridFS and returns its `workspace_id`. Nyxus saves that ID
in VS Code extension state scoped to the open folder. On reconnect it sends the
ID to `workspace_resume`; the backend verifies ownership, restores the archive
to `workspaces/<workspace_id>` through the ingestion archive loader, and
returns the saved conversation. Each completed user/assistant turn is stored
in MongoDB and is restored into the agent context when resuming.
Locally extracted workspace folders are removed after five minutes without
server activity (checked every 30 seconds); active chat jobs are protected.
Their MongoDB archives remain available for restoration.

Workspace access is scoped to a SHA-256 digest of the configured Nyxus API
key; the API key itself is not stored in MongoDB. The archive contains the
workspace files Nyxus can read, except excluded dependency/build directories.
Protect the Atlas credentials and database as they contain source code and
conversation content. `atlas-credentials.env` is git-ignored.

Run evaluations after replacing the example paths and placeholders in
`evals/cases.yaml`:

```bash
python evals/run_evals.py --json evals/results.json
```

The runner prints a per-case summary and writes the full answer and metrics as
JSON. Enabled traces include an `eval_id:<case>` tag.

### Architecture diagrams

When a user explicitly asks for an architecture diagram, the main agent can
call `create_architecture_diagram`. This lazily runs two specialist roles: an
architecture analyst that inspects the requested repository scope with
read-only codegraph and filename-search tools, followed by an HTML diagram
writer that turns the evidence into a standalone HTML block diagram. It uses a
framed rose-tinted canvas, distinct pastel component cards, and labeled
directional connectors. The extension saves it under
`.nyxus/architecture-diagrams/` and immediately renders it in a sandboxed VS
Code webview preview. The analyst shares the main agent's query budgets; it
does not receive the shell tool.

### Tracing

For Langfuse, enable `observability.langfuse.enabled` and set
`LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, and (if needed)
`LANGFUSE_BASE_URL`. For LangSmith, enable `observability.langsmith.enabled`
and set `LANGSMITH_API_KEY` and `LANGSMITH_PROJECT`. Set hide-input/output in
config when code and source snippets must not be stored in traces. Each backend
can be enabled without the other; enabling both logs a duplicate-tracing
warning.

The graph invocation attaches `repo_id`, `phase`, `skill`, `thread_id`, and
`codegraph_version` as run tags and metadata. Tracing does not participate in
tool dispatch or answer generation.

### Tests

From the project root, with the dependencies installed:

```bash
pytest src/agent/tests
```

The fake-model graph tests do not call a provider or require codegraph.
