

def retrieve_user_state(user_to_state: dict, user_api:str)->dict:
    
    """
    Retrieves user data from the user_to_data dictionary.

    Args:
        user_api (str): The user's API key.
    """

    return user_to_state.get(user_api) if (user_api in user_to_state) else None


def retrieve_user_data(user_to_data: dict, user_api:str)->dict:
    
    """
    Retrieves user data from the user_to_data dictionary.

    Args:
        user_api (str): The user's API key.
    """

    return user_to_data.get(user_api) if (user_api in user_to_data) else None


def retrieve_user_high_level_directory(user_to_data: dict, user_api:str)->str:
    
    """
    Retrieves user data from the user_to_data dictionary.

    Args:
        user_api (str): The user's API key.
    """

    if user_api in user_to_data and "high_level_dir" in user_to_data[user_api]:
        return user_to_data[user_api]["high_level_dir"]
    else:
        return None



