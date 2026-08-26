
from pymongo import AsyncMongoClient

uri = "mongodb+srv://aryanchamp4589_db_user:sejpal@stomach.jbntaa7.mongodb.net/?appName=stomach"

# Create a new client and connect to the server
client = AsyncMongoClient(uri)

db = client['nyxus']

