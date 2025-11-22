import pandas as pd
import numpy as np
from sklearn.cluster import KMeans, DBSCAN
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import silhouette_score
from scipy.cluster.hierarchy import linkage, fcluster
from sklearn.decomposition import PCA
from typing import Dict, Any, Optional

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

