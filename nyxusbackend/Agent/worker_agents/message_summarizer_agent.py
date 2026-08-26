from Agent.state import State
from langchain_ollama import ChatOllama
from langgraph.graph.message import RemoveMessage
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage
from langchain_google_genai import ChatGoogleGenerativeAI
from pydantic import BaseModel

SUMMARY_TRIGGER_COUNT = 6
class SummaryOutput(BaseModel):
    summary: str

def message_summarizer(state: State) -> State:
    messages = state.get("messages", [])

    # Only real user/assistant turns belong in the conversation summary —
    # router SystemMessages are internal routing chatter, not conversation.
    conversational = [m for m in messages if isinstance(m, (HumanMessage, AIMessage))]

    if len(messages) <= SUMMARY_TRIGGER_COUNT:
        # Nothing to compress yet — skip the LLM call entirely.
        return {}

    llm = ChatGoogleGenerativeAI(
    model="gemini-3.5-flash-lite",
    temperature=0,
    )
    summary_llm = llm.with_structured_output(SummaryOutput)
    
    def format_messages(msgs):
        lines = []
        for m in msgs:
            role = "User" if isinstance(m, HumanMessage) else "Assistant"
            lines.append(f"{role}: {m.content}")
        return "\n".join(lines)

    conversation_text = format_messages(conversational)

    prompt = f"""
You are summarizing a conversation between a user and an AI coding assistant.
This summary will be consumed by another AI router agent.
Return ONLY the summary below.

## Key Facts
File names, classes, functions, config values, repository facts, user preferences.
Write "None" if empty.

## Decisions Made
Format: <decision> -> <reason>
Write "None" if empty.

## User's Last Request
One concise sentence.

Rules:
- Never invent facts.
- Never assume context exists or analysis happened just because a file was selected.
- Keep chronological order. Keep bullets under 20 words.
- Return ONLY the summary.
- Do NOT track agent actions or step-by-step execution — that is handled separately.

Conversation:
{conversation_text}
"""

    try:
        response = summary_llm.invoke(prompt)
        summary = response.summary.strip() or "No summary generated."
    except Exception as e:
        print("Summarizer Error:", e)
        summary = state.get("chat_history_summary") or "Summary generation failed."

    print("Summary:")
    print(summary)

    update = {"chat_history_summary": summary}

    update["messages"] = (
        [RemoveMessage(id=m.id) for m in messages]
        + [
            HumanMessage(
                content=f"""Conversation Summary:

{summary}

Continue the conversation using this summary instead of previous messages."""
            )
        ]
    )

    return update