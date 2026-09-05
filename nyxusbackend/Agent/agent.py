from langgraph.graph import StateGraph, START, END

from Agent.state import State

from Agent.worker_agents.message_summarizer_agent import message_summarizer
from Agent.worker_agents.router_agent import router_agent
from Agent.worker_agents.file_analzying_agent import file_analyzing_agent
from Agent.worker_agents.context_creating_agent import context_creating_agent
from Agent.worker_agents.bug_fixing_agent import bug_fixing_agent
from Agent.worker_agents.finish_agent import finish_agent
from Agent.worker_agents.git_agent.codebase_agent import build_graph,PlannerState
import json
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




async def codebase_context_node(state: State) -> State:
    present_auto_memmory = state.get('auto_memmory')
    if present_auto_memmory == None or present_auto_memmory == state.get('auto_memmory'):
        return {}
    
    
    planner_state = PlannerState(
        user_id=state["user_api"],
        code_graph=state["code_graph"],
        directory_structure=state["detailed_dir"],
        iterations=0,
    )

    agent_graph = await build_graph()

    result = await agent_graph.ainvoke(planner_state)
    print(' I am done with codebase agent')
    def serialize_msg(msg):
        return{
            "type":msg.type,
            "content":msg.content
        }

    print(result['response'])
    return state

def create_graph():

    builder = StateGraph(State)

    # -------------------------------------------------
    # Nodes
    # -------------------------------------------------

    builder.add_node("codebase_agent", codebase_context_node)

    builder.add_node("message_summarizer", message_summarizer)
    builder.add_node("router_agent", router_agent)

    builder.add_node("file_analyzing_agent", file_analyzing_agent)
    builder.add_node("context_creating_agent", context_creating_agent)
    builder.add_node("bug_fixing_agent", bug_fixing_agent)

    builder.add_node("finish_agent", finish_agent)

    # -------------------------------------------------
    # PARALLEL START
    # -------------------------------------------------

    builder.add_edge(START, "codebase_agent")
    builder.add_edge(START, "message_summarizer")

    # -------------------------------------------------
    # Main workflow
    # -------------------------------------------------

    builder.add_edge(
        "message_summarizer",
        "router_agent"
    )

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
    # Workers -> summarizer
    # -------------------------------------------------

    builder.add_edge(
        "file_analyzing_agent",
        "message_summarizer"
    )

    builder.add_edge(
        "context_creating_agent",
        "message_summarizer"
    )

    builder.add_edge(
        "bug_fixing_agent",
        "message_summarizer"
    )

    # -------------------------------------------------
    # Finish
    # -------------------------------------------------

    builder.add_edge("finish_agent", END)

    # Codebase branch finishes independently
    builder.add_edge("codebase_agent", END)

    return builder.compile()