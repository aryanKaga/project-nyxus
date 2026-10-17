
import os
from pathlib import Path

from dotenv import load_dotenv
from pymongo import AsyncMongoClient

credentials_file = Path(__file__).resolve().parents[2] / "atlas-credentials.env"
load_dotenv(credentials_file)

uri = os.getenv("MONGODB_URI")
if not uri:
	raise RuntimeError("MONGODB_URI is not configured")

# Create a new client and connect to the server
client = AsyncMongoClient(uri)

db = client['nyxus']

