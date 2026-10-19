---
name: trace-flow
description: Trace how a request or action moves through the code. Use for "what happens when a user does X", "how does the API reach the database", "how does A get to B".
requires_tools: [search, find_symbol, explain, callers, deps, explore, read_file, grep, digest, scratchpad]
---

## Steps

1. Find the start with `search` (route or action name) or `find_symbol` if the
   handler name is known. Keep the handle.
2. If the end is known (database layer, external API, queue), try one bounded
   question first: `explore("how does <start> reach <end>?")`. Use the returned
   anchors, paths and follow-ups as the skeleton of the flow.
3. Walk the flow one hop at a time:
   - `explain(target=handle)` for what the current node depends on and references
   - `search(query, mode="graph", from_file=<file>, depth=1)` for graph
     neighbors of the current file
   - `callers(target=handle)` to confirm direction when unsure
   - `deps(file)` for file-level hops
4. Read source only at branching points or where behavior is unclear.
5. Stop at the boundary (database, network, filesystem, queue) or after about
   8 hops. Never walk everything reachable.
6. Present an ordered list: step, node, `file:line`, what happens, and side
   effects (writes, events, external calls).

## Digest trigger

If the trail has more than 12 hops or several plausible branches, digest the
collected packets with the question "What is the main path and where does it
branch?".

## Output

Ordered flow with citations, notes on branches not followed, and a list of
points where the trail went cold.

## Pitfalls

- Dynamic dispatch, callbacks, event buses, DI containers and reflection break
  static edges. If the trail goes cold, say so, then `grep` for event or
  handler names to bridge the gap.
- `explore` does not prove behavior. Confirm each step by reading the node.
- There is no dedicated callee listing tool in this phase. Use `explain` and
  graph-mode `search` for outgoing edges.
