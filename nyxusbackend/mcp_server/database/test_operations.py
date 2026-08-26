

api_key = "jollyllb"

import database.database_operations
import asyncio
file_content = "hello world"
file_name = "hello_world"


async def test_database_operations():
    try:
        await database.database_operations.add_user_session(
            api_key=api_key
        )

        await database.database_operations.add_user_filedata(
            api_key=api_key,
            file_name=file_name,
            file_content=file_content
        )

        result = await database.database_operations.retrieve_file(
            api_key=api_key,
            file_name=file_name
        )

        print("Retrieved file:", result)

    except Exception as e:
        print(f"Database operation failed: {e}")

asyncio.run(test_database_operations())