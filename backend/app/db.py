# db.py
from sqlalchemy import (
    create_engine, Column, String, Text, DateTime, Boolean, UniqueConstraint
)
from sqlalchemy.orm import declarative_base, sessionmaker
from sqlalchemy.exc import SQLAlchemyError
from dotenv import load_dotenv
from datetime import datetime
import os
import json
import uuid

load_dotenv()

# ── Connection ────────────────────────────────────────────────────────────────
SQL_URL = os.getenv("PGSQL_URI")   
DB_NAME   = os.getenv("DB_NAME", "optimerge")

if not SQL_URL:
    raise ValueError("SQL_URI is missing in your .env file")

engine = create_engine(
    # MYSQL_URL,
    SQL_URL,
    pool_size=10,
    max_overflow=20,
    pool_pre_ping=True,
    echo=False,
    connect_args={"sslmode": "require"}, # For NeonDB
)

SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False)
Base = declarative_base()


# ── ORM Models ────────────────────────────────────────────────────────────────
class AnalysisResult(Base):
    __tablename__ = "analysis_results"

    id         = Column(String(36),  primary_key=True)       # UUID string
    type       = Column(String(128), nullable=False)
    date       = Column(String(10),  nullable=False)         # "YYYY-MM-DD"
    status     = Column(String(32),  nullable=False, default="completed")
    # raw = Column(Text(16777215), nullable=True) # BEFORE (MySQL MEDIUMTEXT)
    raw = Column(Text, nullable=True) # AFTER (PostgreSQL — plain Text is unlimited)
    created_at = Column(DateTime, default=datetime.utcnow)


class User(Base):
    __tablename__ = "users"

    id               = Column(String(36),  primary_key=True)
    email            = Column(String(255), nullable=False, unique=True)
    full_name        = Column(String(255), nullable=True)
    hashed_password  = Column(String(512), nullable=False)
    is_active        = Column(Boolean,     default=True)
    created_at       = Column(DateTime,    default=datetime.utcnow)

    __table_args__ = (UniqueConstraint("email", name="uq_users_email"),)


# class BomFile(Base):
#     __tablename__ = "bom_files"

#     id         = Column(String(36),  primary_key=True)
#     filename   = Column(String(512), nullable=False)
#     created_at = Column(DateTime,    default=datetime.utcnow)


# ── Cursor mimic (supports .sort() chaining used in recent_analyses) ──────────
class _Cursor:
    """
    Mimics a MongoDB cursor.
    Supports: list(...), iteration, and .sort(key, direction)
    direction: 1 = ascending, -1 = descending  (same as pymongo)
    """
    def __init__(self, docs: list):
        self._docs = docs

    def sort(self, key: str, direction: int = 1) -> "_Cursor":
        reverse = (direction == -1)
        self._docs = sorted(
            self._docs,
            key=lambda d: (d.get(key) is None, d.get(key) or datetime.min),
            reverse=reverse
        )
        return self  # chainable

    def __iter__(self):
        return iter(self._docs)

    def __len__(self):
        return len(self._docs)


# ── _AnalysisCollection ───────────────────────────────────────────────────────
class _AnalysisCollection:
    """
    Drop-in replacement for MongoDB analysis_collection.
    Supports:
      - replace_one(filter, document, upsert=True)   ← save_analysis_to_mongodb
      - find_one({"id": analysis_id})                ← get_analysis endpoint
      - find().sort("created_at", -1)                ← recent_analyses endpoint
    """

    @staticmethod
    def _serialize_raw(raw_val) -> str | None:
        """Safely serialize any dict/list to JSON string for storage."""
        if raw_val is None:
            return None
        try:
            return json.dumps(raw_val, default=str)
        except (TypeError, ValueError):
            return str(raw_val)

    @staticmethod
    def _deserialize_raw(raw_str: str | None):
        """Parse stored JSON string back to dict/list."""
        if not raw_str:
            return None
        try:
            return json.loads(raw_str)
        except (ValueError, TypeError):
            return raw_str

    @staticmethod
    def _to_dict(obj: AnalysisResult) -> dict:
        return {
            "_id":        obj.id,
            "id":         obj.id,
            "type":       obj.type,
            "date":       obj.date,
            "status":     obj.status,
            "raw":        _AnalysisCollection._deserialize_raw(obj.raw),
            "created_at": obj.created_at,
        }

    def replace_one(self, filter_: dict, document: dict, upsert: bool = False):
        """
        Called by save_analysis_to_mongodb:
            analysis_collection.replace_one({"id": analysis_id}, document, upsert=True)
        """
        record_id = filter_.get("id") or document.get("id")
        if not record_id:
            raise ValueError("replace_one: 'id' must be present in filter or document")

        raw_str = self._serialize_raw(document.get("raw"))

        with SessionLocal() as session:
            existing = session.get(AnalysisResult, record_id)
            if existing:
                # Update every field that is present in the document
                existing.type       = document.get("type",       existing.type)
                existing.date       = document.get("date",       existing.date)
                existing.status     = document.get("status",     existing.status)
                existing.raw        = raw_str
                existing.created_at = document.get("created_at", existing.created_at)
            elif upsert:
                obj = AnalysisResult(
                    id         = record_id,
                    type       = document.get("type",   ""),
                    date       = document.get("date",   ""),
                    status     = document.get("status", "completed"),
                    raw        = raw_str,
                    created_at = document.get("created_at", datetime.utcnow()),
                )
                session.add(obj)
            session.commit()

    def find_one(self, filter_: dict) -> dict | None:
        """
        Called by get_analysis:
            analysis_collection.find_one({"id": analysis_id})
        """
        record_id = filter_.get("id")
        if not record_id:
            return None
        with SessionLocal() as session:
            obj = session.get(AnalysisResult, record_id)
            return self._to_dict(obj) if obj else None

    def find(self, filter_: dict | None = None) -> _Cursor:
        """
        Called by recent_analyses:
            list(analysis_collection.find().sort("created_at", -1))

        Returns a _Cursor so .sort() can be chained before list() conversion.
        """
        with SessionLocal() as session:
            query = session.query(AnalysisResult)
            # Basic equality filtering (extend if needed)
            if filter_:
                for key, value in filter_.items():
                    if hasattr(AnalysisResult, key):
                        query = query.filter(getattr(AnalysisResult, key) == value)
            rows = query.all()
            return _Cursor([self._to_dict(r) for r in rows])


# ── _UsersCollection ──────────────────────────────────────────────────────────
class _UsersCollection:
    """
    Drop-in replacement for MongoDB users_collection.
    Supports:
      - find_one({"email": email})   ← get_user_by_email (used in login, get_current_user)
      - insert_one(document)         ← signup endpoint; returns object with .inserted_id
      - create_index(...)            ← called by ensure_indexes (no-op here, index is in ORM)
    """

    @staticmethod
    def _to_dict(obj: User) -> dict:
        return {
            "_id":             obj.id,
            "id":              obj.id,
            "email":           obj.email,
            "full_name":       obj.full_name,
            "hashed_password": obj.hashed_password,
            "is_active":       obj.is_active,
            "created_at":      obj.created_at,
        }

    def find_one(self, filter_: dict) -> dict | None:
        """
        Called as: users_collection.find_one({"email": email})
        """
        email = filter_.get("email")
        if not email:
            return None
        with SessionLocal() as session:
            obj = session.query(User).filter_by(email=email).first()
            return self._to_dict(obj) if obj else None

    def insert_one(self, document: dict):
        """
        Called in signup:
            result = users_collection.insert_one(doc)
            return UserOut(id=str(result.inserted_id), ...)

        Returns an object with .inserted_id (the new user's UUID string).
        """
        new_id = str(uuid.uuid4())
        with SessionLocal() as session:
            obj = User(
                id              = new_id,
                email           = document["email"],
                full_name       = document.get("full_name"),
                hashed_password = document["hashed_password"],
                is_active       = document.get("is_active", True),
                created_at      = document.get("created_at", datetime.utcnow()),
            )
            session.add(obj)
            session.commit()

        # Return a simple result object that has .inserted_id — mirrors pymongo InsertOneResult
        class _InsertResult:
            inserted_id = new_id

        return _InsertResult()

    def create_index(self, field: str, unique: bool = False):
        """No-op — index is already declared in the ORM model."""
        pass


# ── Public singletons ─────────────────────────────────────────────────────────
# These names are imported directly in main.py:
#   from db import analysis_collection, users_collection, ensure_indexes
analysis_collection  = _AnalysisCollection()
users_collection     = _UsersCollection()
# bom_files_collection = None   # add _BomFilesCollection if you need it later


# ── Schema creation ───────────────────────────────────────────────────────────
def ensure_indexes():
    """
    Called from FastAPI @app.on_event("startup").
    Creates all tables if they don't exist yet.
    """
    try:
        Base.metadata.create_all(bind=engine)
        print("✅ MySQL tables ensured (analysis_results, users, bom_files)")
    except SQLAlchemyError as e:
        print(f"⚠️  Warning: could not create MySQL tables: {e}")