import pandas as pd
import numpy as np
from typing import Dict, List, Any

def preprocess_bom_file(bom_df: pd.DataFrame) -> pd.DataFrame:
    """
    Preprocess BOM file to create proper assembly_id from hierarchical structure.
    
    The Lev column indicates hierarchy:
    - Lev=0: Top-level assemblies (these become assembly_ids)
    - Lev>0: Child components belonging to the last Lev=0 assembly
    """
    
    # Normalize column names to lowercase
    bom_df.columns = bom_df.columns.str.lower().str.strip()
    
    # Ensure required columns exist
    if 'component' not in bom_df.columns:
        if 'Component' in bom_df.columns:
            bom_df.rename(columns={'Component': 'component'}, inplace=True)
    
    if 'lev' not in bom_df.columns:
        if 'Lev' in bom_df.columns:
            bom_df.rename(columns={'Lev': 'lev'}, inplace=True)
    
    # Create assembly_id based on Lev hierarchy
    current_assembly = None
    assembly_ids = []
    
    for idx, row in bom_df.iterrows():
        lev = row['lev']
        component = row['component']
        
        if lev == 0:
            # This is a top-level assembly
            current_assembly = component
            assembly_ids.append(current_assembly)
        else:
            # This is a child component of the current assembly
            if current_assembly is None:
                # No parent found, create a default
                current_assembly = f"ASSY_{idx}"
            assembly_ids.append(current_assembly)
    
    bom_df['assembly_id'] = assembly_ids
    
    # FIXED: Keep ALL rows for analysis but mark assembly rows
    bom_df['is_assembly'] = bom_df['lev'] == 0
    
    print(f"Identified {bom_df[bom_df['is_assembly']]['assembly_id'].nunique()} unique assemblies")
    print(f"Assembly breakdown:")
    assembly_counts = bom_df[~bom_df['is_assembly']]['assembly_id'].value_counts()
    print(assembly_counts)
    
    return bom_df

def analyze_bom_similarity(bom_df: pd.DataFrame) -> Dict[str, Any]:
    """
    Perform comprehensive BOM similarity analysis
    """
    print("\n=== Starting BOM Similarity Analysis ===")
    
    # Filter out assembly rows (Lev=0) for component analysis
    component_df = bom_df[bom_df['lev'] > 0].copy()
    
    # Get unique assemblies from the assembly_id column
    assemblies = component_df['assembly_id'].unique()
    num_assemblies = len(assemblies)
    
    print(f"Number of assemblies for analysis: {num_assemblies}")
    print(f"Assemblies: {list(assemblies)}")
    
    if num_assemblies < 2:
        print("WARNING: Need at least 2 assemblies for similarity analysis")
        return create_empty_results()
    
    # Create component sets for each assembly
    assembly_components = {}
    assembly_quantities = {}
    
    for assembly in assemblies:
        assembly_data = component_df[component_df['assembly_id'] == assembly]
        components = set(assembly_data['component'].tolist())
        assembly_components[assembly] = components
        
        # Store quantities for each component
        quantities = {}
        for _, row in assembly_data.iterrows():
            quantities[row['component']] = row.get('quantity', 1)
        assembly_quantities[assembly] = quantities
    
    # Create similarity matrix and find similar pairs
    similarity_matrix = {}
    similar_pairs = []
    assemblies_list = list(assemblies)
    
    for i, assy1 in enumerate(assemblies_list):
        similarity_matrix[assy1] = {}
        set1 = assembly_components[assy1]
        
        for j, assy2 in enumerate(assemblies_list):
            set2 = assembly_components[assy2]
            
            if i == j:
                similarity = 100.0
            else:
                # Calculate Jaccard similarity
                if len(set1) == 0 and len(set2) == 0:
                    similarity = 100.0
                elif len(set1) == 0 or len(set2) == 0:
                    similarity = 0.0
                else:
                    intersection = len(set1.intersection(set2))
                    union = len(set1.union(set2))
                    similarity = (intersection / union) * 100
            
            similarity_matrix[assy1][assy2] = round(similarity, 2)
            
            # Track similar pairs (similarity > 70%)
            if i < j and similarity > 70:
                common_components = list(set1.intersection(set2))
                unique_to_assy1 = list(set1 - set2)
                unique_to_assy2 = list(set2 - set1)
                
                similar_pairs.append({
                    "bom_a": assy1,
                    "bom_b": assy2,
                    "similarity_score": round(similarity / 100, 4),  # Scale to 0-1 for frontend
                    "common_components": common_components,
                    "unique_components_a": unique_to_assy1,
                    "unique_components_b": unique_to_assy2,
                    "common_count": len(common_components),
                    "unique_count_a": len(unique_to_assy1),
                    "unique_count_b": len(unique_to_assy2)
                })
    
    # Generate replacement suggestions
    replacement_suggestions = generate_replacement_suggestions(similar_pairs, assembly_components)
    
    # Calculate clusters
    clusters = find_assembly_clusters(assemblies_list, similarity_matrix)
    
    # Calculate overall statistics
    total_components = len(component_df)
    unique_components = component_df['component'].nunique()
    
    # Calculate reduction potential
    reduction_potential = calculate_reduction_potential(clusters, num_assemblies)
    
    print(f"\n=== Analysis Results ===")
    print(f"Total assemblies: {num_assemblies}")
    print(f"Total components: {total_components}")
    print(f"Unique components: {unique_components}")
    print(f"Similar pairs found: {len(similar_pairs)}")
    print(f"Clusters found: {len(clusters)}")
    print(f"Reduction potential: {reduction_potential}%")
    
    return {
        "similarity_matrix": similarity_matrix,
        "similar_pairs": similar_pairs,
        "replacement_suggestions": replacement_suggestions,
        "bom_statistics": {
            "total_components": total_components,
            "unique_components": unique_components,
            "total_assemblies": num_assemblies,
            "total_clusters": len(clusters),
            "similar_pairs_count": len(similar_pairs),
            "reduction_potential": reduction_potential
        },
        "clusters": clusters
    }

def generate_replacement_suggestions(similar_pairs: List[Dict], assembly_components: Dict) -> List[Dict]:
    """Generate replacement suggestions based on similar pairs"""
    suggestions = []
    
    for pair in similar_pairs[:5]:  # Limit to top 5 suggestions
        assy_a = pair["bom_a"]
        assy_b = pair["bom_b"]
        similarity = pair["similarity_score"]
        
        # Calculate potential savings
        unique_a = len(pair["unique_components_a"])
        unique_b = len(pair["unique_components_b"])
        total_unique = unique_a + unique_b
        common = pair["common_count"]
        
        # Estimate savings based on component reduction
        potential_savings = min(total_unique * 10, 100)  # Simplified calculation
        
        suggestion = {
            "type": "bom_consolidation",
            "bom_a": assy_a,
            "bom_b": assy_b,
            "similarity_score": similarity,
            "suggestion": f"Consolidate {assy_a} and {assy_b} ({(similarity*100):.1f}% similar)",
            "confidence": similarity,
            "potential_savings": potential_savings,
            "details": {
                "common_components": common,
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
            
            # Find similar assemblies (similarity > 80%)
            for other_assembly in assemblies:
                if (other_assembly not in used_assemblies and 
                    similarity_matrix[assembly][other_assembly] > 80):
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
        # For each cluster, we can reduce (n-1) assemblies
        total_reduction += max(0, len(cluster) - 1)
    
    reduction_potential = (total_reduction / total_assemblies) * 100
    return round(reduction_potential, 1)

def create_empty_results() -> Dict[str, Any]:
    """Create empty results structure for when analysis isn't possible"""
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

def analyze_bom_structure(bom_df: pd.DataFrame):
    """
    Analyze BOM structure to understand hierarchy
    """
    print("\n=== BOM Structure Analysis ===")
    print(f"Total rows: {len(bom_df)}")
    print(f"\nLevel distribution:")
    print(bom_df['lev'].value_counts().sort_index())
    
    print(f"\nComponents at each level:")
    for lev in sorted(bom_df['lev'].unique()):
        components = bom_df[bom_df['lev'] == lev]['component'].tolist()
        print(f"Level {lev}: {len(components)} components")
        if lev == 0:
            print(f"  Top assemblies: {components[:5]}...")  # Show first 5
    
    print(f"\nComponent prefixes:")
    prefixes = bom_df['component'].astype(str).str[0].value_counts()
    print(prefixes)

# For backward compatibility
def process_uploaded_bom(file_path: str) -> Dict[str, Any]:
    """
    Read and process BOM file with proper assembly identification
    Returns analysis results
    """
    try:
        # Read the Excel file
        bom_df = pd.read_excel(file_path, sheet_name='3 Assy Bom')
        
        print(f"Original BOM shape: {bom_df.shape}")
        print(f"Original columns: {bom_df.columns.tolist()}")
        
        # Preprocess to create proper assembly_ids
        bom_df_processed = preprocess_bom_file(bom_df)
        
        # Perform similarity analysis
        results = analyze_bom_similarity(bom_df_processed)
        
        return results
        
    except Exception as e:
        print(f"Error processing BOM file: {e}")
        return create_empty_results()