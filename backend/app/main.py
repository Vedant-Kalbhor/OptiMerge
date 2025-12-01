from fastapi import FastAPI, UploadFile, File, HTTPException, Depends, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.security import OAuth2PasswordBearer
import pandas as pd
import os
import uuid
from datetime import datetime, timedelta
from typing import Optional

from pydantic import BaseModel, EmailStr
from jose import JWTError, jwt
from passlib.context import CryptContext
import logging

from .db import analysis_collection, users_collection, ensure_indexes

from bson import ObjectId

# Import the modularized functions
from .clustering_utils import (
    parse_weldment_excel,
    validate_weldment_data,
    perform_dimensional_clustering
)
from .bom_utils import (
    validate_bom_data,
    analyze_bom_data
)

app = FastAPI(title="BOM Optimization Tool", version="1.0.0")

# ==============================
# CORS middleware
# ==============================
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ==============================
# Auth / JWT configuration
# ==============================
SECRET_KEY = os.getenv("JWT_SECRET_KEY", "change-this-secret-in-production")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7  # 7 days
logger = logging.getLogger(__name__)
pwd_context = CryptContext(
    schemes=["argon2", "bcrypt", "pbkdf2_sha256"],
    deprecated="auto"
)

# Optional explicit fallback context for long inputs (supports arbitrary length)
_long_input_ctx = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")

BCRYPT_MAX_BYTES = 72
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")

def _utf8_byte_len(s: str) -> int:
    """Return number of bytes when string encoded in UTF-8."""
    return len(s.encode("utf-8"))

# --------- Pydantic schemas ---------
class UserBase(BaseModel):
    email: EmailStr
    full_name: Optional[str] = None


class UserCreate(UserBase):
    password: str


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserOut(UserBase):
    id: str
    is_active: bool = True


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class TokenData(BaseModel):
    email: Optional[str] = None


# --------- Auth utility functions ---------
def get_password_hash(password: str) -> str:
    """
    Hash the password safely.
    - If argon2 is available, CryptContext will use it and all is fine (supports any length).
    - If argon2 not available and password (utf-8) <= 72 bytes, bcrypt will be used (if available).
    - If password (utf-8) > 72 bytes we avoid calling bcrypt to prevent the ValueError and use a safe fallback (pbkdf2_sha256).
    """
    if _utf8_byte_len(password) > BCRYPT_MAX_BYTES:
        # Avoid bcrypt's 72-byte limit: choose a scheme that supports long inputs.
        logger.info("Password exceeds bcrypt 72-byte limit — using pbkdf2_sha256 to hash.")
        return _long_input_ctx.hash(password)

    # Otherwise let pwd_context pick (argon2 if present, else bcrypt if present, else pbkdf2_sha256)
    try:
        return pwd_context.hash(password)
    except Exception as exc:
        # Defensive: if hashing fails for any backend (rare), fallback to pbkdf2
        logger.exception("Primary password hash failed; falling back to pbkdf2_sha256.")
        return _long_input_ctx.hash(password)



def verify_password(plain_password: str, hashed_password: str) -> bool:
    """
    Verify a password against a hash. CryptContext will auto-detect the scheme from the hash string.
    We test against both contexts so we can verify hashes produced by either path.
    """
    try:
        return pwd_context.verify(plain_password, hashed_password)
    except Exception:
        # As a last resort try the long-input context (for pbkdf2 hashed values).
        try:
            return _long_input_ctx.verify(plain_password, hashed_password)
        except Exception:
            logger.exception("Password verification failed due to unexpected error.")
            return False


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt


def get_user_by_email(email: str) -> Optional[dict]:
    return users_collection.find_one({"email": email})


def authenticate_user(email: str, password: str) -> Optional[dict]:
    user = get_user_by_email(email)
    if not user:
        return None
    if not verify_password(password, user.get("hashed_password", "")):
        return None
    return user


async def get_current_user(token: str = Depends(oauth2_scheme)) -> dict:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials.",
        headers={"WWW-Authenticate": "Bearer"},
    )

    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub")
        if email is None:
            raise credentials_exception
        token_data = TokenData(email=email)
    except JWTError:
        raise credentials_exception

    user = get_user_by_email(token_data.email)
    if user is None:
        raise credentials_exception
    return user


# ==============================
# Auth endpoints
# ==============================
@app.post("/auth/signup", response_model=UserOut, status_code=status.HTTP_201_CREATED)
async def signup(user_in: UserCreate):
    existing = get_user_by_email(user_in.email)
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered.",
        )

    hashed_pw = get_password_hash(user_in.password)
    doc = {
        "email": user_in.email,
        "full_name": user_in.full_name,
        "hashed_password": hashed_pw,
        "is_active": True,
        "created_at": datetime.utcnow(),
    }

    result = users_collection.insert_one(doc)
    return UserOut(
        id=str(result.inserted_id),
        email=user_in.email,
        full_name=user_in.full_name,
        is_active=True,
    )


@app.post("/auth/login", response_model=Token)
async def login(user_in: UserLogin):
    user = authenticate_user(user_in.email, user_in.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password.",
        )

    access_token = create_access_token(data={"sub": user["email"]})
    return Token(access_token=access_token, token_type="bearer")


@app.get("/auth/me", response_model=UserOut)
async def read_current_user(current_user: dict = Depends(get_current_user)):
    return UserOut(
        id=str(current_user.get("_id")),
        email=current_user.get("email"),
        full_name=current_user.get("full_name"),
        is_active=current_user.get("is_active", True),
    )


# ==============================
# File uploads & analysis
# ==============================

# Create uploads directory
os.makedirs("uploads", exist_ok=True)
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")

# In-memory storage
weldment_data = {}
bom_data = {}
analysis_results = {}


def generate_file_id():
    return str(uuid.uuid4())


# -------------------------
# File upload endpoints
# -------------------------
@app.post("/upload/weldments/")
async def upload_weldments(file: UploadFile = File(...)):
    """Upload weldment dimensions file"""
    try:
        print(f"Processing weldment file: {file.filename}")

        # Validate file type
        if not file.filename.endswith(('.xlsx', '.xls', '.csv')):
            raise HTTPException(status_code=400, detail="Only Excel and CSV files are supported")

        file_path = f"uploads/{file.filename}"
        with open(file_path, "wb") as buffer:
            content = await file.read()
            buffer.write(content)

        # Read and parse the file
        if file.filename.endswith('.csv'):
            df = pd.read_csv(file_path)
            df.columns = [c for c in df.columns]
        else:
            df = parse_weldment_excel(file_path)

        # Validate and clean the data
        validated_data = validate_weldment_data(df)

        # Store the data
        file_id = generate_file_id()
        weldment_data[file_id] = {
            "filename": file.filename,
            "data": validated_data.to_dict('records'),
            "file_path": file_path,
            "columns": validated_data.columns.tolist(),
            "record_count": len(validated_data),
            "dataframe": validated_data  # Store the actual DataFrame for analysis
        }

        return {
            "message": "File uploaded successfully",
            "file_id": file_id,
            "record_count": len(validated_data),
            "columns": validated_data.columns.tolist()
        }

    except Exception as e:
        print(f"Error processing weldment file: {str(e)}")
        raise HTTPException(status_code=400, detail=f"Error processing file: {str(e)}")


@app.post("/upload/boms/")
async def upload_boms(file: UploadFile = File(...)):
    """Upload BOM file"""
    try:
        print(f"Processing BOM file: {file.filename}")

        # Validate file type
        if not file.filename.endswith(('.xlsx', '.xls', '.csv')):
            raise HTTPException(status_code=400, detail="Only Excel and CSV files are supported")

        file_path = f"uploads/{file.filename}"
        with open(file_path, "wb") as buffer:
            content = await file.read()
            buffer.write(content)

        # Read the file
        if file.filename.endswith('.csv'):
            df = pd.read_csv(file_path)
        else:
            try:
                xl = pd.ExcelFile(file_path)
                sheet_names = xl.sheet_names
                print(f"Available sheets: {sheet_names}")

                bom_sheets = [name for name in sheet_names if 'bom' in name.lower() or 'assy' in name.lower()]
                if bom_sheets:
                    df = pd.read_excel(file_path, sheet_name=bom_sheets[0])
                    print(f"Using sheet: {bom_sheets[0]}")
                else:
                    df = pd.read_excel(file_path)
            except Exception:
                df = pd.read_excel(file_path)

        print(f"Original BOM columns: {df.columns.tolist()}")
        print(f"BOM Data shape: {df.shape}")

        # Validate and clean the data (using bom_utils.validate_bom_data)
        validated_data = validate_bom_data(df)

        # Store the data
        file_id = generate_file_id()
        bom_data[file_id] = {
            "filename": file.filename,
            "data": validated_data.to_dict('records'),
            "file_path": file_path,
            "columns": validated_data.columns.tolist(),
            "record_count": len(validated_data),
            "dataframe": validated_data  # Store the actual DataFrame for analysis
        }

        return {
            "message": "BOM file uploaded successfully",
            "file_id": file_id,
            "record_count": len(validated_data),
            "columns": validated_data.columns.tolist()
        }

    except Exception as e:
        print(f"Error processing BOM file: {str(e)}")
        raise HTTPException(status_code=400, detail=f"Error processing file: {str(e)}")


@app.get("/files/weldments/")
async def get_weldment_files():
    """Get list of uploaded weldment files"""
    return [
        {
            "file_id": fid,
            "filename": data["filename"],
            "record_count": data["record_count"],
            "columns": data["columns"]
        }
        for fid, data in weldment_data.items()
    ]


@app.get("/files/boms/")
async def get_bom_files():
    """Get list of uploaded BOM files"""
    return [
        {
            "file_id": fid,
            "filename": data["filename"],
            "record_count": data["record_count"],
            "columns": data["columns"]
        }
        for fid, data in bom_data.items()
    ]


@app.get("/weldment-data/{file_id}")
async def get_weldment_data(file_id: str):
    """Get actual weldment data for visualization"""
    if file_id not in weldment_data:
        raise HTTPException(status_code=404, detail="Weldment file not found")

    return {
        "data": weldment_data[file_id]["data"],
        "columns": weldment_data[file_id]["columns"]
    }


# -------------------------
# Analysis endpoints (use modularized functions)
# -------------------------
@app.post("/analyze/dimensional-clustering/")
async def analyze_dimensional_clustering(request: dict):
    """Perform dimensional clustering analysis with PCA-based visualization"""
    try:
        weldment_file_id = request.get('weldment_file_id')
        clustering_method = request.get('clustering_method', 'kmeans')
        n_clusters = request.get('n_clusters')
        tolerance = request.get('tolerance', 0.1)

        if weldment_file_id not in weldment_data:
            raise HTTPException(status_code=404, detail="Weldment file not found")

        df = weldment_data[weldment_file_id]["dataframe"]

        # Call the clustering utility function to perform clustering
        clustering_result = perform_dimensional_clustering(
            df,
            clustering_method=clustering_method,
            n_clusters=n_clusters,
            tolerance=tolerance
        )

        analysis_id = generate_file_id()

        # Build stored result structure (same shape as before)
        analysis_results[analysis_id] = {
            "type": "clustering",
            "clustering": clustering_result,
            "bom_analysis": {
                "similar_pairs": [],
                "replacement_suggestions": []
            }
        }

        # Save to MongoDB (existing function in this file)
        save_analysis_to_mongodb(analysis_id, "Dimensional Clustering", analysis_results[analysis_id])

        return {
            "analysis_id": analysis_id,
            "clustering_result": analysis_results[analysis_id]["clustering"],
            "bom_analysis_result": analysis_results[analysis_id]["bom_analysis"]
        }

    except Exception as e:
        print(f"Clustering analysis failed: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Clustering analysis failed: {str(e)}")


@app.post("/analyze/bom-similarity/")
async def analyze_bom_similarity(request: dict):
    """Perform BOM similarity analysis with real data"""
    try:
        bom_file_id = request.get('bom_file_id')
        similarity_method = request.get('similarity_method', 'jaccard')
        threshold = request.get('threshold', 0.7)  # expected 0-1 from frontend

        if bom_file_id not in bom_data:
            raise HTTPException(status_code=404, detail="BOM file not found")

        # Get the actual DataFrame
        df = bom_data[bom_file_id]["dataframe"]

        print("=== Starting BOM Similarity Analysis ===")
        print(f"BOM data shape: {df.shape}")
        print(f"Assemblies found: {df['assembly_id'].unique()}")

        # Use bom_utils.analyze_bom_data (expects threshold in percentage)
        threshold_percent = threshold * 100 if threshold <= 1.0 else float(threshold)
        bom_result = analyze_bom_data(df, threshold=threshold_percent)

        analysis_id = generate_file_id()

        analysis_results_store = {
            "type": "bom_analysis",
            "clustering": {
                "clusters": bom_result.get("clusters", []),
                "metrics": {
                    "n_clusters": len(bom_result.get("clusters", [])),
                    "n_samples": len(df),
                    "silhouette_score": 0
                },
                "visualization_data": [],
                "numeric_columns": []
            },
            "bom_analysis": {
                "similarity_matrix": bom_result.get("similarity_matrix", {}),
                "similar_pairs": bom_result.get("similar_pairs", []),
                "replacement_suggestions": bom_result.get("replacement_suggestions", []),
                "component_replacement_table": bom_result.get("component_replacement_table", []),
                "bom_statistics": bom_result.get("bom_statistics", {}),
                "assembly_costs": bom_result.get("assembly_costs", {}),
                "unit_price_map": bom_result.get("unit_price_map", {}),
                "currency_map": bom_result.get("currency_map", {})
            }
        }

        analysis_results[analysis_id] = analysis_results_store

        # Save to MongoDB immediately
        save_analysis_to_mongodb(analysis_id, "BOM Similarity Analysis", analysis_results_store)

        return {
            "analysis_id": analysis_id,
            "clustering_result": analysis_results_store["clustering"],
            "bom_analysis_result": analysis_results_store["bom_analysis"]
        }

    except Exception as e:
        print(f"BOM analysis error: {str(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"BOM analysis failed: {str(e)}")


# -------------------------
# Storage / retrieval endpoints + helpers
# -------------------------
@app.get("/analysis/{analysis_id}")
async def get_analysis(analysis_id: str):
    """
    Return the stored analysis result *raw* object (the same shape the frontend expects).
    Fallback to in-memory 'analysis_results' if MongoDB document is not present.
    """
    # First try MongoDB
    try:
        analysis_doc = analysis_collection.find_one({"id": analysis_id})
    except Exception as e:
        analysis_doc = None
        logger.exception("Error querying MongoDB for analysis: %s", str(e))

    if analysis_doc:
        # Mongo DB document stores the raw result at 'raw' per save_analysis_to_mongodb
        raw = analysis_doc.get("raw") or analysis_doc.get("result") or analysis_doc
        # If the document itself is the raw structure, return it; otherwise, return the 'raw' payload.
        if isinstance(raw, dict) and ("bom_analysis" in raw or "clustering" in raw):
            return raw
        # If 'raw' isn't present, return the document but strip Mongo metadata
        analysis_doc["_id"] = str(analysis_doc["_id"])
        return analysis_doc

    # Fallback: check in-memory store
    if analysis_id in analysis_results:
        return analysis_results[analysis_id]

    raise HTTPException(status_code=404, detail="Analysis not found")


@app.get("/recent-analyses")
async def recent_analyses():
    docs = list(analysis_collection.find().sort("created_at", -1))
    for d in docs:
        d["_id"] = str(d["_id"])
    return docs


def save_analysis_to_mongodb(analysis_id: str, analysis_type: str, result: dict):
    """Save analysis result to MongoDB immediately after creation"""
    try:
        document = {
            "id": analysis_id,
            "type": analysis_type,
            "date": datetime.utcnow().strftime("%Y-%m-%d"),
            "status": "completed",
            "raw": result,
            "created_at": datetime.utcnow()
        }

        analysis_collection.replace_one(
            {"id": analysis_id},
            document,
            upsert=True
        )
        print(f"✅ Analysis {analysis_id} saved to MongoDB successfully")
    except Exception as e:
        print(f"❌ Error saving to MongoDB: {str(e)}")
        # don't raise so API still returns results even if Mongo fails


@app.post("/analyze/weldment-pairwise/")
async def analyze_weldment_pairwise(request: dict):
    """
    Perform one-to-one pairwise comparison on an uploaded weldment file.
    Now with support for handling groups of 3+ similar assemblies.
    """
    try:
        weldment_file_id = request.get('weldment_file_id')
        tolerance = float(request.get('tolerance', 1e-6))
        threshold = request.get('threshold', 0.3)
        include_self = bool(request.get('include_self', True))
        columns_to_compare_req = request.get('columns_to_compare', None)

        if weldment_file_id not in weldment_data:
            raise HTTPException(status_code=404, detail="Weldment file not found")

        df = weldment_data[weldment_file_id]["dataframe"]

        # ---------------------------------------------------
        # 1) Detect Cost & EAU columns (case-insensitive)
        # ---------------------------------------------------
        cost_col = None
        eau_col = None
        for col in df.columns:
            col_l = str(col).strip().lower()
            if col_l == "cost":
                cost_col = col
            if col_l == "eau":
                eau_col = col

        has_cost_data = cost_col is not None and eau_col is not None

        # ---------------------------------------------------
        # 2) Decide which columns to compare (ONLY geometry)
        # ---------------------------------------------------
        geometry_cols_set = {
            "total_height_of_packed_tower_mm",
            "packed_tower_outer_dia_mm",
            "packed_tower_inner_dia_mm",
            "upper_flange_outer_dia_mm",
            "upper_flange_inner_dia_mm",
            "lower_flange_outer_dia_mm",
            "spray_nozzle_center_distance",
            "spray_nozzle_id",
            "support_ring_height_from_bottom",
            "support_ring_id",
        }
        detected_geometry_cols = [c for c in df.columns if str(c) in geometry_cols_set]

        if columns_to_compare_req and isinstance(columns_to_compare_req, list):
            columns_to_compare = columns_to_compare_req
        elif detected_geometry_cols:
            columns_to_compare = detected_geometry_cols
        else:
            # fallback: let util decide
            columns_to_compare = None

        # ---------------------------------------------------
        # 3) Normalize threshold 0-1 → 0-100
        # ---------------------------------------------------
        threshold_percent = float(threshold)
        if threshold_percent <= 1.0:
            threshold_percent = threshold_percent * 100.0

        # ---------------------------------------------------
        # 4) Run pairwise comparison utility
        # ---------------------------------------------------
        from .clustering_utils import pairwise_variant_comparison

        result_df = pairwise_variant_comparison(
            df,
            key_col="assy_pn",
            columns_to_compare=columns_to_compare,
            tolerance=tolerance,
            threshold=threshold_percent,
            include_self=include_self
        )

        pairwise_records = []
        if not result_df.empty:
            for rec in result_df.to_dict(orient='records'):
                pairwise_records.append({
                    "bom_a": rec.get("Assembly A"),
                    "bom_b": rec.get("Assembly B"),
                    "match_percentage": float(rec.get("Match percentage") or 0.0),
                    "matching_columns": rec.get("matching_cols_list") or [],
                    "unmatching_columns": rec.get("unmatching_cols_list") or [],
                })

        # ---------------------------------------------------
        # 5) NEW LOGIC: Cost-savings with grouping for 3+ similar assemblies
        # ---------------------------------------------------
        cost_savings_block = {
            "has_cost_data": False,
            "rows": [],
            "statistics": {},
            "groups": []  # Track groups for debugging/display
        }

        if has_cost_data and len(pairwise_records) > 0:
            # Build lookup by assy_pn -> cost, eau
            cost_lookup = {}
            for _, row in df.iterrows():
                assy = row.get("assy_pn")
                if pd.isna(assy):
                    continue
                key = str(assy)
                try:
                    cost_val = float(row.get(cost_col, 0) or 0)
                except (TypeError, ValueError):
                    cost_val = 0.0
                try:
                    eau_val = float(row.get(eau_col, 0) or 0)
                except (TypeError, ValueError):
                    eau_val = 0.0

                cost_lookup[key] = {
                    "cost": cost_val,
                    "eau": eau_val
                }

            # Step 1: Find 100% matching pairs
            perfect_matches = []
            for rec in pairwise_records:
                match_pct = float(rec.get("match_percentage") or 0.0)
                if match_pct >= 99.95:  # Consider as 100%
                    a = str(rec.get("bom_a") or "")
                    b = str(rec.get("bom_b") or "")
                    if a and b and a in cost_lookup and b in cost_lookup:
                        perfect_matches.append((a, b))

            # Step 2: Build connected components (groups) of similar assemblies
            from collections import defaultdict
            
            # Build adjacency list
            adj = defaultdict(set)
            for a, b in perfect_matches:
                adj[a].add(b)
                adj[b].add(a)

            # Find connected components using DFS
            visited = set()
            groups = []

            def dfs(node, component):
                component.add(node)
                visited.add(node)
                for neighbor in adj[node]:
                    if neighbor not in visited:
                        dfs(neighbor, component)

            for node in adj:
                if node not in visited:
                    component = set()
                    dfs(node, component)
                    if len(component) > 1:  # Only groups with at least 2 assemblies
                        groups.append(component)

            # Step 3: Process each group
            rows_cs = []
            seen_replacements = set()  # Track which replacements we've already processed
            
            for group in groups:
                group_list = list(group)
                # Find the cheapest assembly in the group
                min_cost = float('inf')
                min_assy = None
                min_cost_data = None
                
                for assy in group_list:
                    if assy in cost_lookup:
                        cost = cost_lookup[assy]["cost"]
                        if cost < min_cost:
                            min_cost = cost
                            min_assy = assy
                            min_cost_data = cost_lookup[assy]
                
                if min_assy is None:
                    continue
                
                # Create replacement suggestions for all non-cheapest assemblies
                for assy in group_list:
                    if assy == min_assy:
                        continue  # Skip the cheapest one
                    
                    # Check if we've already processed this replacement
                    replacement_key = (assy, min_assy)
                    if replacement_key in seen_replacements:
                        continue
                    seen_replacements.add(replacement_key)
                    
                    old_data = cost_lookup.get(assy)
                    new_data = min_cost_data
                    
                    if not old_data or not new_data:
                        continue
                    
                    old_price = old_data["cost"]
                    new_price = new_data["cost"]
                    old_eau = old_data["eau"]  # Use EAU of the old assembly
                    
                    price_diff = old_price - new_price
                    
                    total_cost_before = old_price * old_eau
                    total_cost_after = new_price * old_eau
                    cost_saving = total_cost_before - total_cost_after
                    savings_percent = (price_diff / old_price) * 100.0 if old_price > 0 else 0.0
                    
                    rows_cs.append({
                        "bom_a": assy,  # Old assembly
                        "bom_b": min_assy,  # New assembly (cheapest)
                        "match_percentage": 100.0,
                        "cost_a": old_price,
                        "eau_a": old_eau,
                        "cost_b": new_price,
                        "eau_b": new_data["eau"],
                        "recommended_assembly": min_assy,
                        "recommended_cost": new_price,
                        "old_price": old_price,
                        "new_price": new_price,
                        "old_new_price": price_diff,
                        "effective_eau": old_eau,
                        "total_cost_before": total_cost_before,
                        "total_cost_after": total_cost_after,
                        "cost_savings": cost_saving,
                        "savings_percent": savings_percent,
                        "group_size": len(group_list),  # For debugging
                        "group_members": list(group_list)  # For debugging
                    })

            # Calculate statistics
            total_before = sum(r["total_cost_before"] for r in rows_cs)
            total_after = sum(r["total_cost_after"] for r in rows_cs)
            total_savings = sum(r["cost_savings"] for r in rows_cs)
            avg_savings_percent = (
                sum(r["savings_percent"] for r in rows_cs) / len(rows_cs)
                if rows_cs else 0.0
            )

            cost_savings_block = {
                "has_cost_data": bool(rows_cs),
                "rows": rows_cs,
                "statistics": {
                    "pair_count_100": len(rows_cs),
                    "total_cost_before": total_before,
                    "total_cost_after": total_after,
                    "total_cost_savings": total_savings,
                    "avg_savings_percent": avg_savings_percent,
                    "num_groups": len(groups)
                },
                "groups": [
                    {
                        "members": list(group),
                        "cheapest": min(list(group), key=lambda x: cost_lookup.get(x, {}).get("cost", float('inf'))) 
                        if cost_lookup else None
                    }
                    for group in groups
                ]
            }

        # ---------------------------------------------------
        # 6) Store + return
        # ---------------------------------------------------
        analysis_id = generate_file_id()
        analysis_store = {
            "type": "weldment_pairwise",
            "clustering": {
                "clusters": [],
                "metrics": {"n_clusters": 0, "n_samples": len(df), "silhouette_score": 0},
                "visualization_data": [],
                "numeric_columns": []
            },
            "weldment_pairwise": {
                "pairwise_table": pairwise_records,
                "parameters": {
                    "threshold_percent": threshold_percent,
                    "tolerance": tolerance,
                    "include_self": include_self,
                    "columns_compared": columns_to_compare,
                },
                "statistics": {"pair_count": len(pairwise_records)},
                "cost_savings": cost_savings_block
            },
            "bom_analysis": {
                "similar_pairs": [],
                "replacement_suggestions": []
            }
        }

        analysis_results[analysis_id] = analysis_store
        save_analysis_to_mongodb(analysis_id, "Weldment Pairwise Comparison", analysis_store)

        return {
            "analysis_id": analysis_id,
            "clustering_result": analysis_store["clustering"],
            "weldment_pairwise_result": analysis_store["weldment_pairwise"],
            "bom_analysis_result": analysis_store["bom_analysis"]
        }

    except HTTPException:
        raise
    except Exception as e:
        print("Weldment pairwise analysis error:", str(e))
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Weldment pairwise analysis failed: {str(e)}")

@app.get("/")
async def root():
    return {"message": "BOM Optimization Tool API", "status": "running"}


@app.get("/health")
async def health_check():
    return {"status": "healthy", "timestamp": pd.Timestamp.now().isoformat()}

@app.on_event("startup")
def on_startup():
  # Try to create indexes; failure will be logged but not crash the app
  ensure_indexes()


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
