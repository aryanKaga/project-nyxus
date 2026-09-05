from dotenv import load_dotenv
load_dotenv()

from flask import Flask, request, jsonify
from flask_socketio import SocketIO, join_room

from Agent.agent_docs import agent_docs
from Agent.state import State
from Agent.agent import create_graph

import server_socket

import asyncio
import uuid
import os
import logging
import warnings
import threading

from concurrent.futures import ThreadPoolExecutor

from langchain_core.messages import HumanMessage

from helper_functions.user_Session import (
    create_user_session,
    delete_user_session,
)

from helper_functions.store_userdata import (
    store_user_data,
    store_user_state,
)

from helper_functions.retrieve_userdata import (
    retrieve_user_data,
)


# ============================================================
# Configuration
# ============================================================

warnings.filterwarnings(
    "ignore",
    message="Model 'gemini-3.5-flash-lite' uses fixed sampling defaults*"
)

logging.getLogger("werkzeug").setLevel(logging.ERROR)
logging.getLogger("socketio").setLevel(logging.ERROR)
logging.getLogger("engineio").setLevel(logging.ERROR)

print(
    "GOOGLE_API_KEY loaded:",
    bool(os.getenv("GOOGLE_API_KEY"))
)


# ============================================================
# Flask + Socket.IO
# ============================================================

app = Flask(__name__)

socketio = SocketIO(
    app,
    cors_allowed_origins="*",
    async_mode="threading",
)

server_socket.socketio = socketio


# ============================================================
# In-memory state
# ============================================================

user_to_state = {}
user_to_data = {}
user_to_high_level_dir = {}


# ============================================================
# Persistent asyncio event loop
# ============================================================

async_loop = asyncio.new_event_loop()


def start_async_loop():
    """
    Run one persistent asyncio event loop.
    This thread lives for the lifetime of the server.
    """
    asyncio.set_event_loop(async_loop)

    print("Persistent asyncio event loop started")

    async_loop.run_forever()


async_loop_thread = threading.Thread(
    target=start_async_loop,
    daemon=True,
    name="async-loop",
)

async_loop_thread.start()


# ============================================================
# Chat worker pool
# ============================================================

MAX_CHAT_WORKERS = 20

chat_executor = ThreadPoolExecutor(
    max_workers=MAX_CHAT_WORKERS,
    thread_name_prefix="chat-worker",
)


# ============================================================
# Socket.IO: CONNECT
# ============================================================

@socketio.on("connect")
def connect(auth):

    print("Client connected")

    if not auth:
        print("No authentication data received")
        return

    api_key = auth.get("apiKey")

    if not api_key:
        print("No apiKey received from client")
        return

    session_id = str(uuid.uuid4())

    server_socket.session_to_api[session_id] = api_key
    server_socket.api_to_session[api_key] = session_id

    print(
        f"Socket connected: api={api_key}, "
        f"session={session_id}"
    )


# ============================================================
# Socket.IO: DISCONNECT
# ============================================================

@socketio.on("disconnect")
def disconnect():

    print("Client disconnected")


# ============================================================
# Socket.IO: FOLDER DATA
# ============================================================

@socketio.on("handle_folder_data")
def handle_folder_data(data):

    print("Received folder data")

    try:

        api = data["apiKey"]

        user_data = {
            "graph_data": data["graph_data"],
            "folder_structure_data": data["folder_structure_data"],
            "root_dir": data["root_dir"],
        }

        store_user_data(
            user_to_data,
            api,
            user_data,
        )

        join_room(api)

        print(
            f"Folder data stored for api={api}"
        )

    except Exception as e:

        print(
            "ERROR in handle_folder_data:",
            repr(e)
        )


# ============================================================
# Socket.IO: CHAT
# ============================================================

@socketio.on("chat")
def chat(data):

    print("CHAT EVENT RECEIVED")
    print("Received data:", data)

    try:

        # Submit the synchronous wrapper to a bounded
        # worker pool instead of creating an unlimited
        # new thread for every request.

        chat_executor.submit(
            run_chat,
            data,
        )

        print(
            "Chat submitted to worker pool"
        )

    except Exception as e:

        print(
            "ERROR submitting chat:",
            repr(e)
        )

        api = data.get("apikey")

        if api:
            socketio.emit(
                "chat_error",
                {
                    "error": str(e)
                },
                room=api,
            )


# ============================================================
# CHAT WORKER
# ============================================================

def run_chat(data):

    print(
        f"CHAT WORKER STARTED "
        f"thread={threading.current_thread().name}"
    )

    try:

        # Submit the coroutine to the ONE persistent
        # asyncio event loop.

        future = asyncio.run_coroutine_threadsafe(
            process_chat(data),
            async_loop,
        )

        # Wait for the async operation to finish.
        future.result()

        print("CHAT WORKER FINISHED")

    except Exception as e:

        print(
            "RUN_CHAT ERROR:",
            repr(e)
        )

        api = data.get("apikey")

        if api:

            socketio.emit(
                "chat_error",
                {
                    "error": str(e)
                },
                room=api,
            )


# ============================================================
# ASYNC CHAT PROCESSING
# ============================================================

async def process_chat(data):

    print("ASYNC CHAT STARTED")

    api = data["apikey"]
    prompt = data["prompt"]
    auto_memmory = data.get("auto_memory", False)

    print(
        f"Processing chat for api={api}"
    )

    try:

        # ----------------------------------------------------
        # Create session
        # ----------------------------------------------------

        print(
            "Creating user session..."
        )

        await create_user_session(api)


        # ----------------------------------------------------
        # Retrieve workspace data
        # ----------------------------------------------------

        print(
            "Retrieving user data..."
        )

        user_data = retrieve_user_data(
            user_to_data,
            api,
        )

        if not user_data:

            raise RuntimeError(
                "No workspace data found for this user"
            )


        # ----------------------------------------------------
        # Create state
        # ----------------------------------------------------

        state = State(

            user_session_id=api,

            prompt=prompt,

            user_api=api,

            detailed_dir=user_data[
                "folder_structure_data"
            ],

            root_dir=user_data[
                "root_dir"
            ],

            high_level_dir="",

            code_graph=user_data[
                "graph_data"
            ],

            messages=[
                HumanMessage(
                    content="User prompt: " + prompt
                )
            ],
            auto_memory=auto_memmory,
        )


        store_user_state(
            user_to_state,
            api,
            state,
        )

        print(
            "State created"
        )


        # ----------------------------------------------------
        # Create graph
        # ----------------------------------------------------

        print(
            "Creating LangGraph..."
        )

        graph = create_graph()

        print(
            "LangGraph created"
        )


        # ----------------------------------------------------
        # Run graph
        # ----------------------------------------------------

        print(
            "Starting graph.ainvoke()"
        )

        result = await graph.ainvoke(
            state
        )

        print(
            "LangGraph finished"
        )


        # ----------------------------------------------------
        # Send response
        # ----------------------------------------------------

        socketio.emit(
            "chat_response",
            {
                "result": result
            },
            room=api,
        )

        print(
            "Response emitted to client"
        )


    except Exception as e:

        print(
            "\n================================"
        )

        print(
            "ERROR IN ASYNC CHAT"
        )

        print(
            repr(e)
        )

        print(
            "================================\n"
        )

        socketio.emit(
            "chat_error",
            {
                "error": str(e)
            },
            room=api,
        )

        raise


    finally:

        try:

            await delete_user_session(api)

            print(
                "User session deleted"
            )

        except Exception as e:

            print(
                "SESSION DELETE ERROR:",
                repr(e)
            )


# ============================================================
# FILE CONTENT RESPONSE
# ============================================================

@socketio.on("file_content_response")
def file_content_response(data):

    print(
        "Received file_content_response"
    )

    request_id = data.get(
        "request_id"
    )

    if not request_id:

        print(
            "No request_id received"
        )

        return

    user_request = (
        server_socket.pending_requests.get(
            request_id
        )
    )

    if user_request is None:

        print(
            "No pending request found:",
            request_id
        )

        return

    user_request["response"] = data

    user_request["event"].set()

    print(
        "Server received file content "
        f"for request id {request_id}"
    )
 
        
    


# ============================================================
# HTTP FILE CONTENT ENDPOINT
# ============================================================

@app.route(
    "/getfile_content",
    methods=["POST"]
)
def get_file_content():

    try:

        data = request.json

        file_name = data["file_name"]
        api_key = data["api_key"]

        from helper_functions.getfile import (
            get_file_data
        )

        result = get_file_data(
            filename=file_name,
            api_key=api_key,
        )

        print(
            "Server received request for file:",
            file_name
        )

        return jsonify(result)

    except Exception as e:

        print(
            "ERROR in /getfile_content:",
            repr(e)
        )

        return jsonify(
            {
                "error": str(e)
            }
        ), 500



# ============================================================
# MAIN
# ============================================================

if __name__ == "__main__":

    print(
        "Available agents:",
        agent_docs.keys()
    )

    print(
        "SocketIO async mode:",
        socketio.async_mode
    )

    print(
        "Chat worker limit:",
        MAX_CHAT_WORKERS
    )

    print(
        "Active threads:",
        threading.active_count()
    )

    socketio.run(
        app,
        host="0.0.0.0",
        port=5000,
        debug=True,
    )


