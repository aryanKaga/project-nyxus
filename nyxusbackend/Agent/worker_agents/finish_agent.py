from langchain_core.messages import AIMessage
from langchain_ollama import ChatOllama
from Agent.state import State
from langchain_google_genai import ChatGoogleGenerativeAI

# NOTE: gemini-2.5-flash is no longer available to new users (404 NOT_FOUND).
# Migrated to gemini-2.5-flash-lite.
llm = ChatGoogleGenerativeAI(
    model="gemini-3.5-flash-lite",
    temperature=0,
)


def finish_agent(state: State) -> dict:

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

{state["messages"]}

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

    response = llm.invoke(prompt)
    print("Final response generated:", response.content)

    return {
        "final_answer": response.content,
        "messages": [AIMessage(content=response.content)]  # ✅ add_messages reducer handles appending
    }