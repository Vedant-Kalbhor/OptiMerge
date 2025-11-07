from fastapi import FastAPI, UploadFile, File, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import pandas as pd
import os
from typing import List, Dict, Any
import json
import uuid
import re

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

def parse_weldment_excel(file_path: str) -> pd.DataFrame:
    """Parse weldment Excel file with complex headers"""
    try:
        # Read the Excel file
        df = pd.read_excel(file_path)
        
        print("Original columns:", df.columns.tolist())
        print("First few rows of data:")
        print(df.head())
        
        # If we have Unnamed columns, try to find the actual header row
        if all('unnamed' in str(col).lower() for col in df.columns):
            print("Detected Unnamed columns, trying to find header...")
            
            # Read the file again without header to see all data
            df_raw = pd.read_excel(file_path, header=None)
            print("Raw data shape:", df_raw.shape)
            print("Raw data:")
            print(df_raw.head(10))
            
            # Look for the row that contains 'Assy PN' - this should be our header
            header_row_idx = None
            for idx in range(min(10, len(df_raw))):
                row_values = df_raw.iloc[idx].values
                if 'Assy PN' in str(row_values[0]):
                    header_row_idx = idx
                    break
            
            if header_row_idx is not None:
                print(f"Found header at row {header_row_idx}")
                # Read with the correct header row
                df = pd.read_excel(file_path, header=header_row_idx)
                print("Columns after header detection:", df.columns.tolist())
            else:
                # If we can't find the header, use the first row and create meaningful column names
                print("Could not find header row, using first row as data")
                df = pd.read_excel(file_path, header=0)
                # Create meaningful column names based on position
                new_columns = [
                    'assy_pn',
                    'total_height_mm', 
                    'packed_tower_outer_dia_mm',
                    'packed_tower_inner_dia_mm',
                    'upper_flange_outer_dia_mm',
                    'upper_flange_inner_dia_mm',
                    'lower_flange_outer_dia_mm',
                    'spray_nozzle_center_distance',
                    'spray_nozzle_id',
                    'support_ring_height',
                    'support_ring_id'
                ]
                # Use as many columns as we have
                df.columns = new_columns[:len(df.columns)]
        
        # Clean the column names
        df.columns = [clean_column_name(col) for col in df.columns]
        print("Cleaned columns:", df.columns.tolist())
        
        return df
        
    except Exception as e:
        print(f"Error parsing Excel file: {str(e)}")
        raise

def validate_weldment_data(df: pd.DataFrame) -> pd.DataFrame:
    """Validate and clean weldment dimension data"""
    print("Validating weldment data...")
    print("Input columns:", df.columns.tolist())
    print("Data shape:", df.shape)
    
    # Remove completely empty rows
    df = df.dropna(how='all')
    
    # Check if we have the essential data
    if len(df) == 0:
        raise ValueError("No data found in the file")
    
    # Look for the Assy PN column (case insensitive and partial matches)
    assy_pn_col = None
    for col in df.columns:
        if 'assy' in col.lower() or 'pn' in col.lower() or 'part' in col.lower():
            assy_pn_col = col
            break
    
    if assy_pn_col is None:
        # If no Assy PN column found, use the first column
        assy_pn_col = df.columns[0]
        print(f"Using first column '{assy_pn_col}' as Assy PN")
    
    # Rename the Assy PN column for consistency
    df = df.rename(columns={assy_pn_col: 'assy_pn'})
    
    # Remove rows where Assy PN is empty
    df = df.dropna(subset=['assy_pn'])
    
    # Convert Assy PN to string and clean
    df['assy_pn'] = df['assy_pn'].astype(str).str.strip()
    
    # Identify numeric columns (excluding Assy PN)
    numeric_columns = [col for col in df.columns if col != 'assy_pn']
    
    # Convert numeric columns, forcing errors to NaN
    for col in numeric_columns:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors='coerce')
    
    print(f"Final data shape: {df.shape}")
    print("Final columns:", df.columns.tolist())
    print("Sample data:")
    print(df.head())
    
    return df

def validate_bom_data(df: pd.DataFrame) -> pd.DataFrame:
    """Validate and clean BOM data"""
    print("Validating BOM data...")
    print("BOM columns:", df.columns.tolist())
    
    # Clean column names
    df.columns = [clean_column_name(col) for col in df.columns]
    
    # Look for required columns with flexible matching
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
    
    # Convert numeric columns
    df['lev'] = pd.to_numeric(df['lev'], errors='coerce')
    df['quantity'] = pd.to_numeric(df['quantity'], errors='coerce')
    
    # Add assembly ID for grouping if not present
    if 'assembly_id' not in df.columns:
        df['assembly_id'] = 'default_assembly'
    
    print(f"BOM data validated. Records: {len(df)}")
    return df

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
            "record_count": len(validated_data)
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
            "record_count": len(validated_data)
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

# Simple analysis endpoints for demo
@app.post("/analyze/dimensional-clustering/")
async def analyze_dimensional_clustering(request: dict):
    """Perform dimensional clustering analysis"""
    try:
        weldment_file_id = request.get('weldment_file_id')
        if weldment_file_id not in weldment_data:
            raise HTTPException(status_code=404, detail="Weldment file not found")
        
        weldment_records = weldment_data[weldment_file_id]["data"]
        df = pd.DataFrame(weldment_records)
        
        print("Clustering data columns:", df.columns.tolist())
        print("Clustering data shape:", df.shape)
        
        # Simple clustering logic for demo
        numeric_cols = df.select_dtypes(include=['number']).columns
        
        if len(numeric_cols) < 2:
            return {
                "message": "Not enough numeric columns for clustering",
                "clusters": [],
                "metrics": {"n_clusters": 0, "n_samples": len(df)}
            }
        
        # Simple grouping based on first two numeric columns
        from sklearn.cluster import KMeans
        from sklearn.preprocessing import StandardScaler
        
        features = df[numeric_cols].fillna(0)
        scaler = StandardScaler()
        scaled_features = scaler.fit_transform(features)
        
        n_clusters = min(5, len(df) // 2)  # Simple cluster count determination
        kmeans = KMeans(n_clusters=n_clusters, random_state=42)
        clusters = kmeans.fit_predict(scaled_features)
        
        df['cluster'] = clusters
        
        # Prepare cluster results
        cluster_results = []
        for cluster_id in range(n_clusters):
            cluster_data = df[df['cluster'] == cluster_id]
            if len(cluster_data) > 0:
                cluster_results.append({
                    "cluster_id": int(cluster_id),
                    "member_count": len(cluster_data),
                    "members": cluster_data['assy_pn'].tolist(),
                    "representative": cluster_data.iloc[0]['assy_pn'],
                    "reduction_potential": max(0, len(cluster_data) - 1) / len(cluster_data) if len(cluster_data) > 0 else 0
                })
        
        analysis_id = generate_file_id()
        analysis_results[analysis_id] = {
            "type": "clustering",
            "result": {
                "clusters": cluster_results,
                "metrics": {
                    "n_clusters": n_clusters,
                    "n_samples": len(df)
                }
            }
        }
        
        return {
            "analysis_id": analysis_id,
            "clustering_result": {
                "clusters": cluster_results,
                "metrics": {
                    "n_clusters": n_clusters,
                    "n_samples": len(df)
                }
            }
        }
    
    except Exception as e:
        print(f"Clustering analysis failed: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Clustering analysis failed: {str(e)}")

@app.post("/analyze/bom-similarity/")
async def analyze_bom_similarity(request: dict):
    """Perform BOM similarity analysis"""
    try:
        bom_file_id = request.get('bom_file_id')
        if bom_file_id not in bom_data:
            raise HTTPException(status_code=404, detail="BOM file not found")
        
        bom_records = bom_data[bom_file_id]["data"]
        df = pd.DataFrame(bom_records)
        
        # Simple BOM analysis for demo
        assemblies = df['assembly_id'].unique() if 'assembly_id' in df.columns else ['default_assembly']
        
        # Create simple similarity matrix
        similarity_matrix = {}
        similar_pairs = []
        
        for i, assembly_a in enumerate(assemblies):
            similarity_matrix[assembly_a] = {}
            bom_a = df[df['assembly_id'] == assembly_a]
            components_a = set(bom_a['component'].unique())
            
            for j, assembly_b in enumerate(assemblies):
                if i != j:
                    bom_b = df[df['assembly_id'] == assembly_b]
                    components_b = set(bom_b['component'].unique())
                    
                    intersection = len(components_a.intersection(components_b))
                    union = len(components_a.union(components_b))
                    
                    similarity = intersection / union if union > 0 else 0
                    similarity_matrix[assembly_a][assembly_b] = similarity
                    
                    if similarity > 0.7:  # threshold
                        similar_pairs.append({
                            "bom_a": assembly_a,
                            "bom_b": assembly_b,
                            "similarity_score": similarity,
                            "common_components": intersection,
                            "unique_components_a": list(components_a - components_b),
                            "unique_components_b": list(components_b - components_a)
                        })
        
        analysis_id = generate_file_id()
        analysis_results[analysis_id] = {
            "type": "bom_analysis",
            "result": {
                "similarity_matrix": similarity_matrix,
                "similar_pairs": similar_pairs,
                "bom_statistics": {
                    "total_components": len(df),
                    "unique_components": df['component'].nunique(),
                    "total_assemblies": len(assemblies)
                }
            }
        }
        
        return {
            "analysis_id": analysis_id,
            "bom_analysis_result": {
                "similarity_matrix": similarity_matrix,
                "similar_pairs": similar_pairs,
                "bom_statistics": {
                    "total_components": len(df),
                    "unique_components": df['component'].nunique(),
                    "total_assemblies": len(assemblies)
                }
            }
        }
    
    except Exception as e:
        print(f"BOM analysis failed: {str(e)}")
        raise HTTPException(status_code=500, detail=f"BOM analysis failed: {str(e)}")

@app.get("/analysis/{analysis_id}")
async def get_analysis_results(analysis_id: str):
    """Get analysis results by ID"""
    if analysis_id not in analysis_results:
        raise HTTPException(status_code=404, detail="Analysis not found")
    
    return analysis_results[analysis_id]

@app.get("/")
async def root():
    return {"message": "BOM Optimization Tool API", "status": "running"}

@app.get("/health")
async def health_check():
    return {"status": "healthy", "timestamp": pd.Timestamp.now().isoformat()}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)