from pymongo import MongoClient, errors
from dotenv import load_dotenv
import os

load_dotenv()

# MongoDB Connection URL
MONGO_URL = os.getenv("MONGO_URI")
DB_NAME = os.getenv("DB_NAME", "optimerge")

if not MONGO_URL:
    raise ValueError("MONGO_URI is missing in your .env file")

# serverSelectionTimeoutMS just controls how long it waits when it actually tries to talk to the cluster
client = MongoClient(
    MONGO_URL,
    serverSelectionTimeoutMS=5000,
    maxPoolSize=50,
)

# Select database (use DB_NAME from env or default)
db = client[DB_NAME]

# Expose collections
analysis_collection = db["analysis_results"]
bom_files_collection = db["bom_files"]
users_collection = db["users"]


def ensure_indexes():
    """
    Create required indexes. Wrapped in try/except so that index creation
    failure doesn't crash the whole app at import/startup.
    """
    try:
        users_collection.create_index("email", unique=True)
        print("✅ MongoDB indexes ensured (users.email unique)")
    except errors.PyMongoError as e:
        # Don't crash app; just log a warning
        print(f"⚠️  Warning: could not create MongoDB index on users.email: {e}")
