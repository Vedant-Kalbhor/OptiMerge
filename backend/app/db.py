from pymongo import MongoClient
from dotenv import load_dotenv
import os

load_dotenv()

# MongoDB Connection URL
# MONGO_URL = "mongodb+srv://timepassaccofmine_db_user:pKQrwK5gylpe7PyO@cluster0.cgbrlog.mongodb.net/"
MONGO_URL = os.getenv("MONGO_URI")
DB_NAME = os.getenv("DB_NAME", "bom_optimization")  # fallback default

if not MONGO_URL:
    raise ValueError("MONGO_URI is missing in your .env file")

# Create a global Mongo client (singleton)
client = MongoClient(MONGO_URL)

# Select database
db = client["bom_optimization"]

# Expose collections
analysis_collection = db["analysis_results"]
bom_files_collection = db["bom_files"]
