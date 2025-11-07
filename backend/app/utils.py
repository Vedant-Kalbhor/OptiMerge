import pandas as pd
import uuid
from typing import Dict, Any
import re

def validate_weldment_data(df: pd.DataFrame) -> pd.DataFrame:
    """Validate and clean weldment dimension data"""
    required_columns = ['Assy PN', 'Total Height of Packed Tower (MM)', 'Packed Tower Outer Dia (MM)']
    
    for col in required_columns:
        if col not in df.columns:
            raise ValueError(f"Missing required column: {col}")
    
    # Clean column names
    df.columns = [clean_column_name(col) for col in df.columns]
    
    # Remove empty rows
    df = df.dropna(subset=['assy_pn'])
    
    # Convert numeric columns
    numeric_columns = [col for col in df.columns if col != 'assy_pn']
    for col in numeric_columns:
        df[col] = pd.to_numeric(df[col], errors='coerce')
    
    return df

def validate_bom_data(df: pd.DataFrame) -> pd.DataFrame:
    """Validate and clean BOM data"""
    required_columns = ['Component', 'Lev', 'Quantity']
    
    for col in required_columns:
        if col not in df.columns:
            raise ValueError(f"Missing required column: {col}")
    
    # Clean column names
    df.columns = [clean_column_name(col) for col in df.columns]
    
    # Remove empty rows
    df = df.dropna(subset=['component'])
    
    # Convert numeric columns
    df['level'] = pd.to_numeric(df['level'], errors='coerce')
    df['quantity'] = pd.to_numeric(df['quantity'], errors='coerce')
    
    # Add assembly ID for grouping
    if 'assembly_id' not in df.columns:
        df['assembly_id'] = 'default_assembly'
    
    return df

def clean_column_name(column_name: str) -> str:
    """Clean column names for consistency"""
    cleaned = re.sub(r'[^a-zA-Z0-9]', '_', str(column_name).lower())
    cleaned = re.sub(r'_+', '_', cleaned)
    return cleaned.strip('_')

def generate_file_id() -> str:
    """Generate unique file ID"""
    return str(uuid.uuid4())

def calculate_tolerance_aware_distance(point1: Dict[str, float], 
                                     point2: Dict[str, float], 
                                     tolerances: Dict[str, float]) -> float:
    """Calculate tolerance-aware distance between two points"""
    squared_distance = 0
    
    for feature in point1.keys():
        if feature in point2 and feature in tolerances:
            tolerance = tolerances[feature]
            if tolerance > 0:
                diff = abs(point1[feature] - point2[feature])
                normalized_diff = diff / tolerance
                squared_distance += normalized_diff ** 2
    
    return (squared_distance ** 0.5) if squared_distance > 0 else 0