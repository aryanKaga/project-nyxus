from Agent.state import State
from server import user_to_state
def save_user_state(user_api:str,state:State):
    """
    Saves the user's state in the user_to_state dictionary.

    Args:
        user_api (str): The user's API key.
        state (State): The state to be saved for the user. 

    """

    user_to_state[user_api] = state