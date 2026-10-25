# Architecture Demo Guide & Cheat Sheet

Preparing to present or demo this multi-agent architecture? Use this clear, structured guide to deliver a punchy narrative and walk your audience through the key technical layers with confidence.

---

## 🚀 30-Second Elevator Pitch

> *"This is a real-time, multi-agent AI backend engine built in Python using Flask-SocketIO and LangGraph. It ingests an entire repository's structure and code graph, then uses a coordinated team of specialized AI agents—routers, code analyzers, context builders, and bug fixers—to reason through complex coding tasks and stream responses back over WebSockets."*

---

## 🗺️ The Architecture Cheat Sheet (Step-by-Step)

Walk your audience through the system pipeline using these four key layers:

| Step | Layer / Component | What to Say During the Demo |
| :--- | :--- | :--- |
| **1** | **The Ingestion Layer**<br>`server.py` & Sockets | *"Clients (like an IDE plugin or web UI) connect via WebSockets. They push workspace file trees and code graphs into the backend, establishing a live, stateful session."* |
| **2** | **The Concurrency Bridge**<br>Async & Thread Pools | *"Incoming user prompts are offloaded to a bounded thread pool and bridged into a dedicated asyncio event loop (`async_loop`), allowing the server to handle concurrent agent tasks without blocking."* |
| **3** | **The Multi-Agent Brain**<br>`Agent/` & LangGraph | *"Instead of relying on a single prompt, we compile a LangGraph state machine. It routes the task to specialized nodes: a Planner, File Analyzers, Context Creators, and Bug Fixers that collaborate to solve the developer's problem."* |
| **4** | **The Real-Time Feedback Loop**<br>Socket.IO Rooms | *"As agents execute, results are piped right back through Socket.IO rooms, delivering real-time answers and actions back to the developer's client."* |

---

## 💡 Next Steps

If you need help prepping for potential technical questions during your presentation, we can dive deeper into any specific part of the codebase, such as:
* The LangGraph state machine and graph setup
* The WebSocket socket handlers
* The implementation of a specific agent node