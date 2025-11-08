# from pydantic import BaseModel
# from typing import List, Dict, Any, Optional
# from datetime import datetime

# class WeldmentDimensionBase(BaseModel):
#     assy_pn: str
#     total_height_mm: float
#     outer_dia_mm: float
#     inner_dia_mm: float
#     upper_flange_outer_dia_mm: float
#     upper_flange_inner_dia_mm: float
#     lower_flange_outer_dia_mm: float
#     spray_nozzle_center_distance: float
#     spray_nozzle_id: float
#     support_ring_height: float
#     support_ring_id: float

# class BOMComponentBase(BaseModel):
#     component: str
#     level: int
#     quantity: float
#     assembly_id: str

# class ClusteringRequest(BaseModel):
#     weldment_file_id: str
#     clustering_method: str = "kmeans"  # kmeans, hierarchical, dbscan
#     n_clusters: Optional[int] = None
#     tolerance: float = 0.1
#     features: List[str] = ["total_height_mm", "outer_dia_mm", "inner_dia_mm"]

# class BOMAnalysisRequest(BaseModel):
#     bom_file_id: str
#     similarity_method: str = "jaccard"  # jaccard, cosine, weighted
#     threshold: float = 0.8

# class ClusterResult(BaseModel):
#     cluster_id: int
#     members: List[str]
#     centroid: Dict[str, float]
#     representative: str
#     reduction_potential: float

# class BOMSimilarityResult(BaseModel):
#     bom_a: str
#     bom_b: str
#     similarity_score: float
#     common_parts: int
#     unique_parts_a: List[str]
#     unique_parts_b: List[str]

# class ReplacementSuggestion(BaseModel):
#     original_weldment: str
#     suggested_replacement: str
#     confidence: float
#     affected_boms: List[str]
#     cost_savings: Optional[float]

# class AnalysisResponse(BaseModel):
#     analysis_id: str
#     status: str
#     results: Dict[str, Any]
#     created_at: datetime