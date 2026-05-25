from __future__ import annotations

import json
import uuid
from pathlib import Path
from typing import Dict, Optional

import pandas as pd

from .parsers import load_legacy_bom, load_standard_library
from .matcher import match_legacy_bom, normalize_text
from .status import PIPELINE_STATUS
from ..db import (
    SessionLocal,
    StandardPartLibraryEntry,
    StandardPartMappingDecision,
    StandardPartMappingJob,
    VendorAlias,
    ensure_indexes,
)


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[3]


def default_standard_library_path() -> Path:
    return _repo_root() / "backend" / "Standard data.xlsx"


def default_legacy_bom_path() -> Path:
    return _repo_root() / "backend" / "Legacy BOM.xlsx"


def _serialize(value) -> str:
    return json.dumps(value, default=str, ensure_ascii=False)


def _deserialize(value: Optional[str]):
    if not value:
        return None
    try:
        return json.loads(value)
    except Exception:
        return value


def _persist_standard_library(standard_df: pd.DataFrame, source_name: str) -> int:
    created = 0
    with SessionLocal() as session:
        for _, row in standard_df.iterrows():
            exists = (
                session.query(StandardPartLibraryEntry)
                .filter_by(part_no=row["part_no"], sheet_name=row["sheet_name"])
                .first()
            )
            payload = row.to_dict()
            if exists:
                exists.family = row["family"]
                exists.normalized_name = row["normalized_name"]
                exists.thread_m = row["thread_m"]
                exists.length_mm = row["length_mm"]
                exists.standard_reference = row["standard_reference"]
                exists.material = row["material"]
                exists.surface_treatment = row["surface_treatment"]
                exists.raw_payload = _serialize(payload)
            else:
                session.add(
                    StandardPartLibraryEntry(
                        id=str(uuid.uuid4()),
                        sheet_name=row["sheet_name"],
                        part_no=row["part_no"],
                        family=row["family"],
                        normalized_name=row["normalized_name"],
                        thread_m=row["thread_m"],
                        length_mm=row["length_mm"],
                        standard_reference=row["standard_reference"],
                        material=row["material"],
                        surface_treatment=row["surface_treatment"],
                        raw_payload=_serialize(payload),
                    )
                )
                created += 1
        session.commit()
    return created


def _persist_job(job_id: str, source_file: str, standard_file: str, result: Dict[str, object]) -> None:
    with SessionLocal() as session:
        job = session.get(StandardPartMappingJob, job_id)
        if job is None:
            job = StandardPartMappingJob(
                id=job_id,
                source_file=source_file,
                standard_file=standard_file,
                status="completed",
                summary=_serialize(result.get("summary", {})),
                raw_result=_serialize(result),
            )
            session.add(job)
        else:
            job.source_file = source_file
            job.standard_file = standard_file
            job.status = "completed"
            job.summary = _serialize(result.get("summary", {}))
            job.raw_result = _serialize(result)
        session.commit()


def _load_learned_aliases(session) -> Dict[str, str]:
    aliases = session.query(VendorAlias).all()
    return {normalize_text(alias.alias_text): alias.selected_part_no for alias in aliases if alias.selected_part_no}


def run_mapping_job(
    legacy_path: Optional[str | Path] = None,
    standard_path: Optional[str | Path] = None,
    source_file_name: Optional[str] = None,
    standard_file_name: Optional[str] = None,
) -> Dict[str, object]:
    ensure_indexes()
    standard_path = Path(standard_path) if standard_path else default_standard_library_path()
    legacy_path = Path(legacy_path) if legacy_path else default_legacy_bom_path()

    standard_df = load_standard_library(standard_path)
    legacy_df = load_legacy_bom(legacy_path)

    _persist_standard_library(standard_df, source_name=str(standard_path))

    with SessionLocal() as session:
        learned_aliases = _load_learned_aliases(session)

    mapping = match_legacy_bom(legacy_df, standard_df, learned_aliases=learned_aliases)
    job_id = str(uuid.uuid4())
    result = {
        "job_id": job_id,
        "status": "completed",
        "standard_library": {
            "source_file": str(standard_path),
            "rows": len(standard_df),
            "families": sorted([str(v) for v in standard_df["family"].dropna().unique().tolist()]) if not standard_df.empty else [],
        },
        "legacy_bom": {
            "source_file": str(legacy_path),
            "rows": len(legacy_df),
            "sheets": legacy_df["source_sheet"].dropna().unique().tolist() if not legacy_df.empty else [],
        },
        "summary": mapping["summary"],
        "results": mapping["results"],
        "auto_matched_rows": mapping["auto_matched_rows"],
        "review_queue": mapping["review_queue"],
        "unmatched_rows": mapping["unmatched_rows"],
        "pipeline_status": PIPELINE_STATUS,
    }

    _persist_job(
        job_id=job_id,
        source_file=source_file_name or str(legacy_path.name),
        standard_file=standard_file_name or str(standard_path.name),
        result=result,
    )
    return result


def get_mapping_job(job_id: str) -> Optional[Dict[str, object]]:
    with SessionLocal() as session:
        job = session.get(StandardPartMappingJob, job_id)
        if not job:
            return None
        return {
            "id": job.id,
            "source_file": job.source_file,
            "standard_file": job.standard_file,
            "status": job.status,
            "summary": _deserialize(job.summary) or {},
            "raw_result": _deserialize(job.raw_result) or {},
            "created_at": job.created_at,
            "updated_at": job.updated_at,
        }


def record_mapping_decision(
    job_id: str,
    source_row_key: str,
    source_text: str,
    selected_part_no: str,
    candidate_payload: object,
    reviewer: Optional[str] = None,
    confidence: Optional[str] = None,
) -> Dict[str, object]:
    candidate_json = _serialize(candidate_payload)
    alias_key = normalize_text(source_text)

    with SessionLocal() as session:
        decision = StandardPartMappingDecision(
            id=str(uuid.uuid4()),
            job_id=job_id,
            source_row_key=source_row_key,
            source_text=source_text,
            selected_part_no=selected_part_no,
            candidate_payload=candidate_json,
            reviewer=reviewer,
            confidence=confidence,
        )
        session.add(decision)

        alias = session.query(VendorAlias).filter_by(alias_text=alias_key).first()
        if alias:
            alias.normalized_term = alias_key
            alias.selected_part_no = selected_part_no
            alias.source_row_key = source_row_key
        else:
            session.add(
                VendorAlias(
                    id=str(uuid.uuid4()),
                    alias_text=alias_key,
                    normalized_term=alias_key,
                    selected_part_no=selected_part_no,
                    source_row_key=source_row_key,
                )
            )

        session.commit()

    return {
        "job_id": job_id,
        "source_row_key": source_row_key,
        "selected_part_no": selected_part_no,
        "saved": True,
    }
