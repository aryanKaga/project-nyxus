from mcp.server.fastmcp import FastMCP

from tools.get_file_content import get_file

from database.database_operations import (
    add_user_filedata,
    add_user_session,
    retrieve_file,
    delete_user_data as db_delete_user_data,
)


mcp = FastMCP("nyxus-server")


@mcp.tool()
async def create_user_session(api_key: str):
    """Create a session for the Nyxus user. this tool can not be accessed by the agent"""
    
    print("MCP: create_user_session called")

    return await add_user_session(api_key)


@mcp.tool()
async def get_file_data(
    api_key: str,
    file_name: str,
):
    """Retrieve file data for a particular file."""

    print("MCP: get_file_data called")

    return await retrieve_file(
        api_key,
        file_name,
    )


@mcp.tool()
async def delete_user_session(api_key: str):
    """Delete the user session."""

    print("MCP: delete_user_session called")

    return await delete_user_data(api_key)


async def  delete_user_data(api_key: str):
    """Delete user data for a particular session. this tool can not be accessed by the agent"""

    print("MCP: deleting user data")

    return  await db_delete_user_data(api_key)


if __name__ == "__main__":
    mcp.run()