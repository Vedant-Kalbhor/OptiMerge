# /mnt/data/bom_utils.py
import pandas as pd
import numpy as np
from typing import Dict, Any, List
import math
import re

def clean_column_name(column_name: str) -> str:
    """Same cleaning helper used in BOM logic"""
    if pd.isna(column_name) or column_name is None:
        return "unknown"
    cleaned = re.sub(r'[^a-zA-Z0-9]', '_', str(column_name).lower())
    cleaned = re.sub(r'_+', '_', cleaned)
    return cleaned.strip('_')

# --- BOM preprocessing ---
def preprocess_bom_file(bom_df: pd.DataFrame) -> pd.DataFrame:
    """Preprocess BOM file to create assembly_id from Lev hierarchy"""
    bom_df.columns = bom_df.columns.str.lower().str.strip()

    # Create assembly IDs based on lev
    current_assembly = None
    assembly_ids = []
    for idx, row in bom_df.iterrows():
        lev = row.get('lev', None)
        component = row.get('component', None)
        if lev == 0:
            current_assembly = component
            assembly_ids.append(current_assembly)
        else:
            if current_assembly is None:
                current_assembly = f"ASSY_{idx}"
            assembly_ids.append(current_assembly)

    bom_df['assembly_id'] = assembly_ids
    bom_df['is_assembly'] = bom_df['lev'] == 0
    return bom_df


# --- BOM validators/parsers ---
def validate_bom_data(df: pd.DataFrame) -> pd.DataFrame:
    """Validate and clean BOM data (keeps behavior from original main.py)"""
    print("Validating BOM data...")
    print("BOM columns:", df.columns.tolist())
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

    if component_col:
        df = df.rename(columns={component_col: 'component'})
    if lev_col:
        df = df.rename(columns={lev_col: 'lev'})
    if quantity_col:
        df = df.rename(columns={quantity_col: 'quantity'})

    missing_columns = []
    if 'component' not in df.columns:
        missing_columns.append('component')
    if 'lev' not in df.columns:
        missing_columns.append('lev')
    if 'quantity' not in df.columns:
        missing_columns.append('quantity')

    if missing_columns:
        raise ValueError(f"Missing required columns: {missing_columns}. Available columns: {df.columns.tolist()}")

    df = df.dropna(subset=['component'])
    df['lev'] = pd.to_numeric(df['lev'], errors='coerce')
    df['quantity'] = pd.to_numeric(df.get('quantity', 0), errors='coerce').fillna(0)

    if 'assembly_id' not in df.columns:
        level_0_components = df[df['lev'] == 0]['component'].unique()
        if len(level_0_components) > 0:
            df['assembly_id'] = df['component'].apply(
                lambda x: next((comp for comp in level_0_components if str(comp) in str(x)), 'default_assembly')
            )
        else:
            df['assembly_id'] = 'default_assembly'

    print(f"BOM data validated. Records: {len(df)}")
    return df


# --- BOM analysis logic (quantity-aware) ---
def create_empty_bom_results() -> Dict[str, Any]:
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


def compute_bom_similarity(assembly_components: Dict[str, Dict[str, float]], threshold: float) -> Dict[str, Any]:
    """
    Compute BOM similarity between assemblies using STANDARD Jaccard on UNIQUE components.

    J(A, B) = |components(A) ∩ components(B)| / |components(A) ∪ components(B)|

    assembly_components: { assembly_id: { component_name: quantity, ... }, ... }
    threshold: percentage threshold (0-100) used to decide which pairs to keep
    """
    assemblies = list(assembly_components.keys())
    num_assemblies = len(assemblies)

    if num_assemblies < 2:
        return create_empty_bom_results()

    similarity_matrix: Dict[str, Dict[str, float]] = {}
    similar_pairs: List[Dict[str, Any]] = []

    for i, assy1 in enumerate(assemblies):
        comp_dict1 = assembly_components.get(assy1, {})
        set1 = set(comp_dict1.keys())
        similarity_matrix[assy1] = {}

        for j, assy2 in enumerate(assemblies):
            comp_dict2 = assembly_components.get(assy2, {})
            set2 = set(comp_dict2.keys())

            # --- Jaccard on unique components ---
            if not set1 and not set2:
                similarity = 100.0
            elif not set1 or not set2:
                similarity = 0.0
            else:
                inter = set1 & set2
                union = set1 | set2
                similarity = (len(inter) / len(union)) * 100.0

            similarity = round(similarity, 2)
            similarity_matrix[assy1][assy2] = similarity

            # Only store each pair once (i < j) and above threshold
            if i < j and similarity > threshold:
                inter = set1 & set2  # recompute so we can reuse

                # --- Build details, still using quantities like before ---
                common_components = []
                common_quantity_total = 0.0
                for comp in inter:
                    q1 = float(comp_dict1.get(comp, 0.0))
                    q2 = float(comp_dict2.get(comp, 0.0))
                    common_qty = min(q1, q2)
                    common_components.append({
                        "component": comp,
                        "qty_a": q1,
                        "qty_b": q2,
                        "common_qty": common_qty
                    })
                    common_quantity_total += common_qty

                unique_to_assy1 = sorted(list(set1 - set2))
                unique_to_assy2 = sorted(list(set2 - set1))

                similar_pairs.append({
                    "bom_a": assy1,
                    "bom_b": assy2,
                    # keep 0–1 similarity_score for frontend like before
                    "similarity_score": round(similarity / 100.0, 4),
                    "common_components": common_components,
                    "unique_components_a": unique_to_assy1,
                    "unique_components_b": unique_to_assy2,
                    "common_count": len(common_components),
                    "common_quantity_total": common_quantity_total,
                    "unique_count_a": len(unique_to_assy1),
                    "unique_count_b": len(unique_to_assy2)
                })

    return {
        "similarity_matrix": similarity_matrix,
        "similar_pairs": similar_pairs
    }



def generate_replacement_suggestions(similar_pairs: List[Dict], limit: int = 5) -> List[Dict]:
    suggestions = []

    for pair in similar_pairs[:limit]:
        assy_a = pair["bom_a"]
        assy_b = pair["bom_b"]
        similarity = pair["similarity_score"]

        unique_a = pair.get("unique_count_a", 0)
        unique_b = pair.get("unique_count_b", 0)
        total_unique = unique_a + unique_b

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


def find_assembly_clusters(assemblies: List[str], similarity_matrix: Dict, threshold: float = 80.0) -> List[List[str]]:
    """Group assemblies into clusters based on similarity (uses threshold 80 by default)"""
    clusters = []
    used_assemblies = set()

    for assembly in assemblies:
        if assembly not in used_assemblies:
            cluster = [assembly]
            used_assemblies.add(assembly)

            for other_assembly in assemblies:
                if (other_assembly not in used_assemblies and
                        similarity_matrix.get(assembly, {}).get(other_assembly, 0) > threshold):
                    cluster.append(other_assembly)
                    used_assemblies.add(other_assembly)

            clusters.append(cluster)

    return clusters


def calculate_reduction_potential(clusters: List[List[str]], total_assemblies: int) -> float:
    if total_assemblies == 0:
        return 0.0

    total_reduction = 0
    for cluster in clusters:
        total_reduction += max(0, len(cluster) - 1)

    reduction_potential = (total_reduction / total_assemblies) * 100
    return round(reduction_potential, 1)


def analyze_bom_data(bom_df: pd.DataFrame, threshold: float = 70.0) -> Dict[str, Any]:
    """Main BOM analysis function (quantity-aware)"""
    print("\n=== Starting BOM Analysis ===")

    bom_df_processed = preprocess_bom_file(bom_df)

    # Filter out assembly rows for component analysis
    component_df = bom_df_processed[bom_df_processed['lev'] > 0].copy()

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

    # Compute similarity
    similarity_results = compute_bom_similarity(assembly_components, threshold)

    # Generate suggestions & clusters
    replacement_suggestions = generate_replacement_suggestions(similarity_results["similar_pairs"])
    clusters = find_assembly_clusters(list(assemblies), similarity_results["similarity_matrix"])

    # Calculate statistics
    total_components = len(component_df)
    unique_components = component_df['component'].nunique()
    reduction_potential = calculate_reduction_potential(clusters, num_assemblies)

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

