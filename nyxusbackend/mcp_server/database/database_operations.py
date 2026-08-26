import logging

from database.mongoclient import db
from tools.get_file_content import get_file

logger = logging.getLogger(__name__)


async def add_user_session(api_key: str):
    try:
        # Check whether session already exists
        existing_user = await db.users.find_one(
            {"api_key": api_key}
        )

        if existing_user:
            return {
                "success": False,
                "message": "User session already exists"
            }

        await db.users.insert_one({
            "api_key": api_key,
            "file_structure": {}
        })
        print('usser session was created')
        return {
            "success": True,
            "message": "User session created successfully"
        }

    except Exception:
        logger.exception("Failed to create user session")

        return {
            "success": False,
            "message": "Failed to create user session"
        }


async def add_user_filedata(
    api_key: str,
    file_name: str,
    file_content: str
):
    try:
        result = await db.users.update_one(
            {"api_key": api_key},
            {
                "$set": {
                    f"file_structure.{file_name}": file_content
                }
            }
        )

        if result.matched_count == 0:
            return {
                "success": False,
                "message": "User session not found"
            }

        return {
            "success": True,
            "message": f"File '{file_name}' added successfully"
        }

    except Exception:
        logger.exception(
            "Failed to add file '%s' for user",
            file_name
        )

        return {
            "success": False,
            "message": "Failed to add file"
        }


async def retrieve_file(
    api_key: str,
    file_name: str
):
    try:
        # 1. Find user
        user = await db.users.find_one(
            {"api_key": api_key}
        )

        if not user:
            return {
                "success": False,
                "message": "User session not found"
            }

        # 2. Check MongoDB cache
        file_structure = user.get("file_structure", {})

        file_data = file_structure.get(file_name)

        if file_data is not None:
            print('file data has been found')
            return {
                "success": True,
                "source": "cache",
                "file_data": file_data
            }

    except Exception:
        logger.exception(
            "Database error while retrieving file '%s'",
            file_name
        )

        return {
            "success": False,
            "message": "Failed to access file storage"
        }

    # 3. File wasn't cached → ask client
    try:
        data = await get_file(
            filename=file_name,
            api_key=api_key
        )

        if not data:
            return {
                "success": False,
                "message": "Failed to retrieve file from client"
            }
        print(data)
        file_data = data.get("file_data")

        if file_data is None:
            return {
                "success": False,
                "message": "File content was not returned"
            }
        print('file data has been found for the user with filename',file_name)
    except Exception:
        logger.exception(
            "Failed to retrieve file '%s' from client",
            file_name
        )

        return {
            "success": False,
            "message": "Failed to retrieve file"
        }

    # 4. Cache the file
    try:
        result = await db.users.update_one(
            {"api_key": api_key},
            {
                "$set": {
                    f"file_structure.{file_name}": file_data
                }
            }
        )

        if result.matched_count == 0:
            return {
                "success": False,
                "message": "User session no longer exists"
            }

    except Exception:
        logger.exception(
            "Failed to cache file '%s'",
            file_name
        )

        # We successfully got the file, so we can still return it.
        # Caching failure shouldn't make retrieval fail.
        return {
            "success": True,
            "source": "client",
            "cached": False,
            "file_data": file_data
        }

    # 5. Successfully retrieved + cached
    

    return {
        "success": True,
        "source": "client",
        "cached": True,
        "file_data": file_data
    }


async def delete_user_data(api_key: str):
    try:
        result = await db.users.delete_one(
            {"api_key": api_key}
        )

        if result.deleted_count == 0:
            return {
                "success": False,
                "message": "User session not found"
            }

        return {
            "success": True,
            "message": "User data deleted successfully"
        }

    except Exception:
        logger.exception(
            "Failed to delete user data"
        )

        return {
            "success": False,
            "message": "Failed to delete user data"
        }




