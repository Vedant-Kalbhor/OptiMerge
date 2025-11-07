from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from fastapi.responses import JSONResponse
import pandas as pd
from io import BytesIO
from preprocess import preprocess_weldment_file
from ml_pipeline import run_clustering

router = APIRouter()


@router.post('/upload/weldments')
async def upload_weldments(file: UploadFile = File(...)):
    if not file.filename.endswith((".xlsx", ".csv")):
        raise HTTPException(status_code=400, detail="Upload .xlsx or .csv files")

    data = await file.read()
    try:
        if file.filename.endswith('.xlsx'):
            df = pd.read_excel(BytesIO(data))
        else:
            df = pd.read_csv(BytesIO(data))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to parse file: {e}")

    cleaned = preprocess_weldment_file(df)
    return JSONResponse({"rows": len(cleaned), "columns": cleaned.columns.tolist()})


@router.post('/analyze/clustering')
async def analyze_clustering(
    file: UploadFile = File(...),
    algorithm: str = Form('hdbscan')
):
    # Read file
    data = await file.read()
    if file.filename.endswith('.xlsx'):
        df = pd.read_excel(BytesIO(data))
    else:
        df = pd.read_csv(BytesIO(data))

    processed, meta = preprocess_weldment_file(df, return_meta=True)
    cluster_result = run_clustering(processed, algorithm=algorithm)

    # cluster_result contains cluster labels, representative mapping, and metrics
    return cluster_result
