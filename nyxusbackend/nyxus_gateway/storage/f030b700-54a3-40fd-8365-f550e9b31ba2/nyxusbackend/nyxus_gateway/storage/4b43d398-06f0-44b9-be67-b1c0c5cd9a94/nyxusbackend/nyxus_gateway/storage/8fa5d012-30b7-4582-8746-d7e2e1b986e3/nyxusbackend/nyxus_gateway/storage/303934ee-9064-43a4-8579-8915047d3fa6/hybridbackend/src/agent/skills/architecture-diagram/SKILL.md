---
name: architecture-diagram
description: Create a cited HTML diagram of a repository architecture, subsystem, or requested flow.
requires_tools: [create_architecture_diagram]
---

## Steps

1. Use this skill only when the user asks for an architecture diagram,
   architecture visualization, or architectural flow chart.
2. Call `create_architecture_diagram` with the user's requested scope. Include
   whether they want the whole repository or a specific subsystem or flow.
3. The on-demand architecture analyst inspects the repository using read-only
   tools and gives evidence to the separate HTML diagram writer.
4. The generated HTML is saved in the user's workspace and opened in a
   sandboxed VS Code webview. Report that it was delivered; do not pretend it
   is complete if either specialist returns an error.
