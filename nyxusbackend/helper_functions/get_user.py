
def get_user(session_id: str) -> str:
    """Retrieve the API key associated with a given session ID."""

    import server_socket

    try:
        return server_socket.session_to_api[session_id]
    except KeyError as err:
        return str(err)