from Agent.state import State, add_trace
from langchain_core.messages import AIMessage, HumanMessage, ToolMessage
from pydantic import BaseModel
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_mcp_adapters.client import MultiServerMCPClient

llm = ChatGoogleGenerativeAI(model="gemini-3.5-flash-lite", temperature=0)

MAX_TOOL_ITERATIONS = 4


class StructuredOutput(BaseModel):
    context: str


async def context_creating_agent(state: State) -> dict:

    file_name = state.get("curr_file_name")
    api_key   = state.get("user_api")

    # ── Guard: no file selected ──────────────────────────────────────────────
    if not file_name:
        return {
            "curr_file_context": "",
            "execution_trace": add_trace(state, agent="context_creating_agent",
                                         action="no file selected", result="returned to router"),
            "messages": [AIMessage(content="No file selected. Returning to router.")],
        }

    # ── Connect to MCP ───────────────────────────────────────────────────────
    mcp_client = MultiServerMCPClient(
        {"nyxus": {"transport": "streamable_http", "url": "http://127.0.0.1:8000/mcp"}}
    )
    tools          = await mcp_client.get_tools()
    tools_by_name  = {t.name: t for t in tools}

    # ── Prompt ───────────────────────────────────────────────────────────────
    prompt = f"""
You are Nyxus's file context creation agent. Build a high-quality semantic
understanding of the source file below.

USER GOAL: {state["prompt"]}
ROUTER REASONING: {state.get("router_reasoning", "")}
CURRENT FILE: {file_name}
PREVIOUS CONVERSATION: {state["messages"]}

Use the available tools to read file contents as needed.
When you have enough information, stop calling tools.

Produce markdown output with these sections:
# Purpose | # Components | # Imports | # Exports | # Relationships
# Execution Flow | # State Changes | # Risks | # Important Symbols
"""

    # ── Tool-calling loop ────────────────────────────────────────────────────
    tool_llm = llm.bind_tools(tools)
    messages = [HumanMessage(content=prompt)]

    for _ in range(MAX_TOOL_ITERATIONS):

        ai_msg = await tool_llm.ainvoke(messages)
        messages.append(ai_msg)

        if not ai_msg.tool_calls:
            break

        for call in ai_msg.tool_calls:
            tool_name     = call["name"]
            tool_args     = dict(call["args"])
            tool_call_id  = call["id"]
            tool_obj      = tools_by_name.get(tool_name)

            if tool_obj is None:
                result = f"Error: unknown tool '{tool_name}'"
            else:
                try:
                    if tool_name == "get_file_data":
                        tool_args["api_key"] = api_key
                    result = await tool_obj.ainvoke(tool_args)
                except Exception as e:
                    result = f"Error calling {tool_name}: {e}"

            messages.append(
                ToolMessage(content=str(result), tool_call_id=tool_call_id)
            )

    # ── Structured output ────────────────────────────────────────────────────
    messages.append(HumanMessage(
        content="Produce the final structured context now. Do not call any more tools."
    ))
    response = await llm.with_structured_output(StructuredOutput).ainvoke(messages)

    # ── Guard: empty response ────────────────────────────────────────────────
    if not response.context or not response.context.strip():
        return {
            "curr_file_context": "",
            "execution_trace": add_trace(state, agent="context_creating_agent",
                                         action=f"generate context for {file_name}",
                                         result="failed: empty response from LLM"),
            "messages": [AIMessage(content=f"Failed to generate context for {file_name}.")],
        }

    # ── Success ──────────────────────────────────────────────────────────────
    return {
        "curr_file_context": response.context,
        "execution_trace": add_trace(state, agent="context_creating_agent",
                                     action=f"generate context for {file_name}",
                                     result=f"success: {len(response.context)} chars"),
        "messages": [AIMessage(content=f"Context created for: {file_name}")],
    }