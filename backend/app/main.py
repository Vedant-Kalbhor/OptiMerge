from fastapi import FastAPI, UploadFile, File, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import pandas as pd
import numpy as np
import os
from typing import List, Dict, Any, Optional
import uuid
import re
import json
import numpy as np
from sklearn.cluster import KMeans, DBSCAN
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import silhouette_score
from scipy.cluster.hierarchy import linkage, fcluster
from sklearn.decomposition import PCA
from datetime import datetime
from .db import analysis_collection 
from bson import ObjectId

app = FastAPI(title="BOM Optimization Tool", version="1.0.0")

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Create uploads directory
os.makedirs("uploads", exist_ok=True)
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")

# In-memory storage
weldment_data = {}
bom_data = {}
analysis_results = {}

def generate_file_id():
    return str(uuid.uuid4())

def clean_column_name(column_name: str) -> str:
    """Clean column names for consistency"""
    if pd.isna(column_name) or column_name is None:
        return "unknown"
    cleaned = re.sub(r'[^a-zA-Z0-9]', '_', str(column_name).lower())
    cleaned = re.sub(r'_+', '_', cleaned)
    return cleaned.strip('_')

# BOM Analysis Functions
def preprocess_bom_file(bom_df: pd.DataFrame) -> pd.DataFrame:
    """Preprocess BOM file to create proper assembly_id from hierarchical structure"""
    # Normalize column names to lowercase
    bom_df.columns = bom_df.columns.str.lower().str.strip()
    
    # Ensure required columns exist
    if 'component' not in bom_df.columns:
        if 'component' in bom_df.columns:
            bom_df.rename(columns={'component': 'component'}, inplace=True)
    
    if 'lev' not in bom_df.columns:
        if 'lev' in bom_df.columns:
            bom_df.rename(columns={'lev': 'lev'}, inplace=True)
    
    # Create assembly_id based on Lev hierarchy
    current_assembly = None
    assembly_ids = []
    
    for idx, row in bom_df.iterrows():
        lev = row['lev']
        component = row['component']
        
        if lev == 0:
            current_assembly = component
            assembly_ids.append(current_assembly)
        else:
            if current_assembly is None:
                current_assembly = f"ASSY_{idx}"
            assembly_ids.append(current_assembly)
    
    bom_df['assembly_id'] = assembly_ids
    bom_df['is_assembly'] = bom_df['lev'] == 0
    
    print(f"Identified {bom_df[bom_df['is_assembly']]['assembly_id'].nunique()} unique assemblies")
    return bom_df

def compute_bom_similarity(assembly_components: Dict[str, Dict[str, float]], threshold: float) -> Dict[str, Any]:
    """
    Compute BOM similarity between assemblies, taking quantities into account.
    assembly_components: { assembly_id: { component_name: quantity, ... }, ... }
    threshold: percentage threshold (0-100) to include similar pairs
    """
    assemblies = list(assembly_components.keys())
    num_assemblies = len(assemblies)
    
    if num_assemblies < 2:
        return create_empty_bom_results()
    
    similarity_matrix = {}
    similar_pairs = []
    
    for i, assy1 in enumerate(assemblies):
        similarity_matrix[assy1] = {}
        comp_dict1 = assembly_components.get(assy1, {})
        
        for j, assy2 in enumerate(assemblies):
            comp_dict2 = assembly_components.get(assy2, {})
            
            # If both empty
            if not comp_dict1 and not comp_dict2:
                similarity = 100.0
            elif not comp_dict1 or not comp_dict2:
                similarity = 0.0
            else:
                # Weighted (quantity-aware) intersection and union
                all_components = set(comp_dict1.keys()).union(set(comp_dict2.keys()))
                intersection_qty = 0.0
                union_qty = 0.0
                for comp in all_components:
                    q1 = float(comp_dict1.get(comp, 0.0))
                    q2 = float(comp_dict2.get(comp, 0.0))
                    intersection_qty += min(q1, q2)
                    union_qty += max(q1, q2)
                
                # Avoid division by zero
                if union_qty == 0:
                    similarity = 0.0
                else:
                    similarity = (intersection_qty / union_qty) * 100.0
            
            similarity_matrix[assy1][assy2] = round(similarity, 2)
            
            # If pair (i<j) and crosses threshold, include details
            if i < j and similarity > threshold:
                # Build common_components as list of dicts with quantities
                common_components = []
                common_count = 0
                common_quantity_total = 0.0
                all_components = set(comp_dict1.keys()).union(set(comp_dict2.keys()))
                for comp in all_components:
                    q1 = float(comp_dict1.get(comp, 0.0))
                    q2 = float(comp_dict2.get(comp, 0.0))
                    if min(q1, q2) > 0:
                        common_qty = min(q1, q2)
                        common_components.append({
                            "component": comp,
                            "qty_a": q1,
                            "qty_b": q2,
                            "common_qty": common_qty
                        })
                        common_count += 1
                        common_quantity_total += common_qty
                
                unique_to_assy1 = [c for c in comp_dict1.keys() if c not in comp_dict2]
                unique_to_assy2 = [c for c in comp_dict2.keys() if c not in comp_dict1]
                
                similar_pairs.append({
                    "bom_a": assy1,
                    "bom_b": assy2,
                    "similarity_score": round(similarity / 100, 4),  # Scale to 0-1 for frontend
                    "common_components": common_components,  # list of objects {component, qty_a, qty_b, common_qty}
                    "unique_components_a": unique_to_assy1,
                    "unique_components_b": unique_to_assy2,
                    "common_count": common_count,
                    "common_quantity_total": common_quantity_total,
                    "unique_count_a": len(unique_to_assy1),
                    "unique_count_b": len(unique_to_assy2)
                })
    
    return {
        "similarity_matrix": similarity_matrix,
        "similar_pairs": similar_pairs
    }

def generate_replacement_suggestions(similar_pairs: List[Dict]) -> List[Dict]:
    """Generate replacement suggestions based on similar pairs"""
    suggestions = []
    
    for pair in similar_pairs[:5]:
        assy_a = pair["bom_a"]
        assy_b = pair["bom_b"]
        similarity = pair["similarity_score"]
        
        unique_a = pair.get("unique_count_a", 0)
        unique_b = pair.get("unique_count_b", 0)
        total_unique = unique_a + unique_b
        
        # Use common_quantity_total as a better savings estimate
        potential_savings = pair.get("common_quantity_total", pair.get("common_count", 0))
        
        suggestion = {
            "type": "bom_consolidation",
            "bom_a": assy_a,
            "bom_b": assy_b,
            "similarity_score": similarity,
            "suggestion": f"Consolidate {assy_a} and {assy_b} ({(similarity*100):.1f}% similar)",
            "confidence": similarity,
            "potential_savings": potential_savings,
            "details": {
                "common_components": pair.get("common_count", 0),
                "common_quantity_total": potential_savings,
                "unique_to_a": unique_a,
                "unique_to_b": unique_b
            }
        }
        suggestions.append(suggestion)
    
    return suggestions

def find_assembly_clusters(assemblies: List[str], similarity_matrix: Dict) -> List[List[str]]:
    """Group assemblies into clusters based on similarity"""
    clusters = []
    used_assemblies = set()
    
    for assembly in assemblies:
        if assembly not in used_assemblies:
            cluster = [assembly]
            used_assemblies.add(assembly)
            
            for other_assembly in assemblies:
                if (other_assembly not in used_assemblies and 
                    similarity_matrix.get(assembly, {}).get(other_assembly, 0) > 80):
                    cluster.append(other_assembly)
                    used_assemblies.add(other_assembly)
            
            clusters.append(cluster)
    
    return clusters

def calculate_reduction_potential(clusters: List[List[str]], total_assemblies: int) -> float:
    """Calculate potential reduction in number of assemblies"""
    if total_assemblies == 0:
        return 0.0
    
    total_reduction = 0
    for cluster in clusters:
        total_reduction += max(0, len(cluster) - 1)
    
    reduction_potential = (total_reduction / total_assemblies) * 100
    return round(reduction_potential, 1)

def create_empty_bom_results() -> Dict[str, Any]:
    """Create empty results structure"""
    return {
        "similarity_matrix": {},
        "similar_pairs": [],
        "replacement_suggestions": [],
        "bom_statistics": {
            "total_components": 0,
            "unique_components": 0,
            "total_assemblies": 0,
            "total_clusters": 0,
            "similar_pairs_count": 0,
            "reduction_potential": 0.0
        },
        "clusters": []
    }

def analyze_bom_data(bom_df: pd.DataFrame, threshold: float = 70.0) -> Dict[str, Any]:
    """Main BOM analysis function"""
    print("\n=== Starting BOM Analysis ===")
    
    # Preprocess the BOM data
    bom_df_processed = preprocess_bom_file(bom_df)
    
    # Filter out assembly rows for component analysis
    component_df = bom_df_processed[bom_df_processed['lev'] > 0].copy()
    
    # Get unique assemblies
    assemblies = component_df['assembly_id'].unique()
    num_assemblies = len(assemblies)
    
    print(f"Assemblies found: {num_assemblies}")
    
    if num_assemblies < 2:
        print("Need at least 2 assemblies for analysis")
        return create_empty_bom_results()
    
    # Create component -> quantity dicts for each assembly
    assembly_components = {}
    for assembly in assemblies:
        assembly_data = component_df[component_df['assembly_id'] == assembly]
        # Sum quantities for identical component names
        comp_qty = {}
        for _, r in assembly_data.iterrows():
            comp_name = str(r['component']).strip()
            qty = r.get('quantity', 0.0)
            try:
                qty = float(qty) if not pd.isna(qty) else 0.0
            except Exception:
                qty = 0.0
            comp_qty[comp_name] = comp_qty.get(comp_name, 0.0) + qty
        assembly_components[assembly] = comp_qty
    
    # Compute similarity (quantity-aware)
    similarity_results = compute_bom_similarity(assembly_components, threshold)
    
    # Generate additional results
    replacement_suggestions = generate_replacement_suggestions(similarity_results["similar_pairs"])
    clusters = find_assembly_clusters(list(assemblies), similarity_results["similarity_matrix"])
    
    # Calculate statistics
    total_components = len(component_df)
    unique_components = component_df['component'].nunique()
    reduction_potential = calculate_reduction_potential(clusters, num_assemblies)
    
    # Build final results - AVOID CIRCULAR REFERENCES
    final_results = {
        "similarity_matrix": similarity_results["similarity_matrix"],
        "similar_pairs": similarity_results["similar_pairs"],
        "replacement_suggestions": replacement_suggestions,
        "bom_statistics": {
            "total_components": total_components,
            "unique_components": unique_components,
            "total_assemblies": num_assemblies,
            "total_clusters": len(clusters),
            "similar_pairs_count": len(similarity_results["similar_pairs"]),
            "reduction_potential": reduction_potential
        },
        "clusters": clusters
    }
    
    print(f"Analysis complete: {num_assemblies} assemblies, {len(similarity_results['similar_pairs'])} similar pairs")
    return final_results

# File parsing functions
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
    """Validate that the DataFrame contains all required weldment columns (flexible matching)"""
    print("Validating weldment columns...")
    print("Columns received:", df.columns.tolist())

    # Define required logical column keys and their expected keywords
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

    # Normalize and clean column names for comparison
    cleaned_cols = [clean_column_name(col) for col in df.columns]

    def matches_pattern(col: str, keywords: list[str]) -> bool:
        return all(k in col for k in keywords)

    missing_columns = []
    for key, keywords in required_patterns.items():
        if not any(matches_pattern(col, keywords) for col in cleaned_cols):
            missing_columns.append(key)

    if missing_columns:
        print(f"Missing required columns: {missing_columns}")
        print(f"Available columns: {cleaned_cols}")
        return False

    print("✅ All required columns are present")
    return True


def validate_weldment_data(df: pd.DataFrame) -> pd.DataFrame:
    """Validate and clean weldment dimension data"""
    print("Validating weldment data...")
    print("Input columns:", df.columns.tolist())
    print("Data shape:", df.shape)

    # Clean all column names once for consistency
    df.columns = [clean_column_name(col) for col in df.columns]

    # Check if required columns exist (using flexible validation)
    if not validate_weldment_columns(df):
        raise ValueError("Weldment file is missing required columns. Please ensure the file contains all 11 required columns.")

    # Remove empty rows
    df = df.dropna(how='all')
    if len(df) == 0:
        raise ValueError("No data found in the file")

    # Ensure 'assy_pn' column exists
    if 'assy_pn' not in df.columns:
        raise ValueError("Missing 'Assy PN' column after cleaning")

    # Drop rows without Assy PN
    df = df.dropna(subset=['assy_pn'])
    df['assy_pn'] = df['assy_pn'].astype(str).str.strip()

    # Convert all other numeric columns
    numeric_columns = [col for col in df.columns if col != 'assy_pn']
    for col in numeric_columns:
        df[col] = pd.to_numeric(df[col], errors='coerce')

    print(f"✅ Weldment data validated successfully. Shape: {df.shape}")
    print("Final columns:", df.columns.tolist())
    return df


def validate_bom_data(df: pd.DataFrame) -> pd.DataFrame:
    """Validate and clean BOM data"""
    print("Validating BOM data...")
    print("BOM columns:", df.columns.tolist())
    
    # Clean column names
    df.columns = [clean_column_name(col) for col in df.columns]
    
    # Find required columns
    component_col = None
    lev_col = None
    quantity_col = None
    
    for col in df.columns:
        col_lower = col.lower()
        if 'component' in col_lower or 'part' in col_lower:
            component_col = col
        elif 'lev' in col_lower or 'level' in col_lower:
            lev_col = col
        elif 'quantity' in col_lower or 'qty' in col_lower:
            quantity_col = col
    
    # If we found the columns, rename them for consistency
    if component_col:
        df = df.rename(columns={component_col: 'component'})
    if lev_col:
        df = df.rename(columns={lev_col: 'lev'})
    if quantity_col:
        df = df.rename(columns={quantity_col: 'quantity'})
    
    # Check if we have the required columns
    missing_columns = []
    if 'component' not in df.columns:
        missing_columns.append('component')
    if 'lev' not in df.columns:
        missing_columns.append('lev')
    if 'quantity' not in df.columns:
        missing_columns.append('quantity')
    
    if missing_columns:
        raise ValueError(f"Missing required columns: {missing_columns}. Available columns: {df.columns.tolist()}")
    
    # Remove empty rows
    df = df.dropna(subset=['component'])
    df['lev'] = pd.to_numeric(df['lev'], errors='coerce')
    if 'quantity' in df.columns:
        df['quantity'] = pd.to_numeric(df['quantity'], errors='coerce').fillna(0)
    else:
        df['quantity'] = 0
    
    # Convert numeric columns
    df['lev'] = pd.to_numeric(df['lev'], errors='coerce')
    df['quantity'] = pd.to_numeric(df['quantity'], errors='coerce').fillna(0)
    
    # Add assembly ID for grouping if not present
    if 'assembly_id' not in df.columns:
        # Try to infer assembly from component structure
        if 'assy' in df.columns.tolist():
            df = df.rename(columns={'assy': 'assembly_id'})
        else:
            # Group by level 0 components as assemblies
            level_0_components = df[df['lev'] == 0]['component'].unique()
            if len(level_0_components) > 0:
                df['assembly_id'] = df['component'].apply(
                    lambda x: next((comp for comp in level_0_components if str(comp) in str(x)), 'default_assembly')
                )
            else:
                df['assembly_id'] = 'default_assembly'
    
    print(f"BOM data validated. Records: {len(df)}")
    print("Assembly IDs:", df['assembly_id'].unique())
    return df

# API Endpoints
@app.post("/upload/weldments/")
async def upload_weldments(file: UploadFile = File(...)):
    """Upload weldment dimensions file"""
    try:
        print(f"Processing weldment file: {file.filename}")
        
        # Validate file type
        if not file.filename.endswith(('.xlsx', '.xls', '.csv')):
            raise HTTPException(status_code=400, detail="Only Excel and CSV files are supported")
        
        file_path = f"uploads/{file.filename}"
        with open(file_path, "wb") as buffer:
            content = await file.read()
            buffer.write(content)
        
        # Read and parse the file
        if file.filename.endswith('.csv'):
            df = pd.read_csv(file_path)
        else:
            df = parse_weldment_excel(file_path)
        
        # Validate and clean the data
        validated_data = validate_weldment_data(df)
        
        # Store the data
        file_id = generate_file_id()
        weldment_data[file_id] = {
            "filename": file.filename,
            "data": validated_data.to_dict('records'),
            "file_path": file_path,
            "columns": validated_data.columns.tolist(),
            "record_count": len(validated_data),
            "dataframe": validated_data  # Store the actual DataFrame for analysis
        }
        
        return {
            "message": "File uploaded successfully",
            "file_id": file_id,
            "record_count": len(validated_data),
            "columns": validated_data.columns.tolist()
        }
    
    except Exception as e:
        print(f"Error processing weldment file: {str(e)}")
        raise HTTPException(status_code=400, detail=f"Error processing file: {str(e)}")

@app.post("/upload/boms/")
async def upload_boms(file: UploadFile = File(...)):
    """Upload BOM file"""
    try:
        print(f"Processing BOM file: {file.filename}")
        
        # Validate file type
        if not file.filename.endswith(('.xlsx', '.xls', '.csv')):
            raise HTTPException(status_code=400, detail="Only Excel and CSV files are supported")
        
        file_path = f"uploads/{file.filename}"
        with open(file_path, "wb") as buffer:
            content = await file.read()
            buffer.write(content)
        
        # Read the file
        if file.filename.endswith('.csv'):
            df = pd.read_csv(file_path)
        else:
            # Try to read specific sheet for BOM data
            try:
                xl = pd.ExcelFile(file_path)
                sheet_names = xl.sheet_names
                print(f"Available sheets: {sheet_names}")
                
                # Look for sheets that might contain BOM data
                bom_sheets = [name for name in sheet_names if 'bom' in name.lower() or 'assy' in name.lower()]
                if bom_sheets:
                    df = pd.read_excel(file_path, sheet_name=bom_sheets[0])
                    print(f"Using sheet: {bom_sheets[0]}")
                else:
                    df = pd.read_excel(file_path)  # Use first sheet
            except Exception as e:
                df = pd.read_excel(file_path)  # Fallback to first sheet
        
        print(f"Original BOM columns: {df.columns.tolist()}")
        print(f"BOM Data shape: {df.shape}")
        
        # Validate and clean the data
        validated_data = validate_bom_data(df)
        
        # Store the data
        file_id = generate_file_id()
        bom_data[file_id] = {
            "filename": file.filename,
            "data": validated_data.to_dict('records'),
            "file_path": file_path,
            "columns": validated_data.columns.tolist(),
            "record_count": len(validated_data),
            "dataframe": validated_data  # Store the actual DataFrame for analysis
        }
        
        return {
            "message": "BOM file uploaded successfully",
            "file_id": file_id,
            "record_count": len(validated_data),
            "columns": validated_data.columns.tolist()
        }
    
    except Exception as e:
        print(f"Error processing BOM file: {str(e)}")
        raise HTTPException(status_code=400, detail=f"Error processing file: {str(e)}")

@app.get("/files/weldments/")
async def get_weldment_files():
    """Get list of uploaded weldment files"""
    return [
        {
            "file_id": fid, 
            "filename": data["filename"], 
            "record_count": data["record_count"],
            "columns": data["columns"]
        }
        for fid, data in weldment_data.items()
    ]

@app.get("/files/boms/")
async def get_bom_files():
    """Get list of uploaded BOM files"""
    return [
        {
            "file_id": fid, 
            "filename": data["filename"], 
            "record_count": data["record_count"],
            "columns": data["columns"]
        }
        for fid, data in bom_data.items()
    ]

@app.get("/weldment-data/{file_id}")
async def get_weldment_data(file_id: str):
    """Get actual weldment data for visualization"""
    if file_id not in weldment_data:
        raise HTTPException(status_code=404, detail="Weldment file not found")
    
    return {
        "data": weldment_data[file_id]["data"],
        "columns": weldment_data[file_id]["columns"]
    }


# 👉👉👉👉
@app.post("/analyze/dimensional-clustering/")
async def analyze_dimensional_clustering(request: dict):
    """Perform dimensional clustering analysis with PCA-based visualization"""
    try:
        weldment_file_id = request.get('weldment_file_id')
        clustering_method = request.get('clustering_method', 'kmeans')
        n_clusters = request.get('n_clusters')
        tolerance = request.get('tolerance', 0.1)
        
        if weldment_file_id not in weldment_data:
            raise HTTPException(status_code=404, detail="Weldment file not found")
        
        df = weldment_data[weldment_file_id]["dataframe"]
        numeric_cols = df.select_dtypes(include=[np.number]).columns.tolist()
        if len(numeric_cols) < 2:
            raise HTTPException(status_code=400, detail="Not enough numeric columns for clustering")

        # Standardize numeric data
        features = df[numeric_cols].fillna(0)
        scaler = StandardScaler()
        scaled_features = scaler.fit_transform(features)

        # Determine n_clusters safely (Find optimal number of clusters)
        if n_clusters is not None:
            try:
                n_clusters = max(2, min(int(n_clusters), len(df)))
            except (ValueError, TypeError):
                n_clusters = None
        if n_clusters is None:
            n_clusters = min(5, max(2, len(df)//3))

        # --- Perform clustering ---
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

        df['cluster'] = clusters

        # --- PCA for visualization ---
        pca = PCA(n_components=2)
        pca_features = pca.fit_transform(scaled_features)
        df['PC1'], df['PC2'] = pca_features[:, 0], pca_features[:, 1]

        explained_var = pca.explained_variance_ratio_.sum()
        print(f"PCA visualization variance retained: {explained_var:.2%}")

        # --- Cluster summary ---
        cluster_results = []
        unique_clusters = np.unique(clusters)
        for cluster_id in unique_clusters:
            if cluster_id == -1:
                continue
            cluster_data = df[df['cluster'] == cluster_id]
            if len(cluster_data) == 0:
                continue
            representative = cluster_data.iloc[0]['assy_pn']
            cluster_results.append({
                "cluster_id": int(cluster_id),
                "member_count": len(cluster_data),
                "members": cluster_data['assy_pn'].tolist(),
                "representative": representative,
                "reduction_potential": max(0, len(cluster_data) - 1) / len(cluster_data)
            })

        # --- Visualization data for frontend ---
        visualization_data = []
        for _, row in df.iterrows():
            visualization_data.append({
                "assy_pn": row.get("assy_pn", ""),
                "cluster": int(row["cluster"]),
                "PC1": row["PC1"],
                "PC2": row["PC2"]
            })

        analysis_id = generate_file_id()
        silhouette = silhouette_score(scaled_features, clusters) if len(unique_clusters) > 1 else 0

        # --- Store analysis results ---
        analysis_results[analysis_id] = {
            "type": "clustering",
            "clustering": {
                "clusters": cluster_results,
                "metrics": {
                    "n_clusters": len(cluster_results),
                    "n_samples": len(df),
                    "silhouette_score": silhouette,
                    "explained_variance_ratio": round(float(explained_var), 4)
                },
                "visualization_data": visualization_data,
                "numeric_columns": numeric_cols
            },
            "bom_analysis": {
                "similar_pairs": [],
                "replacement_suggestions": []
            }
        }
        
        
        # ✅ SAVE TO MONGODB IMMEDIATELY
        save_analysis_to_mongodb(analysis_id, "Dimensional Clustering", analysis_results[analysis_id])
        
        return {
            "analysis_id": analysis_id,
            "clustering_result": analysis_results[analysis_id]["clustering"],
            "bom_analysis_result": analysis_results[analysis_id]["bom_analysis"]
        }

    except Exception as e:
        print(f"Clustering analysis failed: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Clustering analysis failed: {str(e)}")


@app.post("/analyze/bom-similarity/")
async def analyze_bom_similarity(request: dict):
    """Perform BOM similarity analysis with real data"""
    try:
        bom_file_id = request.get('bom_file_id')
        similarity_method = request.get('similarity_method', 'jaccard')
        threshold = request.get('threshold', 0.7)  # Lowered threshold to find more matches
        
        if bom_file_id not in bom_data:
            raise HTTPException(status_code=404, detail="BOM file not found")
        
        # Get the actual DataFrame
        df = bom_data[bom_file_id]["dataframe"]
        
        print("=== Starting BOM Similarity Analysis ===")
        print(f"BOM data shape: {df.shape}")
        print(f"Assemblies found: {df['assembly_id'].unique()}")
        
        # Use the proper BOM analysis function
        threshold_percent = threshold * 100
        analysis_results_local = analyze_bom_data(df, threshold_percent)  # Pass the threshold

        
        analysis_id = generate_file_id()
        
        # Store complete analysis results
        analysis_results_store = {
            "type": "bom_analysis",
            "clustering": {
                "clusters": analysis_results_local.get("clusters", []),
                "metrics": {
                    "n_clusters": len(analysis_results_local.get("clusters", [])),
                    "n_samples": len(df),
                    "silhouette_score": 0
                },
                "visualization_data": [],
                "numeric_columns": []
            },
            "bom_analysis": {
                "similarity_matrix": analysis_results_local.get("similarity_matrix", {}),
                "similar_pairs": analysis_results_local.get("similar_pairs", []),
                "replacement_suggestions": analysis_results_local.get("replacement_suggestions", []),
                "bom_statistics": analysis_results_local.get("bom_statistics", {})
            }
        }
        
        # Store in global analysis results
        analysis_results[analysis_id] = analysis_results_store
        
        # Store in global analysis results
        analysis_results[analysis_id] = analysis_results_store

        # ✅ SAVE TO MONGODB IMMEDIATELY
        save_analysis_to_mongodb(analysis_id, "BOM Similarity Analysis", analysis_results_store)
        
        return {
            "analysis_id": analysis_id,
            "clustering_result": analysis_results_store["clustering"],
            "bom_analysis_result": analysis_results_store["bom_analysis"]
        }
    
    except Exception as e:
        print(f"BOM analysis error: {str(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"BOM analysis failed: {str(e)}")

@app.get("/analysis/{analysis_id}")
async def get_analysis(analysis_id: str):
    # Look by _id because your UUID is stored in _id
    print(analysis_id)
    analysis = analysis_collection.find_one({"id": analysis_id})
    if not analysis:
        raise HTTPException(status_code=404, detail="Analysis not found")

    # # convert from Mongo for JSON response
    analysis["_id"] = str(analysis["_id"])

    return analysis
    # Look by _id because your UUID is stored in _id
    print(analysis_id)
    analysis = analysis_collection.find_one({"id": analysis_id})
    if not analysis:
        raise HTTPException(status_code=404, detail="Analysis not found")

    # # convert from Mongo for JSON response
    analysis["_id"] = str(analysis["_id"])

    return analysis

@app.get("/recent-analyses")
async def recent_analyses():
    docs = list(analysis_collection.find().sort("created_at", -1))
    
    # Convert ObjectId to string
    for d in docs:
        d["_id"] = str(d["_id"])
    
    return docs

def save_analysis_to_mongodb(analysis_id: str, analysis_type: str, result: dict):
    """Save analysis result to MongoDB immediately after creation"""
    try:
        document = {
            "id": analysis_id,
            "type": analysis_type,
            "date": datetime.utcnow().strftime("%Y-%m-%d"),
            "status": "completed",
            "raw": result,
            "created_at": datetime.utcnow()
        }
        
        analysis_collection.replace_one(
            {"id": analysis_id},
            document,
            upsert=True
        )
        print(f"✅ Analysis {analysis_id} saved to MongoDB successfully")
    except Exception as e:
        print(f"❌ Error saving to MongoDB: {str(e)}")
        # Don't raise exception - we still want to return results even if MongoDB fails
        
        

@app.get("/")
async def root():
    return {"message": "BOM Optimization Tool API", "status": "running"}

@app.get("/health")
async def health_check():
    return {"status": "healthy", "timestamp": pd.Timestamp.now().isoformat()}

if __name__ == "__main__":
    
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
