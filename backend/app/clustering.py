import pandas as pd
import numpy as np
from sklearn.cluster import KMeans, DBSCAN
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import silhouette_score
from scipy.cluster.hierarchy import linkage, fcluster
from typing import Dict, List, Any, Tuple
import plotly.express as px
import plotly.graph_objects as go

def perform_clustering(df: pd.DataFrame, method: str = "kmeans", 
                      n_clusters: int = None, tolerance: float = 0.1) -> Dict[str, Any]:
    """
    Perform clustering on weldment dimensions
    """
    # Select numeric features
    numeric_columns = df.select_dtypes(include=[np.number]).columns.tolist()
    features_df = df[numeric_columns].fillna(0)
    
    # Standardize features
    scaler = StandardScaler()
    scaled_features = scaler.fit_transform(features_df)
    
    if method == "kmeans":
        if n_clusters is None:
            n_clusters = find_optimal_clusters(scaled_features)
        
        clusters = KMeans(n_clusters=n_clusters, random_state=42).fit_predict(scaled_features)
    
    elif method == "hierarchical":
        if n_clusters is None:
            n_clusters = 5
        
        Z = linkage(scaled_features, method='ward')
        clusters = fcluster(Z, n_clusters, criterion='maxclust') - 1
    
    elif method == "dbscan":
        clusters = DBSCAN(eps=0.5, min_samples=2).fit_predict(scaled_features)
        n_clusters = len(set(clusters)) - (1 if -1 in clusters else 0)
    
    else:
        raise ValueError(f"Unsupported clustering method: {method}")
    
    # Calculate cluster results
    cluster_results = calculate_cluster_results(df, clusters, scaled_features, numeric_columns)
    
    # Generate visualization
    visualization = generate_cluster_visualization(df, clusters, numeric_columns)
    
    return {
        "clusters": cluster_results,
        "visualization": visualization,
        "metrics": {
            "silhouette_score": silhouette_score(scaled_features, clusters) if len(set(clusters)) > 1 else 0,
            "n_clusters": n_clusters,
            "n_samples": len(df)
        }
    }

def find_optimal_clusters(data: np.ndarray, max_k: int = 10) -> int:
    """Find optimal number of clusters using elbow method"""
    inertias = []
    for k in range(2, max_k + 1):
        kmeans = KMeans(n_clusters=k, random_state=42)
        kmeans.fit(data)
        inertias.append(kmeans.inertia_)
    
    # Simple elbow detection (can be improved)
    differences = [inertias[i] - inertias[i+1] for i in range(len(inertias)-1)]
    optimal_k = differences.index(max(differences)) + 2
    
    return optimal_k

def calculate_cluster_results(df: pd.DataFrame, clusters: np.ndarray, 
                            scaled_features: np.ndarray, feature_columns: List[str]) -> List[Dict[str, Any]]:
    """Calculate detailed cluster results"""
    results = []
    
    for cluster_id in set(clusters):
        if cluster_id == -1:  # Skip noise points in DBSCAN
            continue
            
        cluster_mask = clusters == cluster_id
        cluster_data = df[cluster_mask]
        cluster_features = scaled_features[cluster_mask]
        
        # Calculate centroid
        centroid = cluster_features.mean(axis=0)
        
        # Find representative (closest to centroid)
        distances = np.linalg.norm(cluster_features - centroid, axis=1)
        representative_idx = distances.argmin()
        representative = cluster_data.iloc[representative_idx]['assy_pn']
        
        results.append({
            "cluster_id": int(cluster_id),
            "member_count": len(cluster_data),
            "members": cluster_data['assy_pn'].tolist(),
            "centroid": dict(zip(feature_columns, centroid)),
            "representative": representative,
            "reduction_potential": max(0, len(cluster_data) - 1) / len(cluster_data) if len(cluster_data) > 0 else 0
        })
    
    return results

def generate_cluster_visualization(df: pd.DataFrame, clusters: np.ndarray, 
                                 feature_columns: List[str]) -> Dict[str, Any]:
    """Generate cluster visualization data"""
    if len(feature_columns) < 2:
        return {}
    
    # Use first two features for 2D visualization
    x_feature, y_feature = feature_columns[:2]
    
    fig = px.scatter(
        df, x=x_feature, y=y_feature, color=clusters.astype(str),
        title="Weldment Clustering Visualization",
        labels={x_feature: x_feature, y_feature: y_feature},
        hover_data=['assy_pn']
    )
    
    return {
        "plot_data": fig.to_json(),
        "features_used": [x_feature, y_feature]
    }