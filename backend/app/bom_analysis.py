import pandas as pd
import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity
from typing import Dict, List, Any, Tuple
from collections import defaultdict

def analyze_bom_similarity(bom_df: pd.DataFrame) -> Dict[str, Any]:
    """
    Analyze BOM similarity and suggest replacements
    """
    # Group by assembly
    assemblies = bom_df['assembly_id'].unique() if 'assembly_id' in bom_df.columns else ['default_assembly']
    
    if 'assembly_id' not in bom_df.columns:
        bom_df['assembly_id'] = 'default_assembly'
    
    # Create BOM representations
    bom_vectors = create_bom_vectors(bom_df)
    
    # Calculate similarity matrix
    similarity_matrix = calculate_similarity_matrix(bom_vectors)
    
    # Find similar BOM pairs
    similar_pairs = find_similar_bom_pairs(bom_vectors, similarity_matrix)
    
    # Generate replacement suggestions
    replacement_suggestions = generate_replacement_suggestions(bom_df, similar_pairs)
    
    return {
        "similarity_matrix": similarity_matrix,
        "similar_pairs": similar_pairs,
        "replacement_suggestions": replacement_suggestions,
        "bom_statistics": calculate_bom_statistics(bom_df)
    }

def create_bom_vectors(bom_df: pd.DataFrame) -> Dict[str, Dict[str, float]]:
    """Create vector representations for each BOM"""
    bom_vectors = {}
    
    for assembly in bom_df['assembly_id'].unique():
        assembly_bom = bom_df[bom_df['assembly_id'] == assembly]
        
        # Create component-frequency dictionary
        component_freq = {}
        for _, row in assembly_bom.iterrows():
            component = row['component']
            quantity = row.get('quantity', 1)
            component_freq[component] = component_freq.get(component, 0) + quantity
        
        bom_vectors[assembly] = component_freq
    
    return bom_vectors

def calculate_similarity_matrix(bom_vectors: Dict[str, Dict[str, float]]) -> Dict[str, Dict[str, float]]:
    """Calculate similarity matrix between all BOM pairs"""
    all_components = set()
    for bom in bom_vectors.values():
        all_components.update(bom.keys())
    
    all_components = list(all_components)
    similarity_matrix = {}
    
    for bom_a in bom_vectors:
        similarity_matrix[bom_a] = {}
        vector_a = [bom_vectors[bom_a].get(comp, 0) for comp in all_components]
        
        for bom_b in bom_vectors:
            vector_b = [bom_vectors[bom_b].get(comp, 0) for comp in all_components]
            
            # Calculate Jaccard similarity
            set_a = set(bom_vectors[bom_a].keys())
            set_b = set(bom_vectors[bom_b].keys())
            
            intersection = len(set_a.intersection(set_b))
            union = len(set_a.union(set_b))
            
            jaccard_similarity = intersection / union if union > 0 else 0
            
            similarity_matrix[bom_a][bom_b] = jaccard_similarity
    
    return similarity_matrix

def find_similar_bom_pairs(bom_vectors: Dict[str, Dict[str, float]], 
                          similarity_matrix: Dict[str, Dict[str, float]], 
                          threshold: float = 0.8) -> List[Dict[str, Any]]:
    """Find BOM pairs with similarity above threshold"""
    similar_pairs = []
    processed_pairs = set()
    
    for bom_a in bom_vectors:
        for bom_b in bom_vectors:
            if bom_a != bom_b and (bom_b, bom_a) not in processed_pairs:
                similarity = similarity_matrix[bom_a][bom_b]
                
                if similarity >= threshold:
                    common_components = set(bom_vectors[bom_a].keys()).intersection(
                        set(bom_vectors[bom_b].keys())
                    )
                    unique_a = set(bom_vectors[bom_a].keys()) - common_components
                    unique_b = set(bom_vectors[bom_b].keys()) - common_components
                    
                    similar_pairs.append({
                        "bom_a": bom_a,
                        "bom_b": bom_b,
                        "similarity_score": similarity,
                        "common_components": len(common_components),
                        "unique_components_a": list(unique_a),
                        "unique_components_b": list(unique_b)
                    })
                    
                    processed_pairs.add((bom_a, bom_b))
    
    # Sort by similarity score
    similar_pairs.sort(key=lambda x: x["similarity_score"], reverse=True)
    
    return similar_pairs

def generate_replacement_suggestions(bom_df: pd.DataFrame, 
                                   similar_pairs: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Generate replacement suggestions based on similar BOMs"""
    suggestions = []
    
    for pair in similar_pairs[:10]:  # Limit to top 10
        if pair["similarity_score"] > 0.9:
            suggestion = {
                "type": "bom_consolidation",
                "bom_a": pair["bom_a"],
                "bom_b": pair["bom_b"],
                "similarity_score": pair["similarity_score"],
                "suggestion": f"Consider consolidating {pair['bom_a']} and {pair['bom_b']}",
                "confidence": pair["similarity_score"],
                "potential_savings": len(pair["unique_components_a"]) + len(pair["unique_components_b"])
            }
            suggestions.append(suggestion)
    
    return suggestions

def calculate_bom_statistics(bom_df: pd.DataFrame) -> Dict[str, Any]:
    """Calculate BOM statistics"""
    total_components = len(bom_df)
    unique_components = bom_df['component'].nunique()
    assemblies = bom_df['assembly_id'].nunique() if 'assembly_id' in bom_df.columns else 1
    
    component_frequency = bom_df['component'].value_counts().to_dict()
    
    return {
        "total_components": total_components,
        "unique_components": unique_components,
        "total_assemblies": assemblies,
        "component_frequency": component_frequency,
        "avg_components_per_assembly": total_components / assemblies if assemblies > 0 else 0
    }