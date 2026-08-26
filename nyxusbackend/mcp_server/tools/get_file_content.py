
import asyncio
import httpx

async def get_file(filename, api_key):
    print("sending request for getting file content")

    async with httpx.AsyncClient(trust_env=False) as client:
        response = await client.post(
            "http://localhost:5000/getfile_content",
            json={
                "file_name": filename,
                "api_key": api_key
            }
        )
    print('response received' ,filename)
    response.raise_for_status()
    return response.json()