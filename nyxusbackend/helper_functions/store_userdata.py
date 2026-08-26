
from Agent.state import State
def store_user_state(user_to_state: dict, user_api:str, state:State):
    """
        Storing user state for later retreival
    """

    user_to_state[user_api] = state


def store_user_data(user_to_data: dict, user_api:str, data:dict):
    """
        Storing user data
    """
    user_to_data[user_api] = data
    

def store_and_retreive_user_state(user_to_state: dict, user_api:str, state:State)->State:
    """
        Storing user state for later retreival
    """

    user_to_state[user_api] = state
    return user_to_state[user_api]

def store_user_high_level_directory(user_to_data: dict, user_api:str, high_level_dir:str):
    """
        Storing user data
    """
    if user_api in user_to_data:
        user_to_data[user_api]["high_level_dir"] = high_level_dir





