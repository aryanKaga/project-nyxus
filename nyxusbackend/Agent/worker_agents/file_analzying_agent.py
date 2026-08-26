from langchain_core.messages import AIMessage
from langchain_ollama import ChatOllama
from Agent.state import State, add_trace
from pydantic import BaseModel, Field

from langchain_google_genai import ChatGoogleGenerativeAI

# FIX: schema now covers everything the prompt asks the model to reason
# about (primary file, optional secondary files, confidence, notes) instead
# of just {file_name, reasoning}. Previously the prompt told the model to
# respond in a free-text "Primary File: <path> — <reason>" format while
# with_structured_output forced a totally different {file_name, reasoning}
# JSON shape. The model tried to satisfy both at once and often stuffed the
# whole "Primary File: path — because X" line into `file_name`, which is
# why the wrong / malformed file name kept showing up downstream.
class file_analysis(BaseModel):
    file_name: str = Field(description="The exact file name only (e.g. 'agent.py'), with no directory path, no extra text, labels, or reasoning.")
    secondary_files: list[str] = Field(default_factory=list, description="Other relevant file names, if any. Empty list if none.")
    confidence: str = Field(description="One of: High, Medium, Low")
    reasoning: str = Field(description="Why this file was selected, referencing the code graph and request.")


# NOTE: gemini-2.5-flash is no longer available to new users (404 NOT_FOUND).
# Migrated to gemini-2.5-flash-lite.
llm = ChatGoogleGenerativeAI(
    model="gemini-3.5-flash-lite",
    temperature=0,
)

file_analyzer = llm.with_structured_output(file_analysis)


def file_analyzing_agent(state: State) -> dict:

    code_graph = state.get("code_graph", "")

    # FIX: prompt now asks directly for the structured fields instead of a
    # separate "Primary File: <path> — <reason>" text format that the
    # schema didn't actually match.
    prompt = f"""
You are a File Router.

Using the code graph, the user's request, and the conversation history, select the next file to inspect.

Guidelines:
- Extract key entities (functions, classes, errors, features).
- Match them to the graph and traverse up to 2 dependency hops.
- Prefer files already in progress.
- Ignore completed files unless the task is reopened.
- Rank by relevance and dependency impact.
- Never invent file names or return unnecessary files.

Return:
- file_name: the exact file name only (no directory path) of the single most relevant file, with no extra labels or commentary in this field.
- confidence: High, Medium, or Low.
- reasoning: your justification, including assumptions or a clarifying question if needed.

Code Graph:
{code_graph}
History:
{state.get("chat_history_summary", "No summary available.")}
Execution Trace:
{state.get('execution_trace','no execution trace yet')}
Router Reasoning:
{state.get('router_reasoning','no router reasoning yet')}
"""

    result = file_analyzer.invoke(prompt)
    print('agent at file_analyzing_agent selected file:', result.file_name)
    print('chat history:' ,state.get('chat_history_summary'))
    return {
        "curr_file_name": result.file_name,
        "execution_trace": add_trace(
            state,
            agent="file_analyzing_agent",
            action=f"selected {result.file_name}",
            result=f"confidence: {result.confidence}",
        ),
        "messages": [AIMessage(content=f"File selected for analysis: {result.file_name} (confidence: {result.confidence}) and reasoning: {result.reasoning})")]
    }