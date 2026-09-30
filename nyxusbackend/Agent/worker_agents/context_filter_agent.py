from Agent.state import State
from pydantic import BaseModel
from google import genai
from langchain_google_genai import ChatGoogleGenerativeAI

from pydantic import BaseModel, Field

llm = ChatGoogleGenerativeAI(model="gemini-3.5-flash-lite", temperature=0)
class filtered_context(BaseModel):
    filtered_context: str = Field(
        default="",
        description="The filtered context based on the user's prompt, in a single paragraph."
    )
def filter_context_agent(state:State)->State:
    """"
    It filter the contex

    """
    context = state.get('auto_memory','')
    if len(context) == 0:
        return {}

    context_filter_prompt = f"""
You are Nyxus's context filter agent. Your task is to filter the context based on the user's prompt. The context is provided in the 'auto_memory' field of the state.
USER GOAL: {state["prompt"]}

and the context is {context}
Please filter the context to only include information that is relevant to the user's prompt. Remove any information that is not directly related to the user's request. The output should be a concise summary of the relevant context, in a single paragraph.
"""

    content_cleaner = llm.with_structured_output(filtered_context)
    response = content_cleaner.invoke(context_filter_prompt)
    if response.filtered_context == '':
        return {}

    return {'auto_memory':response.filtered_context}
