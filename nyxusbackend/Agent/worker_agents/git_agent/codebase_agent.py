import asyncio
import time
import json
from typing import Annotated, List, Literal, TypedDict, Union

from langchain_core.messages import AIMessage, BaseMessage, HumanMessage, SystemMessage, ToolMessage
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_mcp_adapters.client import MultiServerMCPClient
from langgraph.graph import END, START, StateGraph
from langgraph.graph.message import add_messages
from pydantic import BaseModel, Field
from Agent.state import State, add_trace, TraceEntry
from Agent.worker_agents.git_agent.git_agent_docs import git_agent_docs
import server_socket

MAX_TOOL_ITERATIONS = 30
MAX_STRUCTURED_OUTPUT_RETRIES = 3


# ---------- Schemas ----------

class PlanStep(BaseModel):
    id: int
    description: str
    agent: str


class Plan(BaseModel):
    """Plan to follow by the working agents to achieve the goal."""
    action_type: Literal["plan"] = "plan"
    steps: List[str] = Field(default_factory=list, description="List of steps in the plan")


class Response(BaseModel):
    """Final response once the plan is fully executed."""
    action_type: Literal["response"] = "response"
    response: str = Field(default="", description="Final response to return to the user")


class ReplannerOutput(BaseModel):
    """Either an updated plan, or a final response — never both."""
    action: Union[Plan, Response] = Field(discriminator="action_type")


class PlannerState(TypedDict):
    user_id: str
    description: str
    past_steps: Annotated[List[BaseMessage], add_messages]
    plan: List[str]
    response: str
    code_graph: str
    directory_structure: str
    execution_trace: List[TraceEntry]


# ---------- Prompts ----------
# NOTE: Update git_agent_docs['replanner_prompt'] to explicitly state:
#   Set "action_type" to EXACTLY "plan" or "response" — no other value is valid
#   (not "update_plan", "continue", "done", etc). Include "steps" when action_type
#   is "plan", or "response" when action_type is "response".

PLANNER_PROMPT = git_agent_docs['planner_prompt']
EXECUTOR_PROMPT = git_agent_docs['executor_prompt']
REPLANNER_PROMPT = git_agent_docs['replanner_prompt']


# ---------- Helper: emit final result to the user's room ----------

def emit_final_response(user_id: str, response_text: str) -> None:
    """Notify the connected VS Code extension / client that the run is complete."""
    try:
        server_socket.socketio.emit(
            "codebase_agent_complete",
            {"response": response_text},
            room=user_id,
        )
    except Exception as e:
        print(f"error emitting final response for user {user_id}: {e}")


# ---------- Helper: retry structured-output calls with feedback ----------

async def invoke_with_retry(structured_llm, messages: List[BaseMessage], trace: list, agent_name: str):
    """
    Calls a structured-output LLM, retrying on validation failure by feeding the
    error back to the model. Returns (result, updated_trace). result is None if
    every attempt failed.
    """
    last_error = None
    working_messages = list(messages)

    for attempt in range(MAX_STRUCTURED_OUTPUT_RETRIES):
        try:
            result = await structured_llm.ainvoke(working_messages)
            return result, trace
        except Exception as e:
            last_error = e
            trace = add_trace(
                {"execution_trace": trace}, agent_name, f"invalid_output_attempt_{attempt}", str(e)
            )
            working_messages.append(
                HumanMessage(content=f"Your previous output was invalid: {e}\nPlease correct it and try again.")
            )
            if attempt < MAX_STRUCTURED_OUTPUT_RETRIES - 1:
                await asyncio.sleep(5)  # was time.sleep(5) — blocks the whole event loop in async code
            else:
                print(f"error in {agent_name}: exhausted retries on structured output: {e}")

    trace = add_trace({"execution_trace": trace}, agent_name, "error", str(last_error))
    return None, trace


# ---------- Graph construction ----------

async def build_graph():
    print('starting the codebase agent')
    llm = ChatGoogleGenerativeAI(model="gemini-3.5-flash-lite", temperature=0)

    mcp_client = MultiServerMCPClient(
        {"nyxus": {"transport": "streamable_http", "url": "http://127.0.0.1:8000/mcp"}}
    )
    tools = await mcp_client.get_tools()
    tools_by_name = {t.name: t for t in tools}

    planner_llm = llm.with_structured_output(Plan)
    executor_tool_llm = llm.bind_tools(tools)
    replanner_llm = llm.with_structured_output(ReplannerOutput)

    async def planner_node(state: PlannerState) -> dict:
        start = time.monotonic()
        trace = list(state.get("execution_trace", []))

        user_content = f"""Directory structure of the repo is {json.dumps(state.get('directory_structure'))}

            and the code graph is {json.dumps(state.get('code_graph'))}
        """

        trace = add_trace({"execution_trace": trace}, "planner", "start", state.get("description", ""))

        messages = [SystemMessage(content=PLANNER_PROMPT), HumanMessage(content=user_content)]
        result, trace = await invoke_with_retry(planner_llm, messages, trace, "planner")

        if result is None:
            print("error in planner_node: exhausted retries on structured output")
            return {"execution_trace": trace}

        for step in result.steps:
            print(f"Planned step: {step}")

        trace = add_trace(
            {"execution_trace": trace}, "planner", "end",
            json.dumps({"steps": result.steps, "duration_ms": round((time.monotonic() - start) * 1000)})
        )

        return {"plan": result.steps, "execution_trace": trace}

    async def executor_node(state: PlannerState) -> dict:
        plan = state.get("plan", [])
        if not plan:
            return {}

        task = plan[0]
        user_id = state.get("user_id")
        start = time.monotonic()
        trace = list(state.get("execution_trace", []))

        trace = add_trace({"execution_trace": trace}, "executor", "start", task)

        messages: List[BaseMessage] = [
            SystemMessage(content=EXECUTOR_PROMPT),
            HumanMessage(content=task),
        ]
        try:
            for iteration in range(MAX_TOOL_ITERATIONS):
                ai_msg = await executor_tool_llm.ainvoke(messages)
                messages.append(ai_msg)

                if not ai_msg.tool_calls:
                    break

                for call in ai_msg.tool_calls:
                    tool_name = call["name"]
                    tool_args = dict(call["args"])

                    if tool_name == "get_file_data":
                        tool_args["api_key"] = user_id

                    tool = tools_by_name.get(tool_name)
                    tool_start = time.monotonic()

                    if tool is None:
                        result = f"Error: unknown tool '{tool_name}'"
                        trace = add_trace(
                            {"execution_trace": trace}, "executor", f"tool_call_error:{tool_name}",
                            "unknown tool"
                        )
                    else:
                        try:
                            result = await tool.ainvoke(tool_args)
                            trace = add_trace(
                                {"execution_trace": trace}, "executor", f"tool_call:{tool_name}",
                                json.dumps({
                                    "args": tool_args,
                                    "iteration": iteration,
                                    "duration_ms": round((time.monotonic() - tool_start) * 1000),
                                    "result_preview": str(result)[:300],
                                })
                            )
                        except Exception as e:
                            result = f"Error calling {tool_name}: {e}"
                            trace = add_trace(
                                {"execution_trace": trace}, "executor", f"tool_call_error:{tool_name}", str(e)
                            )

                    messages.append(ToolMessage(content=str(result), tool_call_id=call["id"]))

            else:
                messages.append(
                    AIMessage(content=f"[stopped after {MAX_TOOL_ITERATIONS} tool iterations]")
                )
                trace = add_trace(
                    {"execution_trace": trace}, "executor", "max_iterations", f"limit={MAX_TOOL_ITERATIONS}"
                )

            final_ai_msg = messages[-1]

            trace = add_trace(
                {"execution_trace": trace}, "executor", "end",
                json.dumps({
                    "duration_ms": round((time.monotonic() - start) * 1000),
                    "result_preview": str(getattr(final_ai_msg, "content", ""))[:300],
                })
            )

            return {
                "plan": plan[1:],
                "past_steps": [HumanMessage(content=task), final_ai_msg],
                "execution_trace": trace,
            }
        except Exception as e:
            trace = add_trace({"execution_trace": trace}, "executor", "error", str(e))
            print(f"error in executor_node: {e}")
            return {"execution_trace": trace}

    async def replanner_node(state: PlannerState) -> dict:
        start = time.monotonic()
        trace = list(state.get("execution_trace", []))

        trace = add_trace(
            {"execution_trace": trace}, "replanner", "start",
            json.dumps({
                "remaining_plan": state.get("plan"),
                "completed_step_count": len(state.get("past_steps", [])),
            })
        )

        messages = [
            SystemMessage(content=REPLANNER_PROMPT),
            HumanMessage(
                content=(
                    f"Completed steps: {state['past_steps']}\n"
                    f"Remaining plan: {state['plan']}"
                )
            ),
        ]

        result, trace = await invoke_with_retry(replanner_llm, messages, trace, "replanner")

        if result is None:
            print("error in replanner_node: exhausted retries on structured output")
            return {"execution_trace": trace}

        if result.action.action_type == "response":
            trace = add_trace(
                {"execution_trace": trace}, "replanner", "final_response", result.action.response[:300]
            )
            emit_final_response(state.get("user_id"), result.action.response)
            return {"response": result.action.response, "plan": [], "execution_trace": trace}

        trace = add_trace(
            {"execution_trace": trace}, "replanner", "updated_plan", json.dumps(result.action.steps)
        )
        return {"plan": result.action.steps, "execution_trace": trace}

    def should_continue(state: PlannerState) -> str:
        return END if not state.get("plan") else "executor"

    graph = StateGraph(PlannerState)
    print('Initializing the codebase graph')
    graph.add_node('planner', planner_node)
    graph.add_node('executor', executor_node)
    graph.add_node('replanner', replanner_node)
    graph.add_edge("planner", "executor")
    graph.add_edge("executor", "replanner")
    graph.add_conditional_edges("replanner", should_continue, {"executor": "executor", END: END})
    graph.add_edge(START, 'planner')

    return graph.compile()


async def main():
    app = await build_graph()
    result = await app.ainvoke({
        "user_id": "some-room-id",
        "description": "your task description",
        "past_steps": [],
        "plan": [],
        "response": "",
        "code_graph": "",
        "directory_structure": "",
        "execution_trace": [],
    })
    print(result["response"])


if __name__ == "__main__":
    asyncio.run(main())