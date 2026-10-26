# Nyxus

> **Repository Intelligence for VS Code** — understand any codebase in seconds, not hours.

Nyxus is a cloud-native agent that connects your VS Code workspace to an ephemeral Kubernetes pod running a fast, specialized AI harness. Instead of helping you autocomplete the next line, Nyxus answers deeper questions about your repository: data flows, architecture maps, tech stack analysis, symbol tracing, and cross-file connectivity — delivered as structured markdown and auto-generated diagrams, streamed directly into your editor.

---

## What it does

Ask Nyxus things like:

- *"How does data flow from the API layer to the database?"*
- *"Where would I find the authentication middleware?"*
- *"Draw me an architecture diagram of this service's dependencies"*
- *"What's the full tech stack and how are the services connected?"*
- *"Trace all places where the `user` object is mutated"*

Answers stream into an `answer.md` file inside your editor — including **Mermaid diagrams** rendered inline for flowcharts, sequence diagrams, and architecture maps.

---

## How to use it

```
1. Open any Git repository in VS Code
2. Make sure you have a .gitignore (keeps secrets out)
3. Run: git add .
4. Open Nyxus in the Activity Bar → Settings → "Stage Workspace"
5. Start chatting
```

Nyxus packages your workspace as a Git snapshot, uploads it to your personal isolated pod on the cloud backend, and streams answers back in real time. No API keys to configure, no model to choose.

> **Note:** Nyxus is currently in private testing with a limited number of users. [Request access →](https://github.com/aryanKaga/project-nyxus)

---

## Architecture

```
VS Code Extension  →  Nginx Gateway  →  K3s Kubernetes Cluster
       │                    │                      │
  git archive zip     Node.js upload         Pod per user ID
  Socket.IO stream    MongoDB GridFS         LangGraph agents
  answer.md output    Redis session cache    Gemini Flash Lite
```

Each user gets an **isolated Kubernetes pod** provisioned in under 15 seconds. Pods auto-terminate after 20 minutes idle. Your workspace is packaged using `git archive` — `.gitignore` is always respected, so secrets and build artifacts stay local.

---

## Tech stack

| Layer | Technology |
|---|---|
| Extension UI | React · Vite · VS Code Extension API |
| Gateway | Node.js · Express · Socket.IO · Nginx |
| Orchestration | K3s (lightweight Kubernetes) |
| AI Reasoning | LangGraph · Gemini Flash Lite |
| Persistence | MongoDB Atlas GridFS · Redis |
| Infrastructure | AWS EC2 · Python 3.12 |

---

## Configuration

After installation, configure Nyxus via **VS Code Settings** (`nyxusReplica.*`):

| Setting | Description | Default |
|---|---|---|
| `nyxusReplica.userId` | Your provisioned User ID (from the web portal) | — |
| `nyxusReplica.url` | Backend gateway URL | `http://54.79.152.236` |
| `nyxusReplica.uploadTimeout` | Max time (ms) for workspace upload | `300000` (5 min) |
| `nyxusReplica.enableWorkspaceSync` | Auto-sync workspace when sidebar opens | `true` |

Your User ID is assigned when you are granted access. Set it once and Nyxus handles the rest.

---

## Why not Claude Code / Copilot / Codex?

Those tools are built for **code generation**. They're powerful — and expensive — for what they do.

Nyxus solves a different problem: understanding a repository you didn't write. Navigating unfamiliar codebases, mapping data flows, and generating architecture diagrams doesn't need the most intelligent model. It needs a **fast, specialized harness** with the full repository as context.

Nyxus uses a lightweight model with fast inference, purpose-built for structural reasoning. The result is faster answers, lower cost, and diagrams — not just prose.

---

## Status

🔒 **Private testing** — currently limited to invited users while backend infrastructure and authentication are being hardened.

To request access or report issues, open an issue on [GitHub](https://github.com/aryanKaga/project-nyxus).
