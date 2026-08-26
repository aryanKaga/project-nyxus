import asyncio
from fastmcp import Client
client = Client("http://localhost:8000/mcp")
import asyncio
async def create_user_session(api_key: str):
    print('trying to create user session')
    try:
        async with client:
            result = await client.call_tool(
                "create_user_session",
                {"api_key": api_key}
            )


            # Tool-level error
            if result["success"] is False:
                print('failed to create user session')
                return result
            print('user session created')
            return result

    except Exception:
        # Transport/client-level error
        print('failed to create session')
        return {
            "success": False,
            "message": "MCP server request failed"
        }



async def delete_user_session(api_key: str):
    try:
        async with client:
            result = await client.call_tool(
                "delete_user_session",
                {"api_key": api_key}
            )

            # Tool-level error
            if result["success"] is False:
                return result

            return result

    except Exception:
        # Transport/client-level error
        return {
            "success": False,
            "message": "MCP server request failed"
        }




    