import io
import re
import math
from typing import Dict, Any, List, Optional, Tuple
import pandas as pd
import numpy as np
from collections import defaultdict


def normalize_col_name(name: Any) -> str:
    if name is None:
        return ""
    val = str(name).strip().lower()
    val = re.sub(r"[^a-z0-9]+", " ", val)
    return val.strip()


def find_matching_df_column(target_col: str, df_columns: List[str]) -> Optional[str]:
    """Finds exact or normalized matching column in dataframe."""
    target_norm = normalize_col_name(target_col)
    for col in df_columns:
        if str(col).strip() == target_col:
            return col
    for col in df_columns:
        if normalize_col_name(col) == target_norm:
            return col
    # Partial match fallback
    for col in df_columns:
        c_norm = normalize_col_name(col)
        if target_norm in c_norm or c_norm in target_norm:
            return col
    return None


def parse_numeric(val: Any) -> Optional[float]:
    if pd.isna(val) or val is None or str(val).strip() == "":
        return None
    try:
        # Remove commas, currency symbols, or units if any
        cleaned = re.sub(r"[^\d\.\-\+eE]", "", str(val))
        if cleaned in ("", "-", "+"):
            return None
        f = float(cleaned)
        if math.isnan(f):
            return None
        return f
    except Exception:
        return None


def calculate_single_column_similarity(val_a: Any, val_b: Any, col_config: Dict[str, Any]) -> Tuple[float, bool]:
    """
    Returns (similarity_percent, is_match_boolean).
    Similarity is in range [0.0, 100.0].
    """
    col_type = col_config.get("type", "numeric_proximity")
    tol = col_config.get("tolerance")
    if tol is not None:
        try:
            tol = float(tol)
        except Exception:
            tol = 0.0
    else:
        tol = 0.0

    a_is_na = pd.isna(val_a) or val_a is None or str(val_a).strip() == ""
    b_is_na = pd.isna(val_b) or val_b is None or str(val_b).strip() == ""

    if a_is_na and b_is_na:
        return 100.0, True
    if a_is_na or b_is_na:
        return 0.0, False

    num_a = parse_numeric(val_a)
    num_b = parse_numeric(val_b)

    # 1. Tolerance comparison
    if col_type == "tolerance":
        if num_a is not None and num_b is not None:
            diff = abs(num_a - num_b)
            if diff <= tol + 1e-9:
                return 100.0, True
            return 0.0, False
        else:
            # Fallback to string match
            match = str(val_a).strip().lower() == str(val_b).strip().lower()
            return (100.0, True) if match else (0.0, False)

    # 2. Exact Text comparison
    elif col_type == "exact_text":
        str_a = str(val_a).strip().lower()
        str_b = str(val_b).strip().lower()
        match = (str_a == str_b)
        return (100.0, True) if match else (0.0, False)

    # 3. Numeric Proximity (default)
    else:
        if num_a is not None and num_b is not None:
            abs_a = abs(num_a)
            abs_b = abs(num_b)
            max_val = max(abs_a, abs_b)
            if max_val == 0.0:
                return 100.0, True
            diff = abs(num_a - num_b)
            sim = 100.0 - (diff / max_val * 100.0)
            sim = max(0.0, min(100.0, sim))
            is_match = (diff <= 1e-6)
            return round(sim, 2), is_match
        else:
            # Fallback for text in proximity column
            match = str(val_a).strip().lower() == str(val_b).strip().lower()
            return (100.0, True) if match else (0.0, False)


def run_custom_pairwise_analysis(
    df: pd.DataFrame,
    template: Dict[str, Any],
    threshold: Optional[float] = None
) -> Dict[str, Any]:
    """
    Executes a custom similarity analysis over rows of df according to template.
    Guarantees:
      - Identifier column is NOT compared for similarity.
      - Each compared column calculates its score based on user config.
      - Weighted total match percentage is computed.
    """
    df = df.copy()
    if threshold is None:
        threshold = float(template.get("default_threshold", 75.0))
    else:
        threshold = float(threshold)

    df_columns = list(df.columns)
    identifier_target = template.get("identifier_column", "")
    matched_id_col = find_matching_df_column(identifier_target, df_columns)

    # Prepare compared columns list
    configured_cols = template.get("columns", [])
    active_cols = []
    
    for c in configured_cols:
        col_name = c.get("name", "")
        if not c.get("included", True):
            continue
            
        # IMPORTANT: Exclude the identifier column from comparison columns
        if matched_id_col and (
            col_name == matched_id_col or 
            normalize_col_name(col_name) == normalize_col_name(matched_id_col) or
            col_name == identifier_target
        ):
            continue

        matched_df_col = find_matching_df_column(col_name, df_columns)
        if matched_df_col:
            active_cols.append({
                "template_name": col_name,
                "df_col": matched_df_col,
                "type": c.get("type", "numeric_proximity"),
                "tolerance": c.get("tolerance"),
                "weight": float(c.get("weight", 1.0))
            })

    if not active_cols:
        raise ValueError(
            "No valid comparison columns found in uploaded file matching this template. "
            f"Configured columns: {[c.get('name') for c in configured_cols]}"
        )

    # Normalize weights
    total_raw_weight = sum(c["weight"] for c in active_cols)
    if total_raw_weight <= 0:
        equal_w = 1.0 / len(active_cols)
        for c in active_cols:
            c["normalized_weight"] = equal_w
    else:
        for c in active_cols:
            c["normalized_weight"] = c["weight"] / total_raw_weight

    # Extract part names / identifiers
    if matched_id_col:
        identifiers = [
            str(val).strip() if pd.notna(val) and str(val).strip() != "" else f"Row_{idx + 1}"
            for idx, val in enumerate(df[matched_id_col])
        ]
    else:
        identifiers = [f"Row_{idx + 1}" for idx in range(len(df))]

    n_rows = len(df)
    pairwise_table = []
    exact_match_pairs = []
    
    # Adjacency for grouping exact matches
    exact_match_adj = defaultdict(set)

    # Pairwise comparison loop
    for i in range(n_rows):
        id_a = identifiers[i]
        row_a = df.iloc[i]

        for j in range(i + 1, n_rows):
            id_b = identifiers[j]
            row_b = df.iloc[j]

            col_details = {}
            matching_cols = []
            unmatching_cols = []
            weighted_sim_sum = 0.0

            for col_info in active_cols:
                col_key = col_info["template_name"]
                df_col = col_info["df_col"]
                val_a = row_a[df_col]
                val_b = row_b[df_col]

                sim, is_match = calculate_single_column_similarity(val_a, val_b, col_info)
                weighted_sim_sum += sim * col_info["normalized_weight"]

                col_details[col_key] = {
                    "val_a": None if pd.isna(val_a) else str(val_a),
                    "val_b": None if pd.isna(val_b) else str(val_b),
                    "similarity": round(sim, 2),
                    "is_match": is_match,
                    "type": col_info["type"],
                    "weight": col_info["weight"]
                }

                if is_match or sim >= 99.99:
                    matching_cols.append(col_key)
                else:
                    unmatching_cols.append(col_key)

            total_match_pct = round(weighted_sim_sum, 2)

            # Record exact match
            if total_match_pct >= 99.99 and len(unmatching_cols) == 0:
                exact_match_pairs.append((id_a, id_b))
                exact_match_adj[id_a].add(id_b)
                exact_match_adj[id_b].add(id_a)

            # Record pair if meets threshold
            if total_match_pct >= threshold:
                pairwise_table.append({
                    "item_a": id_a,
                    "item_b": id_b,
                    "match_percentage": total_match_pct,
                    "similarity_score": round(total_match_pct / 100.0, 4),
                    "matching_columns": matching_cols,
                    "unmatching_columns": unmatching_cols,
                    "matching_count": len(matching_cols),
                    "unmatching_count": len(unmatching_cols),
                    "column_details": col_details
                })

    # Sort pairwise table by highest similarity first
    pairwise_table.sort(key=lambda x: x["match_percentage"], reverse=True)

    # Form exact match clusters (connected components)
    visited = set()
    exact_match_groups = []
    for item in exact_match_adj:
        if item not in visited:
            group = []
            queue = [item]
            visited.add(item)
            while queue:
                curr = queue.pop(0)
                group.append(curr)
                for neighbor in exact_match_adj[curr]:
                    if neighbor not in visited:
                        visited.add(neighbor)
                        queue.append(neighbor)
            if len(group) > 1:
                exact_match_groups.append(sorted(group))

    summary = {
        "total_records": n_rows,
        "total_compared_columns": len(active_cols),
        "threshold": threshold,
        "similar_pairs_count": len(pairwise_table),
        "exact_match_pairs_count": len(exact_match_pairs),
        "exact_match_groups_count": len(exact_match_groups),
        "identifier_column": matched_id_col or "None (Auto-Indexed)",
        "compared_columns": [c["template_name"] for c in active_cols]
    }

    return {
        "template_id": template.get("id"),
        "template_name": template.get("name"),
        "summary": summary,
        "pairwise_table": pairwise_table,
        "exact_match_groups": exact_match_groups,
        "active_columns": active_cols
    }


def generate_custom_excel_report(analysis_result: Dict[str, Any]) -> bytes:
    """
    Builds an in-memory formatted Excel workbook containing:
      - Sheet 1: Pairwise Comparisons
      - Sheet 2: Exact Match Groups
      - Sheet 3: Summary & Template Info
    """
    output = io.BytesIO()
    with pd.ExcelWriter(output, engine="openpyxl") as writer:
        pairwise_table = analysis_result.get("pairwise_table", [])
        summary = analysis_result.get("summary", {})

        # 1. Pairwise Table
        flat_rows = []
        for r in pairwise_table:
            row_dict = {
                "Item A": r.get("item_a"),
                "Item B": r.get("item_b"),
                "Match Percentage": f"{r.get('match_percentage')}%",
                "Matching Columns": ", ".join(r.get("matching_columns", [])),
                "Unmatching Columns": ", ".join(r.get("unmatching_columns", [])),
            }
            # Append detailed column differences
            col_details = r.get("column_details", {})
            for col_name, details in col_details.items():
                row_dict[f"{col_name} (A)"] = details.get("val_a")
                row_dict[f"{col_name} (B)"] = details.get("val_b")
                row_dict[f"{col_name} (Match %)"] = f"{details.get('similarity')}%"

            flat_rows.append(row_dict)

        df_pairwise = pd.DataFrame(flat_rows)
        df_pairwise.to_excel(writer, sheet_name="Pairwise Comparisons", index=False)

        # 2. Exact Match Groups
        groups = analysis_result.get("exact_match_groups", [])
        group_rows = []
        for idx, grp in enumerate(groups):
            group_rows.append({
                "Group #": f"Group {idx + 1}",
                "Group Size": len(grp),
                "Identical Items": ", ".join(grp)
            })
        df_groups = pd.DataFrame(group_rows)
        df_groups.to_excel(writer, sheet_name="Exact Match Groups", index=False)

        # 3. Summary Sheet
        summary_rows = [
            {"Parameter": "Template Name", "Value": analysis_result.get("template_name")},
            {"Parameter": "Total Records in File", "Value": summary.get("total_records")},
            {"Parameter": "Identifier Column Used", "Value": summary.get("identifier_column")},
            {"Parameter": "Similarity Threshold", "Value": f"{summary.get('threshold')}%"},
            {"Parameter": "Similar Pairs Found", "Value": summary.get("similar_pairs_count")},
            {"Parameter": "Exact Match Groups", "Value": summary.get("exact_match_groups_count")},
            {"Parameter": "Compared Columns", "Value": ", ".join(summary.get("compared_columns", []))}
        ]
        df_summary = pd.DataFrame(summary_rows)
        df_summary.to_excel(writer, sheet_name="Summary", index=False)

    return output.getvalue()
