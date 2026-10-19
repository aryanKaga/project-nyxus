---
name: locate-and-explain
description: Find where something is implemented, explain what it does, or find who uses it. Use for "where is X handled", "how does Y work", "what does this function do", "who calls Z".
requires_tools: [find_files, search, find_symbol, explain, refs, callers, goto, read_file, grep, digest, scratchpad]
---

## Steps

1. Choose the entry tool by what the user gave you:
   - a filename or directory name/glob: `find_files(pattern)`.
   - a concept or description: `search(query)`. Use mode `symbol` for
     symbol-like terms, mode `text` when docs or prose should rank higher.
   - an exact or likely symbol name: `find_symbol(name)`. Narrow with `kind`,
     `exported`, `file_glob`.
   - an exact string, log message or config key: `grep(pattern)`.
2. Pick the best 1-3 hits and keep their handles.
3. `explain(target=handle)` for bounded context: dependencies, references,
   snippets and follow-ups.
4. For usage questions, call `refs(target=handle)` and `callers(target=handle)`.
   Prefer these over `explore` for a known symbol.
5. Read the source of the 1-2 nodes that decide the answer with `read_file`
   (offset and limit).
6. If the question spans several steps, switch to the `trace-flow` skill.
7. Answer with citations and state what was omitted or limited.

## Digest trigger

If the explanation needs more than 5 nodes or files, digest them with the
user's exact question.

## Output

Direct answer first, then "where to look" as a short list of `file:line`
references and the handles used.

## Pitfalls

- Do not answer from search snippets alone when behavior matters; read the code.
- If `search` returns many near-duplicates, narrow with `file_glob` or `kind`
  instead of paging through them.
- For ambiguous names, pass the handle, not the bare name.
- Caller and reference lists can be incomplete for method calls in some
  languages. Cross-check with `grep` when the answer depends on completeness.
