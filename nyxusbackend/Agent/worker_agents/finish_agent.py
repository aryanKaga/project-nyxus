from langchain_core.messages import AIMessage
from langchain_google_genai import ChatGoogleGenerativeAI
from google import genai
from Agent.state import State
import server_socket



client = genai.Client()


def finish_agent(state: State) -> dict:

    sid = state['user_api']

    prompt = f"""
You are the final response generator for Nyxus, an AI coding assistant.

The worker agents have finished their tasks.
Synthesize everything into a clear, helpful response for the user.

==================================================
USER REQUEST
==================================================

{state["prompt"]}

==================================================
PROJECT STRUCTURE
==================================================

{state.get("high_level_dir", "")}

==================================================
CURRENT FILE
==================================================

File Name : {state.get("curr_file", "")}
File Path : {state.get("curr_file_path", "")}

==================================================
FILE CONTEXT
==================================================

{state.get("curr_file_context", "No context available.")}

==================================================
ANALYSIS / FIX
==================================================

{state.get("final_answer", "No analysis available.")}

==================================================
CONVERSATION HISTORY
==================================================

{state.get("messages", [])}

==================================================
INSTRUCTIONS
==================================================

- Write the final response the user should see.
- Do NOT mention routing agents, internal agents, or implementation details.
- Do NOT say "as an AI" or similar filler phrases.
- If the task was a bug fix, present the fix clearly with code blocks.
- If the user was just chatting or asking a question, respond naturally.
- Be concise and direct.
"""

    response_stream = client.models.generate_content_stream(
        model='gemini-3.5-flash-lite',
        contents=prompt
    )   
    full_response = ""

    try:

        for chunk in response_stream:

            token = chunk.text

            if not token:
                continue

            

            server_socket.socketio.emit(
                "assistant_chunk",
                {"token": token},
                room=sid
            )

        

        server_socket.socketio.emit(
            "assistant_end",
            {},
            room=sid
        )

    except Exception as e:

        print("LLM STREAM ERROR:", repr(e))

        server_socket.socketio.emit(
            "assistant_error",
            {
                "error": str(e)
            },
            room=sid
        )

        raise
    print(full_response)
    return {
        "final_answer": full_response,

        "messages": [
            AIMessage(content=full_response)
        ]
    }