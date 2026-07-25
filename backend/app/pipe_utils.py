import pandas as pd
import numpy as np
import io
import re
from typing import List, Dict, Any, Optional

def clean_column_name(column_name: str) -> str:
    """Clean column name for flexible matching"""
    if pd.isna(column_name) or column_name is None:
        return "unknown"
    cleaned = re.sub(r'[^a-zA-Z0-9]', '_', str(column_name).lower())
    cleaned = re.sub(r'_+', '_', cleaned)
    return cleaned.strip('_')

def parse_pipe_val(val: Any) -> float:
    """Parse string/numeric values from Excel into clean floats (e.g. 'no' -> 0.0)"""
    if pd.isna(val) or val is None:
        return 0.0
    s_val = str(val).strip().lower()
    if s_val == 'no' or s_val == '' or s_val == 'none' or s_val == 'nan':
        return 0.0
    try:
        return float(val)
    except (ValueError, TypeError):
        return 0.0

def parse_pipe_excel(file_path_or_bytes: Any, file_name: Optional[str] = None) -> pd.DataFrame:
    """Parse pipe Excel or CSV file into standardized DataFrame"""
    try:
        is_csv = False
        if isinstance(file_path_or_bytes, str):
            is_csv = file_path_or_bytes.lower().endswith('.csv')
        elif file_name:
            is_csv = file_name.lower().endswith('.csv')

        if is_csv:
            if isinstance(file_path_or_bytes, io.BytesIO):
                file_path_or_bytes.seek(0)
            df = pd.read_csv(file_path_or_bytes)
        else:
            if isinstance(file_path_or_bytes, io.BytesIO):
                file_path_or_bytes.seek(0)
            df = pd.read_excel(file_path_or_bytes)

        # Detect columns
        col_map = {}
        for orig_col in df.columns:
            clean = clean_column_name(orig_col)
            if 'item' in clean or 'code' in clean or 'pn' in clean or 'part' in clean:
                if 'item_code' not in col_map:
                    col_map['item_code'] = orig_col
            elif 'bend' in clean:
                if 'bends' not in col_map:
                    col_map['bends'] = orig_col
            elif 'straight' in clean:
                if 'straight_length' not in col_map:
                    col_map['straight_length'] = orig_col
            elif 'effective' in clean:
                if 'effective_length' not in col_map:
                    col_map['effective_length'] = orig_col
            elif 'x_axis' in clean or clean == 'x':
                if 'x_axis' not in col_map:
                    col_map['x_axis'] = orig_col
            elif 'y_axis' in clean or clean == 'y':
                if 'y_axis' not in col_map:
                    col_map['y_axis'] = orig_col
            elif 'z_axis' in clean or clean == 'z':
                if 'z_axis' not in col_map:
                    col_map['z_axis'] = orig_col

        # Fallback to column index if needed
        cols = list(df.columns)
        if 'item_code' not in col_map and len(cols) > 1:
            col_map['item_code'] = cols[1]  # usually 2nd column is ITEM CODE
        if 'bends' not in col_map and len(cols) > 2:
            col_map['bends'] = cols[2]
        if 'straight_length' not in col_map and len(cols) > 3:
            col_map['straight_length'] = cols[3]
        if 'effective_length' not in col_map and len(cols) > 4:
            col_map['effective_length'] = cols[4]
        if 'x_axis' not in col_map and len(cols) > 5:
            col_map['x_axis'] = cols[5]
        if 'y_axis' not in col_map and len(cols) > 6:
            col_map['y_axis'] = cols[6]
        if 'z_axis' not in col_map and len(cols) > 7:
            col_map['z_axis'] = cols[7]

        # Extract normalized data
        norm_df = pd.DataFrame()
        norm_df['item_code'] = df[col_map['item_code']].apply(
            lambda v: '' if pd.isna(v) else str(v).strip()
        )
        norm_df = norm_df[~norm_df['item_code'].isin(['', 'nan', 'none', 'null'])]

        norm_df['bends'] = df[col_map['bends']].apply(parse_pipe_val)
        norm_df['straight_length'] = df[col_map['straight_length']].apply(parse_pipe_val)
        norm_df['effective_length'] = df[col_map['effective_length']].apply(parse_pipe_val)
        norm_df['x_axis'] = df[col_map['x_axis']].apply(parse_pipe_val)
        norm_df['y_axis'] = df[col_map['y_axis']].apply(parse_pipe_val)
        norm_df['z_axis'] = df[col_map['z_axis']].apply(parse_pipe_val)

        return norm_df
    except Exception as e:
        print(f"Error parsing pipe Excel file: {str(e)}")
        raise

def calc_similarity(v1: float, v2: float) -> float:
    """
    Calculate similarity between two values, exactly matching the VBA
    Similarity() function used in the source macros:

        mx = MAX(|v1|, |v2|)
        if mx == 0: similarity = 100
        else: similarity = 100 - (|v1 - v2| / mx) * 100, clamped at 0

    NOTE: the difference is taken on the SIGNED values (v1 - v2), not on
    their absolute values. Only the denominator (mx) uses abs(). This
    matters for X/Y/Z axis data, which can be negative — a naive
    min(|a|,|b|)/max(|a|,|b|) formula gives the wrong answer whenever the
    two values have opposite signs.
    """
    a, b = abs(v1), abs(v2)
    max_val = max(a, b)

    if max_val == 0.0:
        return 100.0

    diff = abs(v1 - v2)
    sim = 100.0 - (diff / max_val * 100.0)

    if sim < 0.0:
        sim = 0.0

    return sim


def pairwise_pipe_comparison(
    df: pd.DataFrame,
    mode: str = 'xyz_only',
    threshold: float = 0.0
) -> Dict[str, Any]:
    """
    Perform one-to-one pairwise comparison for pipes.
    mode can be 'xyz_only' or 'xyz_bends'.
    threshold is 0.0 to 100.0 (% match).

    Weighted Match % now matches the two VBA macros exactly:
      - xyz_bends : Bends 26.667%, X 26.667%, Y 20%, Z 26.667%
      - xyz_only  : X 36.36%, Y 27.27%, Z 36.36%

    Match % is computed from the RAW (unrounded) similarity values, then
    rounded once at the end — same as the macro, which rounds only when
    writing to the sheet, not before combining the weighted components.
    Individual column values (X %, Y %, Z %, Bends %) are still rounded
    to 1 decimal for display, matching the macro's Round(...,1) on those
    cells.
    """
    records = []
    df_indexed = df.reset_index(drop=True)
    n = len(df_indexed)

    total_possible_pairs = n * (n - 1) // 2

    for i in range(n):
        row_a = df_indexed.iloc[i]
        code_a = str(row_a['item_code'])
        xa, ya, za = row_a['x_axis'], row_a['y_axis'], row_a['z_axis']
        ba = row_a['bends']

        for j in range(i + 1, n):
            row_b = df_indexed.iloc[j]
            code_b = str(row_b['item_code'])
            xb, yb, zb = row_b['x_axis'], row_b['y_axis'], row_b['z_axis']
            bb = row_b['bends']

            # Raw (unrounded) similarity values — used for the weighted score
            x_sim_raw = calc_similarity(xa, xb)
            y_sim_raw = calc_similarity(ya, yb)
            z_sim_raw = calc_similarity(za, zb)

            if mode == 'xyz_bends':
                bends_sim_raw = calc_similarity(ba, bb)

                match_sim = round(
                    (bends_sim_raw * 0.26667)
                    + (x_sim_raw * 0.26667)
                    + (y_sim_raw * 0.2)
                    + (z_sim_raw * 0.26667),
                    1
                )

                record = {
                    "Part A": code_a,
                    "Part B": code_b,
                    "Bends %": round(bends_sim_raw, 1),
                    "X %": round(x_sim_raw, 1),
                    "Y %": round(y_sim_raw, 1),
                    "Z %": round(z_sim_raw, 1),
                    "Match %": match_sim
                }
            else:
                match_sim = round(
                    (x_sim_raw * 0.3636)
                    + (y_sim_raw * 0.2727)
                    + (z_sim_raw * 0.3636),
                    1
                )

                record = {
                    "Part A": code_a,
                    "Part B": code_b,
                    "X %": round(x_sim_raw, 1),
                    "Y %": round(y_sim_raw, 1),
                    "Z %": round(z_sim_raw, 1),
                    "Match %": match_sim
                }

            if match_sim >= threshold:
                records.append(record)

    avg_match = (
        round(sum(r["Match %"] for r in records) / len(records), 2)
        if records else 0.0
    )

    return {
        "pairwise_table": records,
        "parameters": {
            "mode": mode,
            "threshold": threshold,
            "total_pipes": n,
            "total_pairs": total_possible_pairs,
            "returned_pairs": len(records)
        },
        "statistics": {
            "total_pipes": n,
            "total_pairs": total_possible_pairs,
            "pairs_above_threshold": len(records),
            "avg_match_percent": avg_match
        }
    }
def generate_pipe_excel_report(records: List[Dict[str, Any]], mode: str = 'xyz_only') -> bytes:
    """Generate Excel bytes for comparison report"""
    if mode == 'xyz_bends':
        columns = ['Part A', 'Part B', 'Bends %', 'X %', 'Y %', 'Z %', 'Match %']
    else:
        columns = ['Part A', 'Part B', 'X %', 'Y %', 'Z %', 'Match %']

    df = pd.DataFrame(records, columns=columns)
    output = io.BytesIO()

    sheet_name = 'Comparison_Report_XYZ_Bends' if mode == 'xyz_bends' else 'Comparison_Report_XYZOnly'
    
    with pd.ExcelWriter(output, engine='openpyxl') as writer:
        df.to_excel(writer, sheet_name=sheet_name, index=False)

    return output.getvalue()
