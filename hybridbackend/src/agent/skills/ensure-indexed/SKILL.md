---
name: ensure-indexed
description: Check that codegraph can analyze a repo before other work. Use at the start of a session on a repo, after an upgrade, or when results look stale or broken.
requires_tools: [repo_orient, doctor, scratchpad]
---

## Steps

1. There is no required index step. Each codegraph call validates the
   persisted index itself, and the first query on a repo may build it. This can
   take a while on large repos.
2. The repo root is fixed by the runtime, so you never pass it to tools. If the user
   mentions a different repo, tell them this session is tied to one repo root.
3. Run `repo_orient(budget="small")` as the readiness check. Success
   means the repo is ready.
4. If results are cluttered by fixtures, generated or vendored folders, tell the
   user that a `codegraph.config.json` with `discovery.ignoreGlobs` keeps them
   out of results. Do not create it yourself.
5. If a call fails with a package or runtime error, run `doctor` once and
   report what it says. Do not retry the same failing call in a loop.
6. If you are on an MCP transport and results look stale after file changes,
   call the MCP `refresh_index` tool if it is available. It refreshes repo
   analysis state only.
7. Save readiness (`ready: true`) and any noise warnings to the scratchpad.

## Output

Ready or not ready, and any omitted-item or limit notes from the
first `repo_orient`.

## Pitfalls

- Do not run build, index or sync commands as a precondition. They are not needed.
- Do not treat the small-budget health counts (cycles, unresolved imports,
  duplicates) as complete.
