
from pymongo import AsyncMongoClient

uri = "MONGO DB URL"

# Create a new client and connect to the server
client = AsyncMongoClient(uri)

db = client['nyxus']

