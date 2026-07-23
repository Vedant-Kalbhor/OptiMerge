from __future__ import annotations

import re
from dataclasses import dataclass, asdict
from difflib import SequenceMatcher
from typing import Dict, List, Optional, Tuple

import pandas as pd


FAMILY_ALIASES = {
    "shcs": "hex_socket_screw",
    "allen bolt": "hex_socket_screw",
    "hex sock": "hex_socket_screw",
    "hex socket screw": "hex_socket_screw",
    "socket screw": "hex_socket_screw",
    "zylinderkopfschraube": "hex_socket_screw",
    "cap screw": "hex_socket_screw",
    "hex head screw": "hex_head_screw",
    "hex head": "hex_head_screw",
    "sechskantschraube": "hex_head_screw",
    "6kt": "hex_head_screw",
    "flat head cap screw": "flat_head_cap_screw",
    "countersunk screw": "flat_head_cap_screw",
    "flat head screw": "flat_head_cap_screw",
}

STANDARD_REF_TO_FAMILY = {
    "din 912": "hex_socket_screw",
    "iso 4762": "hex_socket_screw",
    "din 7991": "flat_head_cap_screw",
    "iso 10642": "flat_head_cap_screw",
    "din 931": "hex_head_screw",
    "iso 4014": "hex_head_screw",
    "din 933": "hex_head_screw",
    "iso 4017": "hex_head_screw",
}


def _clean_text(value) -> str:
    if value is None:
        return ""
    try:
        import pandas as pd
        if pd.isna(value):
            return ""
    except Exception:
        pass
    text = str(value).strip()
    if not text:
        return ""
    if text.lower() == "nan":
        return ""
    text = text.replace("\r", " ").replace("\n", " ")
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def normalize_text(value) -> str:
    text = _clean_text(value).lower()
    if not text:
        return ""
    text = text.replace("×", "x")
    text = text.replace("/", " ")
    text = text.replace("-", " ")
    text = text.replace(".", " ")
    text = text.replace(",", " ")
    text = text.replace("_", " ")
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def canonical_family_from_text(text: str) -> Optional[str]:
    normalized = normalize_text(text)
    if not normalized:
        return None
    for alias, family in FAMILY_ALIASES.items():
        if alias in normalized:
            return family
    for standard_ref, family in STANDARD_REF_TO_FAMILY.items():
        if standard_ref in normalized:
            return family
    return None


def canonical_family_from_standard_row(row: pd.Series) -> str:
    family = _clean_text(row.get("family")).strip().lower()
    if family:
        return family
    normalized_name = normalize_text(row.get("normalized_name"))
    detected = canonical_family_from_text(normalized_name)
    return detected or "other"


def extract_part_signature(text: str) -> Dict[str, Optional[str]]:
    normalized = normalize_text(text)
    family = canonical_family_from_text(normalized)

    thread = None
    length = None
    standard_ref = None
    material = None
    surface = None

    standard_patterns = [
        r"\b(din\s*912|iso\s*4762)\b",
        r"\b(din\s*7991|iso\s*10642)\b",
        r"\b(din\s*931|iso\s*4014)\b",
        r"\b(din\s*933|iso\s*4017)\b",
    ]
    for pattern in standard_patterns:
        match = re.search(pattern, normalized)
        if match:
            standard_ref = re.sub(r"\s+", " ", match.group(1)).strip()
            break

    metric_match = re.search(r"\bm\s*(\d+(?:[.,]\d+)?)\s*(?:x|\s)\s*(\d+(?:[.,]\d+)?)\b", normalized)
    if metric_match:
        thread = metric_match.group(1).replace(",", ".")
        length = metric_match.group(2).replace(",", ".")
    else:
        thread_only = re.search(r"\bm\s*(\d+(?:[.,]\d+)?)\b", normalized)
        if thread_only:
            thread = thread_only.group(1).replace(",", ".")
        length_match = re.search(r"\bl\s*(\d+(?:[.,]\d+)?)\b", normalized)
        if length_match:
            length = length_match.group(1).replace(",", ".")

    if any(token in normalized for token in ["a2", "a4", "stainless", "inox"]):
        material = "stainless"
    elif any(token in normalized for token in ["8 8", "8.8", "10 9", "10.9", "12 9", "12.9"]):
        material = "property_class"

    if any(token in normalized for token in ["zinc", "zinc coated", "verzinkt", "fzb", "galvanized", "oiled", "black", "untreated"]):
        surface = normalized

    return {
        "raw_text": text,
        "normalized_text": normalized,
        "family": family,
        "thread_m": thread,
        "length_mm": length,
        "standard_reference": standard_ref,
        "material_hint": material,
        "surface_hint": surface,
    }


def _token_similarity(a: str, b: str) -> float:
    if not a and not b:
        return 1.0
    return SequenceMatcher(None, a, b).ratio()


def _float_text(value: Optional[str]) -> str:
    if value is None:
        return ""
    text = _clean_text(value)
    if not text:
        return ""
    return text.replace(",", ".")


def score_candidate(source_signature: Dict[str, Optional[str]], candidate: pd.Series) -> Dict[str, float]:
    candidate_family = canonical_family_from_standard_row(candidate)
    candidate_text = normalize_text(candidate.get("normalized_name") or candidate.get("part_no"))
    candidate_standard_ref = normalize_text(candidate.get("standard_reference"))
    candidate_thread = _float_text(candidate.get("thread_m"))
    candidate_length = _float_text(candidate.get("length_mm"))
    candidate_material = normalize_text(candidate.get("material"))
    candidate_surface = normalize_text(candidate.get("surface_treatment"))

    score = 0.0
    detail = {
        "standard_reference": 0.0,
        "family": 0.0,
        "thread": 0.0,
        "length": 0.0,
        "material": 0.0,
        "surface": 0.0,
        "text": 0.0,
    }

    source_ref = normalize_text(source_signature.get("standard_reference") or "")
    source_family = source_signature.get("family") or ""
    source_thread = _float_text(source_signature.get("thread_m"))
    source_length = _float_text(source_signature.get("length_mm"))
    source_material = normalize_text(source_signature.get("material_hint") or "")
    source_surface = normalize_text(source_signature.get("surface_hint") or "")
    source_text = source_signature.get("normalized_text") or ""

    if source_ref and candidate_standard_ref and source_ref == candidate_standard_ref:
        detail["standard_reference"] = 40.0
        score += detail["standard_reference"]
    elif source_ref and candidate_standard_ref and source_ref in candidate_standard_ref:
        detail["standard_reference"] = 28.0
        score += detail["standard_reference"]

    if source_family and source_family == candidate_family:
        detail["family"] = 20.0
        score += detail["family"]

    if source_thread and candidate_thread and source_thread == candidate_thread:
        detail["thread"] = 20.0
        score += detail["thread"]

    if source_length and candidate_length and source_length == candidate_length:
        detail["length"] = 12.0
        score += detail["length"]

    if source_material and candidate_material and source_material in candidate_material:
        detail["material"] = 4.0
        score += detail["material"]

    if source_surface and candidate_surface and source_surface in candidate_surface:
        detail["surface"] = 4.0
        score += detail["surface"]

    text_similarity = _token_similarity(source_text, candidate_text) * 10.0
    detail["text"] = round(text_similarity, 4)
    score += text_similarity

    return {"score": round(score, 4), **{f"{k}_score": round(v, 4) for k, v in detail.items()}}


def shortlist_candidates(
    standard_df: pd.DataFrame,
    source_signature: Dict[str, Optional[str]],
    max_candidates: int = 5,
) -> pd.DataFrame:
    candidates = standard_df.copy()

    source_ref = normalize_text(source_signature.get("standard_reference") or "")
    source_family = source_signature.get("family")
    source_thread = _float_text(source_signature.get("thread_m"))
    source_length = _float_text(source_signature.get("length_mm"))

    has_hint = bool(source_ref or source_family or source_thread)
    if not has_hint:
        return standard_df.iloc[0:0].copy()

    if source_ref:
        candidates = candidates[
            candidates["standard_reference"].fillna("").astype(str).str.lower().str.contains(source_ref, regex=False)
        ]

    if source_family:
        family_matches = candidates["family"].fillna("").astype(str).str.lower() == source_family
        if family_matches.any():
            candidates = candidates[family_matches]

    if source_thread:
        thread_matches = candidates["thread_m"].fillna("").astype(str).str.replace(",", ".", regex=False) == source_thread
        if thread_matches.any():
            candidates = candidates[thread_matches]

    if source_length:
        length_matches = candidates["length_mm"].fillna("").astype(str).str.replace(",", ".", regex=False) == source_length
        if length_matches.any():
            candidates = candidates[length_matches]

    if candidates.empty:
        relaxed = standard_df.copy()
        if source_family:
            family_matches = relaxed["family"].fillna("").astype(str).str.lower() == source_family
            if family_matches.any():
                relaxed = relaxed[family_matches]
        elif source_ref:
            ref_matches = relaxed["standard_reference"].fillna("").astype(str).str.lower().str.contains(source_ref, regex=False)
            if ref_matches.any():
                relaxed = relaxed[ref_matches]
        elif source_thread:
            thread_matches = relaxed["thread_m"].fillna("").astype(str).str.replace(",", ".", regex=False) == source_thread
            if thread_matches.any():
                relaxed = relaxed[thread_matches]
        candidates = relaxed if not relaxed.empty else standard_df.iloc[0:0].copy()

    candidates = candidates.head(max_candidates * 10).reset_index(drop=True)
    return candidates


def match_row(
    source_row: pd.Series,
    standard_df: pd.DataFrame,
    learned_aliases: Optional[Dict[str, str]] = None,
    max_candidates: int = 5,
) -> Dict[str, object]:
    source_text = source_row.get("source_text") or " ".join(
        part for part in [
            source_row.get("designation"),
            source_row.get("type_norm_designation"),
            source_row.get("drawing_no"),
            source_row.get("manufacturer"),
            source_row.get("order_no"),
            source_row.get("sap_part_no"),
        ] if part
    )

    source_signature = extract_part_signature(source_text)
    if learned_aliases:
        alias_key = normalize_text(source_text)
        alias_target = learned_aliases.get(alias_key)
        if alias_target:
            source_signature["learned_part_no"] = alias_target

    candidate_pool = shortlist_candidates(standard_df, source_signature, max_candidates=max_candidates)

    scored_rows: List[dict] = []
    for _, candidate in candidate_pool.iterrows():
        scored = score_candidate(source_signature, candidate)
        candidate_dict = candidate.to_dict()
        scored_rows.append(
            {
                "part_no": candidate_dict.get("part_no"),
                "family": candidate_dict.get("family"),
                "normalized_name": candidate_dict.get("normalized_name"),
                "thread_m": candidate_dict.get("thread_m"),
                "length_mm": candidate_dict.get("length_mm"),
                "standard_reference": candidate_dict.get("standard_reference"),
                "material": candidate_dict.get("material"),
                "surface_treatment": candidate_dict.get("surface_treatment"),
                "score": scored["score"],
                "score_breakdown": {
                    "standard_reference": scored["standard_reference_score"],
                    "family": scored["family_score"],
                    "thread": scored["thread_score"],
                    "length": scored["length_score"],
                    "material": scored["material_score"],
                    "surface": scored["surface_score"],
                    "text": scored["text_score"],
                },
            }
        )

    scored_rows.sort(key=lambda item: item["score"], reverse=True)
    top_candidates = scored_rows[:max_candidates]

    top_score = top_candidates[0]["score"] if top_candidates else 0.0
    second_score = top_candidates[1]["score"] if len(top_candidates) > 1 else 0.0
    margin = round(top_score - second_score, 4)
    auto_accept = bool(top_candidates) and top_score >= 90.0 and margin >= 7.0
    selected = top_candidates[0] if auto_accept and top_candidates else None

    return {
        "source_row_key": f"{source_row.get('source_sheet', '')}:{source_row.get('position', '')}:{source_row.get('row_index', '')}",
        "source_sheet": source_row.get("source_sheet"),
        "row_index": source_row.get("row_index"),
        "position": source_row.get("position"),
        "source_text": source_text,
        "normalized_source_text": source_signature["normalized_text"],
        "signature": source_signature,
        "candidates": top_candidates,
        "top_score": round(top_score, 4),
        "second_score": round(second_score, 4),
        "margin": margin,
        "auto_accept": auto_accept,
        "selected_part_no": selected["part_no"] if selected else None,
        "selected_candidate": selected,
        "match_state": "auto" if auto_accept else ("review" if top_candidates else "unmatched"),
    }


def match_legacy_bom(
    legacy_df: pd.DataFrame,
    standard_df: pd.DataFrame,
    learned_aliases: Optional[Dict[str, str]] = None,
    max_candidates: int = 5,
) -> Dict[str, object]:
    results: List[dict] = []

    for _, row in legacy_df.iterrows():
        result = match_row(row, standard_df, learned_aliases=learned_aliases, max_candidates=max_candidates)
        result["quantity"] = row.get("quantity")
        result["designation"] = row.get("designation")
        result["type_norm_designation"] = row.get("type_norm_designation")
        result["manufacturer"] = row.get("manufacturer")
        result["sap_part_no"] = row.get("sap_part_no")
        result["drawing_no"] = row.get("drawing_no")
        result["order_no"] = row.get("order_no")
        results.append(result)

    auto_matched = [r for r in results if r["match_state"] == "auto"]
    review_required = [r for r in results if r["match_state"] == "review"]
    unmatched = [r for r in results if r["match_state"] == "unmatched"]

    return {
        "results": results,
        "summary": {
            "total_rows": len(results),
            "auto_matched": len(auto_matched),
            "review_required": len(review_required),
            "unmatched": len(unmatched),
        },
        "auto_matched_rows": auto_matched,
        "review_queue": review_required,
        "unmatched_rows": unmatched,
    }
