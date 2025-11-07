import numpy as np
import pandas as pd
from sklearn.preprocessing import StandardScaler
from sklearn.cluster import KMeans, AgglomerativeClustering
import hdbscan
import umap


def _scale_features(X):
    """Scale numeric features using StandardScaler."""
    scaler = StandardScaler()
    Xs = scaler.fit_transform(X)
    return Xs, scaler


def run_clustering(df: pd.DataFrame, algorithm: str = 'hdbscan'):
    """
    Input:
        df: DataFrame where rows = weldments and columns = numeric features.
        algorithm: 'kmeans', 'agglomerative', or 'hdbscan'
    Returns:
        A dictionary containing cluster labels, representative samples, UMAP coordinates, and metadata.
    """
    # Select numeric feature columns
    X = df.select_dtypes(include=[np.number]).copy()
    if X.shape[1] == 0:
        return {"error": "No numeric features found"}

    Xs, scaler = _scale_features(X)
    results = {}

    # Run selected clustering algorithm
    if algorithm == 'kmeans':
        # Heuristic: choose k between 2 and 8
        k = min(8, max(2, int(np.sqrt(len(X)))))
        km = KMeans(n_clusters=k, random_state=42)
        labels = km.fit_predict(Xs)
        centers = km.cluster_centers_

    elif algorithm == 'agglomerative':
        agg = AgglomerativeClustering(n_clusters=None, distance_threshold=1.5)
        labels = agg.fit_predict(Xs)
        centers = None

    else:
        # Default: HDBSCAN
        clusterer = hdbscan.HDBSCAN(
            min_cluster_size=max(2, int(len(X) * 0.02)),
            prediction_data=True
        )
        labels = clusterer.fit_predict(Xs)
        centers = None

    # Choose representative for each cluster: median of original features
    df_numeric = X.reset_index(drop=True)
    df['__cluster'] = labels
    reps = {}

    for c in np.unique(labels):
        members = df[df['__cluster'] == c]
        if c == -1:
            reps[c] = {'type': 'outlier', 'count': len(members)}
            continue

        med = members.select_dtypes(include=[np.number]).median().to_dict()
        reps[c] = {
            'type': 'cluster',
            'count': len(members),
            'representative': med
        }

    # UMAP for visualization coordinates
    reducer = umap.UMAP(n_components=2, random_state=42)
    emb = reducer.fit_transform(Xs)

    # Compile results
    results['labels'] = labels.tolist()
    results['reps'] = reps
    results['umap'] = emb.tolist()
    results['feature_columns'] = X.columns.tolist()

    return results
