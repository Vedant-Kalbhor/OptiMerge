# /mnt/data/main.py
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import pandas as pd
import os
import uuid
from datetime import datetime
from .db import analysis_collection
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

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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
        threshold_percent = threshold * 100
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
                "bom_statistics": bom_result.get("bom_statistics", {})
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
    # Look by id in MongoDB collection
    print(analysis_id)
    analysis = analysis_collection.find_one({"id": analysis_id})
    if not analysis:
        raise HTTPException(status_code=404, detail="Analysis not found")

    analysis["_id"] = str(analysis["_id"])
    return analysis


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

# --- add near other analyze endpoints in main.py ---

@app.post("/analyze/weldment-pairwise/")
async def analyze_weldment_pairwise(request: dict):
    """
    Perform one-to-one pairwise comparison on an uploaded weldment file.
    Accepts:
      - weldment_file_id (str) required
      - tolerance (float) optional (defaults 1e-6)
      - threshold (float) optional (0-1 or 0-100) filter for minimum match% (defaults 0.3)
      - include_self (bool) optional (defaults False)
      - columns_to_compare (list) optional
    """
    try:
        weldment_file_id = request.get('weldment_file_id')
        tolerance = float(request.get('tolerance', 1e-6))
        threshold = request.get('threshold', 0.3)
        include_self = bool(request.get('include_self', True))
        columns_to_compare = request.get('columns_to_compare', None)

        if weldment_file_id not in weldment_data:
            raise HTTPException(status_code=404, detail="Weldment file not found")

        df = weldment_data[weldment_file_id]["dataframe"]

        # normalize threshold: if user sent 0-1 convert to 0-100
        threshold_percent = float(threshold)
        if threshold_percent <= 1.0:
            threshold_percent = threshold_percent * 100.0

        # Use pairwise comparison util
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
                    "matching_columns_letters": rec.get("Matching Columns") or "",
                    "unmatching_columns_letters": rec.get("Unmatching") or ""
                })

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
                    "include_self": include_self
                },
                "statistics": {"pair_count": len(pairwise_records)}
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


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
