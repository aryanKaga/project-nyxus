## Architecture

Nyxus uses a multi-agent architecture built with LangGraph. The router decides which specialized worker should execute next, while the workers return to the summarizer before routing again.

```mermaid
flowchart TD

    START([User Request]) --> MS[Message Summarizer]

    MS --> R[Router Agent]

    R -->|Analyze file| FA[File Analyzing Agent]
    R -->|Create context| CC[Context Creating Agent]
    R -->|Fix bug| BF[Bug Fixing Agent]
    R -->|Complete| FIN[Finish Agent]

    FA --> MS
    CC --> MS
    BF --> MS

    FIN --> END([Final Response])

    CC -.-> MCP[MCP Server]
    MCP -.-> DB[(MongoDB)]
    MCP -.-> IDE[VS Code Extension]

    IDE -.-> MCP
```

### LangGraph Workflow

The core agent workflow is implemented using `StateGraph`:

```mermaid
flowchart LR

    S([START]) --> MS[message_summarizer]

    MS --> R[router_agent]

    R -->|file_analyzing_agent| FA[file_analyzing_agent]
    R -->|context_creating_agent| CC[context_creating_agent]
    R -->|bug_fixing_agent| BF[bug_fixing_agent]
    R -->|finish_agent| F[finish_agent]

    FA --> MS
    CC --> MS
    BF --> MS

    F --> E([END])
```

### Agent Responsibilities

| Agent | Responsibility |
|---|---|
| `message_summarizer` | Summarizes the current conversation and accumulated agent state |
| `router_agent` | Decides which worker should execute next |
| `file_analyzing_agent` | Analyzes repository files and determines relevant files |
| `context_creating_agent` | Builds detailed semantic context for selected files |
| `bug_fixing_agent` | Analyzes and fixes identified issues |
| `finish_agent` | Generates the final response to the user |

### Router Flow

The router can select one of four paths:

```mermaid
flowchart TD

    R[Router Agent]

    R --> A[File Analyzing Agent]
    R --> C[Context Creating Agent]
    R --> B[Bug Fixing Agent]
    R --> F[Finish Agent]

    A --> S[Message Summarizer]
    C --> S
    B --> S

    S --> R
```

This creates an iterative agent loop:

**Summarize → Route → Execute Worker → Summarize → Route → ... → Finish**

A maximum of `20` router iterations is enforced to prevent infinite agent loops.