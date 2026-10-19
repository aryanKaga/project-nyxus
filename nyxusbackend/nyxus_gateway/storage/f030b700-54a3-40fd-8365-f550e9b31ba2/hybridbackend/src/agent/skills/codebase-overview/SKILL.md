---
name: codebase-overview
description: Explain what a repo does and how it is structured. Use for "what does this codebase do", "explain this repo", "give me an overview", or when starting on an unfamiliar repo.
requires_tools: [repo_orient, packet_get, search, deps, rdeps, read_file, digest, scratchpad]
---

## Steps

1. `repo_orient(budget="small")`. Read the summary bullets, the ranked
   `focus` targets with their reasons, the bounded tree, health counts, omitted
   counts and recommended next commands.
2. For the top 3-5 `focus` targets, call `packet_get(file, max_symbols=25)`.
3. If the structure is still unclear, call `repo_orient` again with budget
   `medium`, scoped to one subdirectory (the `paths` argument).
4. Use `search` with domain terms (for example "auth user", "payment") to find
   where the main domains live.
5. Call `deps` and `rdeps` on 2-3 key files to learn the dependency direction
   between modules.
6. Read at most 2-3 key files with `read_file` (limit 200): the top focus
   target and the main entry point.
7. Assemble the answer:
   - purpose
   - tech stack (from manifests and tree)
   - main modules and what each does
   - how modules depend on each other
   - entry points
   - where the core logic lives
8. Save a short draft as `domain_summary` in the scratchpad.

## Digest trigger

If the packets plus README exceed about 3k tokens, digest them with the
question "What is the purpose and structure of this system?".

## Output

A short overview with citations: purpose, stack, module map (role and
dependency direction), 2-3 main flows, and "where to look next".

## Pitfalls

- Do not list every file.
- Do not infer purpose from directory names alone. Confirm with one entry
  point and one high-ranked focus target.
- Small-budget health counts are cheap estimates. Say so if you report them.
