from langgraph.graph import StateGraph, START, END

from Agent.state import State

from Agent.worker_agents.message_summarizer_agent import message_summarizer
from Agent.worker_agents.router_agent import router_agent
from Agent.worker_agents.file_analzying_agent import file_analyzing_agent
from Agent.worker_agents.context_creating_agent import context_creating_agent
from Agent.worker_agents.bug_fixing_agent import bug_fixing_agent
from Agent.worker_agents.finish_agent import finish_agent


MAX_ROUTER_ITERATIONS = 20


def router_condition(state: State):
    """
    Decides which node LangGraph should execute next.

    router_agent is responsible for setting:
        state["router_decision"]

    Valid values:
        file_analyzing_agent
        context_creating_agent
        bug_fixing_agent
        finish_agent
    """

    iterations = state.get("router_iterations", 0)

    # Safety stop
    if iterations >= MAX_ROUTER_ITERATIONS:
        return "finish_agent"

    decision = state.get("router_decision", "finish_agent")

    valid_routes = {
        "file_analyzing_agent",
        "context_creating_agent",
        "bug_fixing_agent",
        "finish_agent",
    }

    if decision not in valid_routes:
        print(f"[WARNING] Invalid router decision: {decision}")
        return "finish_agent"

    return decision


def create_graph():

    builder = StateGraph(State)

    # -------------------------------------------------
    # Nodes
    # -------------------------------------------------

    builder.add_node("message_summarizer", message_summarizer)
    builder.add_node("router_agent", router_agent)

    builder.add_node("file_analyzing_agent", file_analyzing_agent)
    builder.add_node("context_creating_agent", context_creating_agent)
    builder.add_node("bug_fixing_agent", bug_fixing_agent)

    builder.add_node("finish_agent", finish_agent)

    # -------------------------------------------------
    # Initial Flow
    # -------------------------------------------------

    builder.add_edge(START, "message_summarizer")
    builder.add_edge("message_summarizer", "router_agent")

    # -------------------------------------------------
    # Router
    # -------------------------------------------------

    builder.add_conditional_edges(
        "router_agent",
        router_condition,
        {
            "file_analyzing_agent": "file_analyzing_agent",
            "context_creating_agent": "context_creating_agent",
            "bug_fixing_agent": "bug_fixing_agent",
            "finish_agent": "finish_agent",
        },
    )

    # -------------------------------------------------
    # Every worker returns to the summarizer
    # -------------------------------------------------

    builder.add_edge("file_analyzing_agent", "message_summarizer")
    builder.add_edge("context_creating_agent", "message_summarizer")
    builder.add_edge("bug_fixing_agent", "message_summarizer")

    # -------------------------------------------------
    # Finish
    # -------------------------------------------------

    builder.add_edge("finish_agent", END)

    return builder.compile()