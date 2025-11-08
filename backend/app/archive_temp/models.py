# from sqlalchemy import Column, Integer, String, Float, DateTime, JSON
# from sqlalchemy.ext.declarative import declarative_base
# from datetime import datetime

# Base = declarative_base()

# class WeldmentDimension(Base):
#     __tablename__ = "weldment_dimensions"
    
#     id = Column(Integer, primary_key=True, index=True)
#     assy_pn = Column(String, index=True)
#     total_height_mm = Column(Float)
#     outer_dia_mm = Column(Float)
#     inner_dia_mm = Column(Float)
#     upper_flange_outer_dia_mm = Column(Float)
#     upper_flange_inner_dia_mm = Column(Float)
#     lower_flange_outer_dia_mm = Column(Float)
#     spray_nozzle_center_distance = Column(Float)
#     spray_nozzle_id = Column(Float)
#     support_ring_height = Column(Float)
#     support_ring_id = Column(Float)
#     created_at = Column(DateTime, default=datetime.utcnow)

# class BOMComponent(Base):
#     __tablename__ = "bom_components"
    
#     id = Column(Integer, primary_key=True, index=True)
#     component = Column(String, index=True)
#     level = Column(Integer)
#     quantity = Column(Float)
#     assembly_id = Column(String, index=True)
#     created_at = Column(DateTime, default=datetime.utcnow)

# class AnalysisResult(Base):
#     __tablename__ = "analysis_results"
    
#     id = Column(Integer, primary_key=True, index=True)
#     analysis_type = Column(String)
#     parameters = Column(JSON)
#     results = Column(JSON)
#     file_references = Column(JSON)
#     created_at = Column(DateTime, default=datetime.utcnow)