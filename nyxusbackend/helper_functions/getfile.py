import server_socket
import threading
import uuid


def get_file_data(filename: str, api_key: str):

    request_id = str(uuid.uuid4())
    event = threading.Event()

    server_socket.pending_requests[request_id] = {
        "event": event,
        "response": None
    }

    socketio = server_socket.socketio

    socketio.emit(
        "get_file_content",
        {
            "request_id": request_id,
            "file_name": filename
        },
        room=api_key
    )

    # Wait for the VS Code extension to respond
    if not event.wait(timeout=30):
        del server_socket.pending_requests[request_id]
        raise TimeoutError("File content request timed out")

    # Get response
    response = server_socket.pending_requests[request_id]["response"]
    #print('received response',response)
    # Cleanup
    del server_socket.pending_requests[request_id]

    return response