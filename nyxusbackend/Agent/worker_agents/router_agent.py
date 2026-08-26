from typing import Literal
from pydantic import BaseModel

from langchain_core.messages import SystemMessage
from langchain_ollama import ChatOllama
from langchain_google_genai import ChatGoogleGenerativeAI
from Agent.state import State, add_trace
from Agent.trace_utils import format_trace
from Agent.agent_docs import agent_docs
from langchain_google_genai import ChatGoogleGenerativeAI


# NOTE: gemini-2.5-flash is no longer available to new users (404 NOT_FOUND).
# Migrated to gemini-3.5-flash. If you want the newer/cheaper GA model instead,
# swap the string below for "gemini-3.6-flash" — it's a drop-in replacement.
llm = ChatGoogleGenerativeAI(
    model="gemini-3.5-flash-lite",
    temperature=0,
)


class RouterDecision(BaseModel):
    reasoning: str
    next_agent: Literal[
        "file_analyzing_agent",
        "context_creating_agent",
        "bug_fixing_agent",
        "finish_agent",
    ]


router_llm = llm.with_structured_output(RouterDecision)


def router_agent(state: State):
    prior_decisions = state.get("router_decision_history", [])[-3:]
    recent_trace = format_trace(state.get("execution_trace", []), last_n=10)

    prompt = f"""You are the Router Agent in a multi-agent code analysis system.
Decide which agent runs next. Do not answer the user's question yourself.

AVAILABLE AGENTS
{agent_docs}

DECISION RULES (check in order, stop at first match):
1. No file selected yet AND file info is needed -> file_analyzing_agent
2. File selected but curr_file_context is None -> context_creating_agent
3. File selected, context exists, user needs analysis/fix -> bug_fixing_agent
4. All needed info gathered, nothing more required -> finish_agent

Never choose finish_agent if repository information is missing.
This workflow is iterative and single-file: one file is processed at a time.

EXAMPLES
State: no file selected, user asks "why is auth.py failing" -> file_analyzing_agent
State: file=auth.py, context=None -> context_creating_agent
State: file=auth.py, context exists, user wants a fix -> bug_fixing_agent

CONVERSATION SUMMARY
{state.get("chat_history_summary", "No summary available.")}

EXECUTION TRACE (most recent steps, chronological)
{recent_trace}

CURRENT STATE
Current Selected File: {state.get("curr_file_name", "None")}
Current File Context: {state.get("curr_file_context", "None")}
Last Router Decisions: {prior_decisions or "None yet"}
Latest User Message: {state["prompt"]}

Give brief reasoning, then pick exactly one agent.
"""

    result: RouterDecision = router_llm.invoke(prompt)

    print('agent at router_agent selected next agent:', result.next_agent)
    print('agent at router_agent reasoning:', result.reasoning)

    return {
        "router_reasoning": result.reasoning,
        "router_decision": result.next_agent,
        "router_decision_history": state.get("router_decision_history", []) + [result.next_agent],
        "execution_trace": add_trace(
            state,
            agent="router_agent",
            action=f"decision: {result.next_agent}",
            result=result.reasoning[:80],
        ),
        "messages": [SystemMessage(content=f"Router decision: {result.next_agent}. Reasoning: {result.reasoning}")]
    }


