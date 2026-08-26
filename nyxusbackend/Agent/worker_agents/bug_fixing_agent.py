import asyncio

from Agent.state import State, add_trace
from langchain_core.messages import AIMessage, HumanMessage, ToolMessage
from pydantic import BaseModel
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_mcp_adapters.client import MultiServerMCPClient

llm = ChatGoogleGenerativeAI(model="gemini-3.5-flash-lite", temperature=0)

MAX_TOOL_ITERATIONS = 5


class StructuredOutput(BaseModel):
    file_bug: str


async def bug_fixing_agent(state: State) -> dict:

    file_name = state.get("curr_file_name", "")
    api_key   = state.get("user_api")

    def _fail(msg: str) -> dict:
        return {
            "final_answer": "",
            "execution_trace": add_trace(state, agent="bug_fixing_agent",
                                         action=f"fix {file_name}", result=f"failed: {msg}"),
            "messages": [AIMessage(content=msg)],
        }

    # ── Connect to MCP ───────────────────────────────────────────────────────
    mcp_client = MultiServerMCPClient(
        {"nyxus": {"transport": "streamable_http", "url": "http://127.0.0.1:8000/mcp"}}
    )
    tools         = await mcp_client.get_tools()
    tools_by_name = {t.name: t for t in tools}

    # ── Prompt ───────────────────────────────────────────────────────────────
    prompt = f"""
You are a bug fixing agent. Analyze the file, identify the root cause,
and produce a minimal, precise fix.

USER GOAL: {state["prompt"]}
ROUTER REASONING: {state.get("router_reasoning", "")}
FILE: {file_name}
FILE CONTENT:
{state.get("curr_file_content", "")}
FILE CONTEXT: {state.get("curr_file_context", "")}
PREVIOUS CONVERSATION: {state["messages"]}

Use MCP tools only when you need to inspect an imported module, caller,
or dependency to understand the bug. Do NOT fetch unrelated files.

Produce markdown with these sections:
# Root Cause | # Affected Symbols | # Fix Strategy | # Code Changes
# Side Effects | # Verification Steps | # Confidence
"""

    # ── Tool-calling loop ────────────────────────────────────────────────────
    messages = [HumanMessage(content=prompt)]

    try:
        for _ in range(MAX_TOOL_ITERATIONS):
            ai_msg = await llm.bind_tools(tools).ainvoke(messages)
            messages.append(ai_msg)

            if not ai_msg.tool_calls:
                break

            for call in ai_msg.tool_calls:
                tool_name, tool_args, call_id = (
                    call["name"], dict(call.get("args", {})), call["id"]
                )
                tool_obj = tools_by_name.get(tool_name)

                if tool_obj is None:
                    result = f"Tool '{tool_name}' not found."
                else:
                    try:
                        # Inject api_key for tools that need workspace access
                        schema_args = getattr(tool_obj, "args_schema", {})
                        if "api_key" not in tool_args and "api_key" in schema_args:
                            tool_args["api_key"] = api_key
                        result = await tool_obj.ainvoke(tool_args)
                    except Exception as e:
                        result = f"Tool execution failed: {e}"

                messages.append(ToolMessage(content=str(result), tool_call_id=call_id))

    except Exception as e:
        return _fail(f"MCP/LLM execution failed: {e}")

    # ── Structured output pass ───────────────────────────────────────────────
    messages.append(HumanMessage(
        content=(
            f"USER GOAL: {state['prompt']}\n"
            f"FILE: {file_name}\n"
            f"FILE CONTENT:\n{state.get('curr_file_content', '')}\n"
            f"FILE CONTEXT: {state.get('curr_file_context', '')}\n\n"
            "Using all analysis above, produce the final bug-fix report "
            "in the `file_bug` field. Do NOT rewrite the entire file — "
            "only the changed section with enough surrounding context."
        )
    ))

    try:
        response = await llm.with_structured_output(StructuredOutput).ainvoke(messages)
    except Exception as e:
        return _fail(f"Structured output failed: {e}")

    if not response.file_bug or not response.file_bug.strip():
        return _fail("model returned empty response")

    # ── Success ──────────────────────────────────────────────────────────────
    return {
        "final_answer": response.file_bug,
        "execution_trace": add_trace(state, agent="bug_fixing_agent",
                                     action=f"fix {file_name}",
                                     result=f"success: {len(response.file_bug)} chars"),
        "messages": [AIMessage(content=f"Bug analysis complete for: {file_name}")],
    }


# ── Test ─────────────────────────────────────────────────────────────────────
async def test_agent():
    state: State = {
        "prompt": "Fix the bug in the file",
        "user_api": "test-sid",
        "detailed_dir": "", "high_level_dir": "main.py, utils.py",
        "curr_file_name": "main.py",
        "curr_file_content": "def main():\n    print('Hello World')",
        "curr_file_context": "",
        "final_answer": "", "router_reasoning": "", "router_decision": "",
        "messages": [HumanMessage(content="Fix the bug in the file")],
        "root_dir": "", "code_graph": "", "chat_history_summary": "",
        "execution_trace": [], "router_decision_history": [],
    }
    print(await bug_fixing_agent(state))


if __name__ == "__main__":
    asyncio.run(test_agent())