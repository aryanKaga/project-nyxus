# Nyxus Developer Portal & Workflow Guide

A monochromatic, black & white website and interactive guide for **Nyxus: Autonomous Coding Agent & Cloud-Native Workspace Engine**.

## Features & Content

- **Black & White Minimalist Aesthetic**: OLED pitch black (`#000000`), stark white accents, subtle grid background, and glassmorphic panels.
- **Complete 4-Step Getting Started Workflow**:
  1. **Download & Install from VS Code**: Marketplace installation (`Ctrl+Shift+X` &rarr; `Nyxus`), CLI command (`code --install-extension aryanKaga.nyxus-coding-agent-replica`), and direct deep-link launcher.
  2. **Create a Clean `.gitignore`**: Explains why `.gitignore` is critical (prevents `node_modules/`, `.venv/`, and `.env` secrets from leaking to cloud pods), with copyable templates for Full Stack, Node.js, and Python.
  3. **Stage Changes with `git add .`**: Detailed explanation of why Git staging is required for Nyxus to capture your working tree snapshot.
  4. **Stage the Workspace**: Open the Nyxus sidebar in VS Code, click **"Stage Workspace"**, and watch the Kubernetes ephemeral pod spin up.
  5. **Ask Questions & Dual Streaming**: Real-time markdown answers streamed simultaneously to the sidebar webview and auto-updated `answer.md`.
- **Interactive Telemetry Simulator**: Live terminal preview illustrating local Git packaging, Ingress Gateway upload (`POST /upload`), K3s pod orchestration, and WebSocket streaming.
- **Architecture Overview**: Deep dive into the 4-tier decoupled system (VS Code Extension &rarr; Ingress Gateway &rarr; Persistence Mesh &rarr; Ephemeral LangGraph Pods).

## Running Locally

```bash
cd website
npm install
npm run dev
```

Visit **http://localhost:5173/**.
