import os
from sqlalchemy import create_engine
from dotenv import load_dotenv
import pymysql

print(f"Working Directory: {os.getcwd()}")
print(f"Files in directory: {os.listdir('.')}")

if os.path.exists('.env'):
    print(".env found")
    load_dotenv()
else:
    print(".env NOT found in current directory")

url = os.getenv("MYSQL_URI")
print(f"URL value: {url}")

if not url:
    print("MYSQL_URI is None!")
else:
    try:
        engine = create_engine(url)
        print("SQLAlchemy create_engine success!")
        with engine.connect() as conn:
            print("Database connection success!")
    except Exception as e:
        print(f"SQLAlchemy Error: {e}")
