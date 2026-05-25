from __future__ import annotations

import json
import shutil
import tempfile
import uuid
from pathlib import Path

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse

from .service import (
    default_legacy_bom_path,
    default_standard_library_path,
    get_mapping_job,
    record_mapping_decision,
    run_mapping_job,
)
from .status import PIPELINE_STATUS

router = APIRouter(prefix="/standard-part-mapping", tags=["standard-part-mapping"])


def _save_upload_to_temp(upload: UploadFile) -> Path:
    suffix = Path(upload.filename or "").suffix or ".xlsx"
    temp_dir = Path(tempfile.gettempdir()) / "optimerge_standard_part_mapping"
    temp_dir.mkdir(parents=True, exist_ok=True)
    temp_path = temp_dir / f"{uuid.uuid4()}{suffix}"
    with temp_path.open("wb") as buffer:
        shutil.copyfileobj(upload.file, buffer)
    return temp_path


@router.get("/status")
def get_status():
    return {"steps": PIPELINE_STATUS}


@router.post("/run")
async def run_mapping(
    legacy_file: UploadFile | None = File(None),
    standard_file: UploadFile | None = File(None),
):
    legacy_path = None
    standard_path = None

    try:
        if legacy_file is not None:
            legacy_path = _save_upload_to_temp(legacy_file)
        if standard_file is not None:
            standard_path = _save_upload_to_temp(standard_file)

        result = run_mapping_job(
            legacy_path=legacy_path or default_legacy_bom_path(),
            standard_path=standard_path or default_standard_library_path(),
            source_file_name=legacy_file.filename if legacy_file else None,
            standard_file_name=standard_file.filename if standard_file else None,
        )
        return result
    finally:
        for path in [legacy_path, standard_path]:
            if path and path.exists():
                try:
                    path.unlink()
                except OSError:
                    pass


@router.get("/jobs/{job_id}")
def read_job(job_id: str):
    job = get_mapping_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Mapping job not found")
    return job


@router.post("/jobs/{job_id}/decision")
def save_decision(
    job_id: str,
    source_row_key: str = Form(...),
    source_text: str = Form(...),
    selected_part_no: str = Form(...),
    reviewer: str | None = Form(None),
    confidence: str | None = Form(None),
    candidate_payload: str = Form("[]"),
):
    try:
        payload = json.loads(candidate_payload)
    except json.JSONDecodeError:
        payload = candidate_payload
    return record_mapping_decision(
        job_id=job_id,
        source_row_key=source_row_key,
        source_text=source_text,
        selected_part_no=selected_part_no,
        candidate_payload=payload,
        reviewer=reviewer,
        confidence=confidence,
    )


@router.get("/default-files")
def default_files():
    return {
        "standard_file": str(default_standard_library_path()),
        "legacy_file": str(default_legacy_bom_path()),
    }


@router.get("/jobs/{job_id}/export")
def export_job(job_id: str):
    job = get_mapping_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Mapping job not found")

    raw = job.get("raw_result") or {}
    results = raw.get("results") or []
    if not results:
        raise HTTPException(status_code=400, detail="No mapping results to export")

    import pandas as pd

    rows = []
    for record in results:
        rows.append(
            {
                "source_sheet": record.get("source_sheet"),
                "position": record.get("position"),
                "designation": record.get("designation"),
                "type_norm_designation": record.get("type_norm_designation"),
                "source_text": record.get("source_text"),
                "selected_part_no": record.get("selected_part_no"),
                "match_state": record.get("match_state"),
                "top_score": record.get("top_score"),
                "margin": record.get("margin"),
                "auto_accept": record.get("auto_accept"),
            }
        )

    export_dir = Path(tempfile.gettempdir()) / "optimerge_standard_part_mapping_exports"
    export_dir.mkdir(parents=True, exist_ok=True)
    output_path = export_dir / f"standard_part_mapping_{job_id}.xlsx"
    pd.DataFrame(rows).to_excel(output_path, index=False)
    return FileResponse(
        path=str(output_path),
        filename=output_path.name,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )

