from langchain_core.messages import AIMessage
from langchain_google_genai import ChatGoogleGenerativeAI
from google import genai
from Agent.state import State
import server_socket



client = genai.Client()
from google.genai import types

SYSTEM_PROMPT = """You are the final responder of Nyxus, a coding assistant for the user's repository.
You only help with the codebase and software development.

Scope:
- If the message is unrelated to code or this repository, don't answer it. Say in one or two
  sentences that you only help with the codebase, and suggest something relevant.
- If it is a coding request too vague to act on, ask ONE specific clarifying question.
- Greetings get a brief reply that points back to what you can help with.

Grounding:
- Answer only from the FILE CONTEXT, ANALYSIS, and PROJECT STRUCTURE provided.
- Never mention these sections or how the reply was produced.

Style:
- Answer only what was asked.
- Bug fix: one line on the cause, corrected code in a code block, short note on the change.
- Explain step by step only if asked why/how.
- Match the user's language and level. No filler openers or closers."""


def _format_history(messages, limit=6):
    lines = []
    for m in messages[-limit:]:
        role = "User" if m.type == "human" else "Assistant"
        lines.append(f"{role}: {m.content}")
    return "\n".join(lines)


def finish_agent(state: State) -> dict:
    sid = state["user_api"]

    file_ctx = state.get("curr_file_context") or "NONE LOADED"
    analysis = state.get("final_answer") or "NONE"
    current_file = state.get("curr_file_name") or "NONE SELECTED"
    execution_trace = state.get("execution_trace", [])
    trace_text = "\n".join(
        f"{entry['step']}. {entry['agent']}: {entry['action']} - {entry['result']}"
        for entry in execution_trace
    ) or "No agent execution trace available."

    contents = f"""PROJECT STRUCTURE:
{state.get("high_level_dir", "")}

CURRENT FILE: {current_file}

FILE CONTEXT:
{file_ctx}

ANALYSIS / FIX:
{analysis}

AGENT EXECUTION TRACE:
{trace_text}

RECENT CONVERSATION:
{_format_history(state.get("messages", []))}

USER REQUEST (answer this):
{state["prompt"]}

AGENTS PREVIOUS CONTEXT OF REPO:
{state.get('auto_memory','no previous context yet')}
"""

    response_stream = client.models.generate_content_stream(
        model="gemini-3.5-flash-lite",  # try a stronger model if drift persists
        contents=contents,
        config=types.GenerateContentConfig(
            system_instruction=SYSTEM_PROMPT,
            temperature=0.2,
        ),
    )

    full_response = ""
    try:
        for chunk in response_stream:
            token = chunk.text
            if not token:
                continue
            full_response += token  # was missing
            server_socket.socketio.emit("assistant_chunk", {"token": token}, room=sid)

        server_socket.socketio.emit("assistant_end", {}, room=sid)

    except Exception as e:
        print("LLM STREAM ERROR:", repr(e))
        server_socket.socketio.emit("assistant_error", {"error": str(e)}, room=sid)
        raise

    return {
        "final_answer": full_response,
        "messages": [AIMessage(content=full_response)],
    }