from typing import TypedDict, Annotated, List, Optional

from langchain_core.messages import BaseMessage
from langgraph.graph.message import add_messages


class TraceEntry(TypedDict):
    step: int
    agent: str
    action: str
    result: str


class State(TypedDict):
    user_api:str
    prompt: str
    user_api: str
    detailed_dir: str
    high_level_dir: str
    curr_file_content: str  
    curr_file_name: str
    curr_file_context:str
    final_answer: str
    root_dir: str
    router_reasoning: str
    router_decision: str
    code_graph: str
    messages: Annotated[List[BaseMessage], add_messages]
    chat_history_summary: str

    execution_trace: List[TraceEntry]
    router_decision_history: List[str]
    auto_memmory:str


def add_trace(state: State, agent: str, action: str, result: str) -> List[TraceEntry]:
    """Append one deterministic trace entry. Call this from inside every agent's return."""
    trace = state.get("execution_trace", [])
    entry: TraceEntry = {
        "step": len(trace) + 1,
        "agent": agent,
        "action": action,
        "result": result,
    }
    return trace + [entry]