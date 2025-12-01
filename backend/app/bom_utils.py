import pandas as pd
import numpy as np
import re
from typing import Dict, Any, List, Tuple
import math
import re
from collections import defaultdict

def clean_column_name(column_name: str) -> str:
    if pd.isna(column_name) or column_name is None:
        return "unknown"
    cleaned = re.sub(r'[^a-zA-Z0-9]', '_', str(column_name).lower())
    cleaned = re.sub(r'_+', '_', cleaned)
    return cleaned.strip('_')


def preprocess_bom_file(bom_df: pd.DataFrame) -> pd.DataFrame:
    """
    Normalize BOM DataFrame:
    - normalize column names
    - detect/rename price and currency columns to 'unit_price' and 'currency'
    - detect/rename component and lev-like columns
    - coerce quantities and lev to numeric
    - create 'assembly_id' by using lev==0 rows as assembly headers
    - mark assembly rows with 'is_assembly'
    """
    bom_df = bom_df.copy()
    bom_df.columns = [clean_column_name(c) for c in bom_df.columns]

    # Detect price and currency columns heuristically
    price_col = None
    currency_col = None
    for col in bom_df.columns:
        if any(k in col for k in ['price', 'std_price', 'stdprice', 'unit_price', 'unitprice', 'cost', 'std']):
            price_col = col if price_col is None else price_col
        if any(k in col for k in ['crcy', 'currency', 'curr']):
            currency_col = col if currency_col is None else currency_col

    if price_col:
        bom_df = bom_df.rename(columns={price_col: 'unit_price'})
    if currency_col:
        bom_df = bom_df.rename(columns={currency_col: 'currency'})

    # Detect component / part column
    if 'component' not in bom_df.columns:
        cand = next((c for c in bom_df.columns if 'component' in c or 'part' in c or 'part_no' in c or 'item' in c), None)
        if cand:
            bom_df = bom_df.rename(columns={cand: 'component'})

    # Detect lev / level column
    if 'lev' not in bom_df.columns:
        cand = next((c for c in bom_df.columns if 'lev' in c or 'level' in c), None)
        if cand:
            bom_df = bom_df.rename(columns={cand: 'lev'})

    # Detect quantity column
    if 'quantity' not in bom_df.columns:
        cand = next((c for c in bom_df.columns if 'qty' in c or 'quantity' in c or 'qtty' in c), None)
        if cand:
            bom_df = bom_df.rename(columns={cand: 'quantity'})

    # Ensure columns exist
    if 'lev' not in bom_df.columns:
        bom_df['lev'] = 0
    else:
        bom_df['lev'] = pd.to_numeric(bom_df['lev'], errors='coerce').fillna(0).astype(int)

    if 'component' not in bom_df.columns:
        bom_df['component'] = bom_df.index.astype(str)
    else:
        bom_df['component'] = bom_df['component'].astype(str)

    if 'quantity' not in bom_df.columns:
        bom_df['quantity'] = 1.0
    else:
        bom_df['quantity'] = pd.to_numeric(bom_df['quantity'], errors='coerce').fillna(0.0)

    # Ensure unit_price present and numeric (keep NaNs as 0.0)
    if 'unit_price' not in bom_df.columns:
        bom_df['unit_price'] = 0.0
    else:
        bom_df['unit_price'] = bom_df['unit_price'].replace('', np.nan)
        bom_df['unit_price'] = pd.to_numeric(bom_df['unit_price'], errors='coerce').fillna(0.0)

    if 'currency' not in bom_df.columns:
        bom_df['currency'] = ''
    else:
        bom_df['currency'] = bom_df['currency'].astype(str).fillna('').str.strip()

    # Build assembly_id from lev (lev==0 rows are assemblies)
    assembly_ids = []
    current_assembly = None
    for idx, row in bom_df.iterrows():
        lev = int(row.get('lev', 0))
        component = row.get('component', None)
        if lev == 0:
            current_assembly = str(component).strip() if component is not None else f"ASSY_{idx}"
            assembly_ids.append(current_assembly)
        else:
            if current_assembly is None:
                current_assembly = f"ASSY_{idx}"
            assembly_ids.append(current_assembly)

    bom_df['assembly_id'] = assembly_ids
    bom_df['is_assembly'] = bom_df['lev'] == 0

    return bom_df


def validate_bom_data(df: pd.DataFrame) -> pd.DataFrame:
    """Lightweight validation and normalization"""
    if df is None or not isinstance(df, pd.DataFrame):
        raise ValueError("Input BOM must be a pandas DataFrame")
    processed = preprocess_bom_file(df)
    processed = processed.dropna(subset=['component'])
    return processed


def _to_float_safe(v) -> float:
    try:
        if v is None:
            return 0.0
        if isinstance(v, (int, float)):
            return float(v)
        s = str(v).strip()
        if s == "":
            return 0.0
        return float(s)
    except Exception:
        return 0.0


def compute_bom_similarity(assembly_components: Dict[str, Dict[str, float]], threshold: float = 0.0) -> Dict[str, Any]:
    """
    Quantity-aware pairwise similarity.

    - assembly_components: {assembly_name: {component_name: qty, ...}, ...}
    - Returns:
        {
          "similarity_matrix": {a: {b: pct(0-100), ...}, ...},
          "similar_pairs": [
            {
              "bom_a": a,
              "bom_b": b,
              "similarity_score": pct_as_0_1,
              "common_components": [...names...],
              "unique_components_a": [...names...],
              "unique_components_b": [...names...],
              "common_count": int,
              "unique_count_a": int,
              "unique_count_b": int,
              "common_components_detailed": [
                  {"component": name, "qty_a": x, "qty_b": y, "common_qty": min(x,y)}, ...
              ],
              "unique_components_a_detailed": [{"component": name, "qty": qty}, ...],
              "unique_components_b_detailed": [{"component": name, "qty": qty}, ...],
              "common_qty_total": float
            },
            ...
          ]
        }
    - similarity uses weighted Jaccard over quantities:
        inter = sum(min(qA,qB) for each component)
        union = sum(max(qA,qB) for each component)
      pct = (inter / union) * 100 (union==0 => pct=100)
    """
    def _to_float_safe(x):
        try:
            return float(x)
        except Exception:
            return 0.0

    assemblies = list(assembly_components.keys())
    similarity_matrix: Dict[str, Dict[str, float]] = {}
    similar_pairs: list = []

    for i, a in enumerate(assemblies):
        comp_a_map = assembly_components.get(a, {}) or {}
        # normalize keys -> str and qty -> float
        comp_a = {str(k): _to_float_safe(v) for k, v in comp_a_map.items()}
        keys_a = set(comp_a.keys())
        similarity_matrix.setdefault(a, {})

        for j, b in enumerate(assemblies):
            comp_b_map = assembly_components.get(b, {}) or {}
            comp_b = {str(k): _to_float_safe(v) for k, v in comp_b_map.items()}
            keys_b = set(comp_b.keys())

            union_keys = sorted(keys_a | keys_b)

            inter_sum = 0.0
            union_sum = 0.0
            for k in union_keys:
                qA = comp_a.get(k, 0.0)
                qB = comp_b.get(k, 0.0)
                inter_sum += min(qA, qB)
                union_sum += max(qA, qB)

            if union_sum == 0.0:
                pct = 100.0
            else:
                pct = (inter_sum / union_sum) * 100.0

            similarity_matrix[a][b] = round(pct, 6)

            # build pair entry only once (i < j) and if passes threshold
            if i < j and pct >= threshold:
                # legacy simple name lists (for compatibility)
                common_names = []
                unique_a_names = []
                unique_b_names = []

                common_detailed = []
                unique_a_detailed = []
                unique_b_detailed = []
                common_qty_total = 0.0

                for k in union_keys:
                    qA = comp_a.get(k, 0.0)
                    qB = comp_b.get(k, 0.0)
                    if qA > 0.0 and qB > 0.0:
                        common_names.append(k)
                        common_q = min(qA, qB)
                        common_detailed.append({
                            "component": k,
                            "qty_a": qA,
                            "qty_b": qB,
                            "common_qty": common_q
                        })
                        common_qty_total += common_q
                        # if there is remainder, add to unique detailed
                        remA = qA - common_q
                        remB = qB - common_q
                        if remA > 0:
                            unique_a_detailed.append({"component": k, "qty": remA})
                        if remB > 0:
                            unique_b_detailed.append({"component": k, "qty": remB})
                    else:
                        if qA > 0.0:
                            unique_a_names.append(k)
                            unique_a_detailed.append({"component": k, "qty": qA})
                        if qB > 0.0:
                            unique_b_names.append(k)
                            unique_b_detailed.append({"component": k, "qty": qB})

                # --- build legacy name-only lists (if you want to preserve them) ---
                common_names = [d["component"] for d in common_detailed]
                unique_a_names = [d["component"] for d in unique_a_detailed]
                unique_b_names = [d["component"] for d in unique_b_detailed]

                # --- Make the fields used directly by the frontend contain objects (qty-aware) ---
                pair_entry = {
                    "bom_a": a,
                    "bom_b": b,
                    "similarity_score": round(pct / 100.0, 6),

                    # PRIMARY: quantity-aware arrays (frontend will now show qty)
                    "common_components": common_detailed,                # [{component, qty_a, qty_b, common_qty}, ...]
                    "unique_components_a": unique_a_detailed,           # [{component, qty}, ...]
                    "unique_components_b": unique_b_detailed,           # [{component, qty}, ...]

                    "common_count": len(common_detailed),
                    "unique_count_a": len(unique_a_detailed),
                    "unique_count_b": len(unique_b_detailed),

                    # PRESERVE older name-only lists under new keys (optional)
                    "common_component_names": sorted(common_names),
                    "unique_component_names_a": sorted(unique_a_names),
                    "unique_component_names_b": sorted(unique_b_names),

                    "common_qty_total": round(common_qty_total, 6)
                }

                similar_pairs.append(pair_entry)

    return {"similarity_matrix": similarity_matrix, "similar_pairs": similar_pairs}


def _compute_quantity_aware_lists(comp_map_a: Dict[str, float], comp_map_b: Dict[str, float]):
    keys = sorted(set(list(comp_map_a.keys()) + list(comp_map_b.keys())))
    common_components = []
    unique_components_a = []
    unique_components_b = []
    common_quantity_total = 0.0

    for comp in keys:
        qA = _to_float_safe(comp_map_a.get(comp, 0.0))
        qB = _to_float_safe(comp_map_b.get(comp, 0.0))
        common_qty = min(qA, qB)

        if common_qty > 0:
            common_components.append({"component": comp, "qty_a": qA, "qty_b": qB, "common_qty": common_qty})
            common_quantity_total += common_qty

        remA = max(0.0, qA - common_qty)
        remB = max(0.0, qB - common_qty)

        if remA > 0:
            unique_components_a.append({"component": comp, "qty": remA})
        if remB > 0:
            unique_components_b.append({"component": comp, "qty": remB})
    return common_components, unique_components_a, unique_components_b, common_quantity_total


def compute_bom_similarity(assembly_components: Dict[str, Dict[str, Any]], threshold: float = 0.0) -> Dict[str, Any]:
    """
    Compute pairwise BOM similarity using STANDARD JACCARD on component NAMES (presence-only),
    and additionally prepare quantity-aware lists for UI display.

    Input:
      assembly_components: { assembly_id: { component_name: quantity, ... }, ... }
        - quantity may be numeric or string numeric; missing entries treated as 0
      threshold: minimum Jaccard percent (0..100) to include a pair in `similar_pairs`

    Output:
      {
        "similarity_matrix": { assy1: { assy2: jaccard_percent, ... }, ... },
        "similar_pairs": [
           {
             "bom_a": assy1,
             "bom_b": assy2,
             "similarity_score": jaccard_fraction,   # 0..1 (frontend expects fraction)
             "common_components": [{component, qty_a, qty_b, common_qty}, ...],
             "unique_components_a": [{component, qty}, ...],
             "unique_components_b": [{component, qty}, ...],
             "common_count": int,
             "common_quantity_total": float,
             "unique_count_a": int,
             "unique_count_b": int
           }, ...
        ]
      }
    """
    assemblies = list(assembly_components.keys())
    similarity_matrix: Dict[str, Dict[str, float]] = {}
    similar_pairs: List[Dict[str, Any]] = []

    # Defensive: if no assemblies, return empty structure
    if not assemblies:
        return {"similarity_matrix": {}, "similar_pairs": []}

    for i, assy_a in enumerate(assemblies):
        comp_map_a_raw = assembly_components.get(assy_a) or {}
        # Ensure comp_map is mapping component->float_qty
        comp_map_a = {
            str(k): _to_float_safe(v)
            for k, v in (comp_map_a_raw.items() if isinstance(comp_map_a_raw, dict) else [])
        }
        set_a = set(comp_map_a.keys())
        similarity_matrix.setdefault(assy_a, {})

        for j, assy_b in enumerate(assemblies):
            comp_map_b_raw = assembly_components.get(assy_b) or {}
            comp_map_b = {
                str(k): _to_float_safe(v)
                for k, v in (comp_map_b_raw.items() if isinstance(comp_map_b_raw, dict) else [])
            }
            set_b = set(comp_map_b.keys())

            # Standard Jaccard on presence-only sets (expressed as percent 0..100)
            if not set_a and not set_b:
                jaccard_pct = 100.0
            elif not set_a or not set_b:
                jaccard_pct = 0.0
            else:
                inter = set_a & set_b
                union = set_a | set_b
                jaccard_pct = (len(inter) / len(union)) * 100.0

            # store matrix value (rounded to reasonable precision)
            similarity_matrix[assy_a][assy_b] = round(jaccard_pct, 6)

            # store pair once (i < j) and only if meets threshold
            if i < j and jaccard_pct >= threshold:
                # compute quantity-aware lists for display only
                common_components, unique_components_a, unique_components_b, common_quantity_total = \
                    _compute_quantity_aware_lists(comp_map_a, comp_map_b)

                similar_pairs.append({
                    "bom_a": assy_a,
                    "bom_b": assy_b,
                    # frontend expects 0..1 fraction for progress bar
                    "similarity_score": round(jaccard_pct / 100.0, 6),
                    "common_components": common_components,
                    "unique_components_a": unique_components_a,
                    "unique_components_b": unique_components_b,
                    "common_count": len(common_components),
                    "common_quantity_total": common_quantity_total,
                    "unique_count_a": len(unique_components_a),
                    "unique_count_b": len(unique_components_b)
                })

    return {
        "similarity_matrix": similarity_matrix,
        "similar_pairs": similar_pairs
    }


def _compute_replacement_rows_for_pair(
    bom_a: str,
    bom_b: str,
    comp_map_a: Dict[str, float],
    comp_map_b: Dict[str, float],
    unit_price_map: Dict[str, float],
    original_jaccard_pct: float
) -> List[Dict[str, Any]]:
    """
    Generate component-level replacement rows (keeps previous behavior).
    Estimated cost deltas use available unit_price_map for components.
    """
    set_a = set(comp_map_a.keys())
    set_b = set(comp_map_b.keys())

    if len(set_a) == 0 and len(set_b) == 0:
        base_jaccard_pct = 100.0
    else:
        orig_inter = set_a & set_b
        orig_union = set_a | set_b
        base_jaccard_pct = (len(orig_inter) / len(orig_union) * 100.0) if len(orig_union) > 0 else 100.0

    if original_jaccard_pct is not None:
        base_jaccard_pct = original_jaccard_pct

    unique_a = sorted(list(set_a - set_b))
    unique_b = sorted(list(set_b - set_a))
    rows = []

    for out_comp in unique_a:
        for in_comp in unique_b:
            new_set_a = (set_a - {out_comp}) | {in_comp}
            inter = new_set_a & set_b
            union = new_set_a | set_b
            new_pct = (len(inter) / len(union) * 100.0) if len(union) > 0 else 100.0
            delta = new_pct - base_jaccard_pct

            qty_out = _to_float_safe(comp_map_a.get(out_comp, 0.0))
            qty_in = _to_float_safe(comp_map_b.get(in_comp, 0.0))
            price_out = _to_float_safe(unit_price_map.get(out_comp, 0.0))
            price_in = _to_float_safe(unit_price_map.get(in_comp, 0.0))
            cost_before = qty_out * price_out
            cost_after = qty_in * price_in
            estimated_cost_delta = cost_before * -1 + cost_after

            rows.append({
                "bom_a": bom_a,
                "bom_b": bom_b,
                "Replace_In_BOM": "Replace_In_A",
                "Replace_Out": out_comp,
                "Replace_In_With": in_comp,
                "New_MatchPct": round(new_pct, 2),
                "DeltaPct": round(delta, 2),
                "Direction": "A<-B",
                "estimated_cost_delta": round(estimated_cost_delta, 6)
            })

    for out_comp in unique_b:
        for in_comp in unique_a:
            new_set_b = (set_b - {out_comp}) | {in_comp}
            inter = set_a & new_set_b
            union = set_a | new_set_b
            new_pct = (len(inter) / len(union) * 100.0) if len(union) > 0 else 100.0
            delta = new_pct - base_jaccard_pct

            qty_out = _to_float_safe(comp_map_b.get(out_comp, 0.0))
            qty_in = _to_float_safe(comp_map_a.get(in_comp, 0.0))
            price_out = _to_float_safe(unit_price_map.get(out_comp, 0.0))
            price_in = _to_float_safe(unit_price_map.get(in_comp, 0.0))
            cost_before = qty_out * price_out
            cost_after = qty_in * price_in
            estimated_cost_delta = cost_before * -1 + cost_after

            rows.append({
                "bom_a": bom_a,
                "bom_b": bom_b,
                "Replace_In_BOM": "Replace_In_B",
                "Replace_Out": out_comp,
                "Replace_In_With": in_comp,
                "New_MatchPct": round(new_pct, 2),
                "DeltaPct": round(delta, 2),
                "Direction": "B<-A",
                "estimated_cost_delta": round(estimated_cost_delta, 6)
            })

    # Sort to present likely-highest-match improvements and cost-saving candidates first
    rows.sort(key=lambda r: ((r.get("DeltaPct") is not None and -r["DeltaPct"]), r.get("estimated_cost_delta", 0.0)))
    return rows


def generate_component_replacement_table(
    assembly_components: Dict[str, Dict[str, float]],
    similar_pairs: List[Dict[str, Any]],
    unit_price_map: Dict[str, float],
    max_pairs: int = None
) -> List[Dict[str, Any]]:
    rows = []
    pairs_iter = similar_pairs if max_pairs is None else similar_pairs[:max_pairs]
    for pair in pairs_iter:
        bom_a = pair["bom_a"]
        bom_b = pair["bom_b"]
        similarity_score = pair.get("similarity_score", 0.0)
        original_jaccard_pct = similarity_score * 100.0

        comp_map_a = assembly_components.get(bom_a, {}) or {}
        comp_map_b = assembly_components.get(bom_b, {}) or {}
        rows.extend(_compute_replacement_rows_for_pair(bom_a, bom_b, comp_map_a, comp_map_b, unit_price_map, pair.get("similarity_score", 0.0)*100.0))
    return rows


def generate_replacement_suggestions(similar_pairs: List[Dict], assembly_costs: Dict[str, float], currency_map: Dict[str,str]=None, limit: int = 10) -> List[Dict]:
    suggestions = []

    for pair in similar_pairs[:limit]:
        assy_a = pair["bom_a"]
        assy_b = pair["bom_b"]
        sim_score = pair.get("similarity_score", 0.0)

        cost_a = _to_float_safe(assembly_costs.get(assy_a, 0.0))
        cost_b = _to_float_safe(assembly_costs.get(assy_b, 0.0))

        if cost_a > cost_b:
            replace_from = assy_a
            replace_with = assy_b
            savings = cost_a - cost_b
        else:
            replace_from = assy_b
            replace_with = assy_a
            savings = cost_b - cost_a

        currency = ''
        if currency_map:
            currency = currency_map.get(assy_a) or currency_map.get(assy_b) or ''

        suggestions.append({
            "type": "bom_cost_consolidation",
            "bom_replace_from": replace_from,
            "bom_replace_with": replace_with,
            "similarity_score": sim_score,
            "suggestion": f"Replace variant {replace_from} with {replace_with} to save approx {currency}{savings:.2f}",
            "confidence": sim_score,
            "estimated_savings": round(savings, 6),
            "currency": currency,
            "details": {
                "cost_a": round(cost_a, 6),
                "cost_b": round(cost_b, 6)
            }
        })
    return suggestions


def find_assembly_clusters(assemblies: List[str], similarity_matrix: Dict, threshold: float = 80.0) -> List[List[str]]:
    clusters = []
    used = set()
    for a in assemblies:
        if a in used:
            continue
        cluster = [a]
        used.add(a)
        for b in assemblies:
            if b not in used and similarity_matrix.get(a, {}).get(b, 0) > threshold:
                cluster.append(b)
                used.add(b)
        clusters.append(cluster)
    return clusters


def calculate_reduction_potential(clusters: List[List[str]], total_assemblies: int) -> float:
    if total_assemblies == 0:
        return 0.0
    total_reduction = sum(max(0, len(c) - 1) for c in clusters)
    return round((total_reduction / total_assemblies) * 100, 1)


def analyze_bom_data(bom_df: pd.DataFrame, threshold: float = 70.0) -> Dict[str, Any]:
    """
    Main analysis entrypoint.
    Key change: assembly (variant) cost is derived from the assembly header row's unit_price (lev==0).
    If assembly header has unit_price > 0, that value is used as the variant cost. Otherwise, fallback
    to summing component qty * unit_price for the assembly's components.
    """
    processed = preprocess_bom_file(bom_df)

    # Components (lev > 0) and assemblies (lev == 0)
    component_df = processed[processed['lev'] > 0].copy()
    assembly_headers = processed[processed['lev'] == 0].copy()

    assemblies = processed['assembly_id'].unique().tolist()
    if len(assemblies) < 2:
        return {
            "similarity_matrix": {},
            "similar_pairs": [],
            "replacement_suggestions": [],
            "component_replacement_table": [],
            "bom_statistics": {},
            "clusters": [],
            "assembly_costs": {},
            "unit_price_map": {},
            "currency_map": {}
        }

    # Build per-assembly component->qty map and unit_price_map for components
    assembly_components = {}
    unit_price_map = {}
    currency_map = {}
    assembly_costs = {}

    # First: global unit price map for components (take first non-zero value)
    for _, r in processed.iterrows():
        comp = str(r['component']).strip()
        price = _to_float_safe(r.get('unit_price', 0.0))
        if comp and price > 0 and unit_price_map.get(comp, 0.0) == 0.0:
            unit_price_map[comp] = price

    # Now per-assembly maps
    for assembly in assemblies:
        # component rows for this assembly (lev > 0)
        rows = component_df[component_df['assembly_id'] == assembly]
        comp_qty = {}
        # default total by summing components (fallback)
        total_by_components = 0.0
        for _, r in rows.iterrows():
            name = str(r['component']).strip()
            qty = _to_float_safe(r.get('quantity', 0.0))
            comp_qty[name] = comp_qty.get(name, 0.0) + qty
            # attempt to get a price for the component (component row unit_price)
            price = _to_float_safe(r.get('unit_price', 0.0)) or unit_price_map.get(name, 0.0)
            total_by_components += qty * price
        assembly_components[assembly] = comp_qty

        # Check for assembly header row price (lev==0) — prefer that as the variant cost
        header_row = assembly_headers[assembly_headers['assembly_id'] == assembly]
        assembly_price = 0.0
        assembly_currency = ''
        if not header_row.empty:
            # If multiple header rows exist, take the first non-zero unit_price found
            for _, hr in header_row.iterrows():
                ap = _to_float_safe(hr.get('unit_price', 0.0))
                if ap > 0:
                    assembly_price = ap
                    break
            # capture currency if present
            curvals = header_row['currency'].dropna().astype(str).str.strip().unique().tolist()
            assembly_currency = curvals[0] if curvals else ''
        # If assembly-level price present and >0, use it as the variant cost; else fallback to sum of components
        final_assembly_cost = assembly_price if assembly_price > 0 else total_by_components
        assembly_costs[assembly] = round(final_assembly_cost, 6)
        if assembly_currency:
            currency_map[assembly] = assembly_currency

    # compute similarities
    similarity_results = compute_bom_similarity(assembly_components, threshold)

    # component-level replacement rows (unchanged)
    component_replacement_table = generate_component_replacement_table(
        assembly_components=assembly_components,
        similar_pairs=similarity_results["similar_pairs"],
        unit_price_map=unit_price_map
    )

    # cost-aware replacement suggestions
    replacement_suggestions = generate_replacement_suggestions(
        similarity_results["similar_pairs"],
        assembly_costs,
        currency_map=currency_map,
        limit=20
    )

    clusters = find_assembly_clusters(assemblies, similarity_results["similarity_matrix"])
    total_components = len(component_df)
    unique_components = component_df['component'].nunique()
    # reduction_potential = calculate_reduction_potential(clusters, num_assemblies)

    bom_statistics = {
        "total_components": total_components,
        "unique_components": unique_components,
        "total_assemblies": len(assemblies),
        "total_clusters": len(clusters),
        "similar_pairs_count": len(similarity_results["similar_pairs"]),
        "reduction_potential": calculate_reduction_potential(clusters, len(assemblies))
    }

    return {
        "similarity_matrix": similarity_results["similarity_matrix"],
        "similar_pairs": similarity_results["similar_pairs"],
        "replacement_suggestions": replacement_suggestions,
        "component_replacement_table": component_replacement_table,
        "bom_statistics": bom_statistics,
        "clusters": clusters,
        "assembly_costs": assembly_costs,
        "unit_price_map": unit_price_map,
        "currency_map": currency_map
    }

    # print(f"Analysis complete: {num_assemblies} assemblies, {len(similarity_results['similar_pairs'])} similar pairs")
    # print(f"Generated {len(component_replacement_table)} component-level replacement rows")
    # return final_results

