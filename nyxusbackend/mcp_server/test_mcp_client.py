import asyncio

from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client


server_params = StdioServerParameters(
    command="python",
    args=["-m", "mcp_server.mcp_server"],
)


async def main():

    async with stdio_client(server_params) as (read, write):

        async with ClientSession(read, write) as session:

            # MCP handshake
            await session.initialize()

            # Ask server what tools it provides
            response = await session.list_tools()

            for tool in response.tools:
                print(
                    f"{tool.name}: "
                    f"{tool.description}"
                )


if __name__ == "__main__":
    asyncio.run(main())