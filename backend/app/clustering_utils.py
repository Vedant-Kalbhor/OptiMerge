import pandas as pd
import numpy as np
from sklearn.cluster import KMeans, DBSCAN
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import silhouette_score
from scipy.cluster.hierarchy import linkage, fcluster
from sklearn.decomposition import PCA
from typing import Dict, Any, Optional
# Add the following imports at top of clustering_utils.py (if not already present)
from typing import List, Tuple, Optional, Dict, Any
import math
import string

import re

def clean_column_name(column_name: str) -> str:
    """Clean column names for consistency (same helper as before)."""
    if pd.isna(column_name) or column_name is None:
        return "unknown"
    cleaned = re.sub(r'[^a-zA-Z0-9]', '_', str(column_name).lower())
    cleaned = re.sub(r'_+', '_', cleaned)
    return cleaned.strip('_')


def parse_weldment_excel(file_path: str) -> pd.DataFrame:
    """Parse weldment Excel file"""
    try:
        df = pd.read_excel(file_path)
        df.columns = [clean_column_name(col) for col in df.columns]
        return df
    except Exception as e:
        print(f"Error parsing Excel file: {str(e)}")
        raise


def validate_weldment_columns(df: pd.DataFrame) -> bool:
    """Flexible matching of required weldment columns."""
    # same patterns used previously
    required_patterns = {
        "assy_pn": ["assy", "pn"],
        "total_height_of_packed_tower_mm": ["total", "height", "packed", "tower"],
        "packed_tower_outer_dia_mm": ["packed", "tower", "outer", "dia"],
        "packed_tower_inner_dia_mm": ["packed", "tower", "inner", "dia"],
        "upper_flange_outer_dia_mm": ["upper", "flange", "outer", "dia"],
        "upper_flange_inner_dia_mm": ["upper", "flange", "inner", "dia"],
        "lower_flange_outer_dia_mm": ["lower", "flange", "outer", "dia"],
        "spray_nozzle_center_distance": ["spray", "nozzle", "center", "distance"],
        "spray_nozzle_id": ["spray", "nozzle", "id"],
        "support_ring_height_from_bottom": ["support", "ring", "height"],
        "support_ring_id": ["support", "ring", "id"]
    }

    cleaned_cols = [clean_column_name(col) for col in df.columns]

    def matches_pattern(col: str, keywords: list[str]) -> bool:
        return all(k in col for k in keywords)

    missing_columns = []
    for key, keywords in required_patterns.items():
        if not any(matches_pattern(col, keywords) for col in cleaned_cols):
            missing_columns.append(key)

    if missing_columns:
        print(f"Missing required columns: {missing_columns}")
        return False

    return True


def validate_weldment_data(df: pd.DataFrame) -> pd.DataFrame:
    """Validate and clean weldment dimension data"""
    print("Validating weldment data...")
    df.columns = [clean_column_name(col) for col in df.columns]

    if not validate_weldment_columns(df):
        raise ValueError("Weldment file is missing required columns. Please ensure the file contains all 11 required columns.")

    df = df.dropna(how='all')
    if len(df) == 0:
        raise ValueError("No data found in the file")

    if 'assy_pn' not in df.columns:
        raise ValueError("Missing 'Assy PN' column after cleaning")

    df = df.dropna(subset=['assy_pn'])
    df['assy_pn'] = df['assy_pn'].astype(str).str.strip()

    numeric_columns = [col for col in df.columns if col != 'assy_pn']
    for col in numeric_columns:
        df[col] = pd.to_numeric(df[col], errors='coerce')

    print(f"✅ Weldment data validated successfully. Shape: {df.shape}")
    return df


def perform_dimensional_clustering(
    df: pd.DataFrame,
    clustering_method: str = 'kmeans',
    n_clusters: Optional[int] = None,
    tolerance: float = 0.1
) -> Dict[str, Any]:
    """
    Performs the clustering and PCA visualization extraction and returns the clustering dict
    matching the shape used by main.py previously.
    """
    numeric_cols = df.select_dtypes(include=[np.number]).columns.tolist()
    if len(numeric_cols) < 2:
        raise ValueError("Not enough numeric columns for clustering")

    features = df[numeric_cols].fillna(0)
    scaler = StandardScaler()
    scaled_features = scaler.fit_transform(features)

    # Determine safe n_clusters
    if n_clusters is not None:
        try:
            n_clusters = max(2, min(int(n_clusters), len(df)))
        except Exception:
            n_clusters = None
    if n_clusters is None:
        n_clusters = min(5, max(2, len(df)//3))

    # clustering
    if clustering_method == 'kmeans':
        model = KMeans(n_clusters=n_clusters, random_state=42)
        clusters = model.fit_predict(scaled_features)
    elif clustering_method == 'hierarchical':
        Z = linkage(scaled_features, method='ward')
        clusters = fcluster(Z, n_clusters, criterion='maxclust') - 1
    elif clustering_method == 'dbscan':
        model = DBSCAN(eps=0.5, min_samples=2)
        clusters = model.fit_predict(scaled_features)
    else:
        raise ValueError(f"Unsupported clustering method: {clustering_method}")

    df = df.copy()
    df['cluster'] = clusters

    # PCA for visualization
    pca = PCA(n_components=2)
    pca_features = pca.fit_transform(scaled_features)
    df['PC1'], df['PC2'] = pca_features[:, 0], pca_features[:, 1]
    explained_var = pca.explained_variance_ratio_.sum()

    # cluster summary
    cluster_results = []
    unique_clusters = np.unique(clusters)
    for cluster_id in unique_clusters:
        if cluster_id == -1:
            continue
        cluster_data = df[df['cluster'] == cluster_id]
        if len(cluster_data) == 0:
            continue
        representative = cluster_data.iloc[0].get('assy_pn', '')
        cluster_results.append({
            "cluster_id": int(cluster_id),
            "member_count": len(cluster_data),
            "members": cluster_data['assy_pn'].tolist(),
            "representative": representative,
            "reduction_potential": max(0, len(cluster_data) - 1) / len(cluster_data)
        })

    visualization_data = []
    for _, row in df.iterrows():
        visualization_data.append({
            "assy_pn": row.get("assy_pn", ""),
            "cluster": int(row["cluster"]),
            "PC1": row["PC1"],
            "PC2": row["PC2"]
        })

    silhouette = silhouette_score(scaled_features, clusters) if len(unique_clusters) > 1 else 0

    return {
        "clusters": cluster_results,
        "metrics": {
            "n_clusters": len(cluster_results),
            "n_samples": len(df),
            "silhouette_score": silhouette,
            "explained_variance_ratio": round(float(explained_var), 4)
        },
        "visualization_data": visualization_data,
        "numeric_columns": numeric_cols
    }


# -------------------------
# Variant pairwise comparison helpers
# -------------------------
def _col_index_to_excel_letter(idx: int) -> str:
    """
    Convert 0-based column index to Excel style letters:
    0 -> 'A', 1 -> 'B', ..., 25 -> 'Z', 26 -> 'AA', etc.
    """
    letters = []
    n = idx + 1
    while n > 0:
        n, rem = divmod(n - 1, 26)
        letters.append(string.ascii_uppercase[rem])
    return ''.join(reversed(letters))


def _get_column_letter_map(df: pd.DataFrame) -> Dict[str, str]:
    """
    Returns mapping from df.columns (clean names) to Excel-letter codes
    Example: {'assy_pn': 'A', 'total_height_of_packed_tower_mm': 'B', ...}
    Based on column order.
    """
    return {col: _col_index_to_excel_letter(i) for i, col in enumerate(df.columns.tolist())}


def _values_match(v1: Any, v2: Any, tol: float = 1e-6) -> bool:
    """
    Compare two values. If numeric-ish, compare with tolerance. Otherwise compare normalized strings.
    Returns True if considered matching.
    """
    # Both NaN -> match
    if (pd.isna(v1) and pd.isna(v2)):
        return True

    # If one is NaN and other is not -> not match
    if pd.isna(v1) or pd.isna(v2):
        return False

    # Try numeric comparison
    try:
        f1 = float(v1)
        f2 = float(v2)
        return abs(f1 - f2) <= tol
    except Exception:
        # fallback to string equality (strip whitespace, lower)
        s1 = str(v1).strip()
        s2 = str(v2).strip()
        return s1 == s2


def compare_two_variants(
    row_a: pd.Series,
    row_b: pd.Series,
    columns: List[str],
    col_letter_map: Dict[str, str],
    tolerance: float = 1e-6
) -> Dict[str, Any]:
    """
    Compare two variant rows over the provided columns.
    Returns dict with:
      - 'bom_a', 'bom_b' (identifiers from row index or provided assembly columns),
      - 'match_percentage' (float 0-100),
      - 'matching_cols_letters' (comma separated letters),
      - 'unmatching_cols_letters' (comma separated letters),
      - 'matching_cols' (list of column names),
      - 'unmatching_cols' (list of column names)
    """
    matching_cols = []
    unmatching_cols = []

    for col in columns:
        v1 = row_a.get(col, np.nan)
        v2 = row_b.get(col, np.nan)
        if _values_match(v1, v2, tol=tolerance):
            matching_cols.append(col)
        else:
            unmatching_cols.append(col)

    total = len(columns)
    if total == 0:
        percent = 0.0
    else:
        percent = (len(matching_cols) / total) * 100.0

    # map to letters
    matching_letters = [col_letter_map.get(c, '?') for c in matching_cols]
    unmatching_letters = [col_letter_map.get(c, '?') for c in unmatching_cols]

    return {
        "bom_a": row_a.to_dict().get("assy_pn", row_a.name),
        "bom_b": row_b.to_dict().get("assy_pn", row_b.name),
        "match_percentage": round(percent, 2),
        "matching_cols_letters": ", ".join(matching_letters) if matching_letters else "",
        "unmatching_cols_letters": ", ".join(unmatching_letters) if unmatching_letters else "",
        "matching_cols": matching_cols,
        "unmatching_cols": unmatching_cols
    }


def pairwise_variant_comparison(
    df: pd.DataFrame,
    key_col: str = "assy_pn",
    columns_to_compare: Optional[List[str]] = None,
    tolerance: float = 1e-6,
    threshold: Optional[float] = None,
    include_self: bool = False
) -> pd.DataFrame:
    """
    Compare every variant (row) to every other variant in the DataFrame.

    Parameters:
      - df: validated weldment DataFrame (must contain key_col)
      - key_col: column that identifies each variant (default 'assy_pn')
      - columns_to_compare: list of column names to compare; if None, use all columns except the key_col
      - tolerance: numeric match tolerance (absolute)
      - threshold: if provided, filter pairs to only include those with match_percentage >= threshold (0-100)
      - include_self: if True, include pair comparisons of a variant with itself (will be 100%)

    Returns:
      pandas.DataFrame with columns:
        ['Assembly A', 'Assembly B', 'Match percentage', 'Matching Columns', 'Unmatching']
      and internal columns 'matching_cols' and 'unmatching_cols' (lists) for programmatic use.
    """
    if key_col not in df.columns:
        raise ValueError(f"Key column '{key_col}' not found in DataFrame")

    # Decide which columns to compare
    if columns_to_compare is None:
        columns = [c for c in df.columns if c != key_col]
    else:
        # validate the provided columns
        missing = [c for c in columns_to_compare if c not in df.columns]
        if missing:
            raise ValueError(f"Requested columns not present in DataFrame: {missing}")
        columns = columns_to_compare.copy()

    col_letter_map = _get_column_letter_map(df)

    rows = []
    # Use .itertuples or indexed approach to preserve order
    df_indexed = df.reset_index(drop=True)

    n = len(df_indexed)
    for i in range(n):
        for j in range(n):
            if not include_self and i == j:
                continue
            # To avoid duplicates, only take i < j (user image appears to contain both directions? it shows A vs B once)
            if i >= j:
                continue

            row_a = df_indexed.iloc[i]
            row_b = df_indexed.iloc[j]
            res = compare_two_variants(row_a, row_b, columns, col_letter_map, tolerance=tolerance)

            # Apply threshold filter if requested
            if threshold is None or res["match_percentage"] >= threshold:
                rows.append(res)

    result_df = pd.DataFrame(rows)

    # Final formatting to match your screenshot column headers
    if not result_df.empty:
        formatted = pd.DataFrame({
            "Assembly A": result_df["bom_a"],
            "Assembly B": result_df["bom_b"],
            "Match percentage": result_df["match_percentage"],
            "Matching Columns": result_df["matching_cols_letters"],
            "Unmatching": result_df["unmatching_cols_letters"],
            # keep detailed lists for further processing if needed
            "matching_cols_list": result_df["matching_cols"],
            "unmatching_cols_list": result_df["unmatching_cols"]
        })
    else:
        formatted = pd.DataFrame(columns=[
            "Assembly A", "Assembly B", "Match percentage", "Matching Columns", "Unmatching",
            "matching_cols_list", "unmatching_cols_list"
        ])

    return formatted


# -------------------------
# Example usage (callable from your main pipeline)
# -------------------------
# Example:
#   df = parse_weldment_excel('/path/to/Sample weldment dimension file.xlsx')
#   df_valid = validate_weldment_data(df)          # your existing validator
#   # restrict to the 11 dimension columns if you want:
#   columns_to_compare = [c for c in df_valid.columns if c != 'assy_pn']
#   results_df = pairwise_variant_comparison(df_valid, key_col='assy_pn', columns_to_compare=columns_to_compare, tolerance=0.1, threshold=30)
#   # results_df now matches the screenshot-like format and can be returned to frontend as JSON:
#   results_json = results_df.to_dict(orient='records')
