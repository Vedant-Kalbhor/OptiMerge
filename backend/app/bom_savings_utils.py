import pandas as pd
import numpy as np
from typing import Dict, List, Tuple, Optional
import json

def parse_bom_file(file_path: str, file_type: str = 'excel') -> pd.DataFrame:
    """
    Parse BOM file with expected columns.
    
    Args:
        file_path: Path to the file
        file_type: 'excel' or 'csv'
    
    Returns:
        Cleaned DataFrame
    """
    try:
        if file_type == 'csv':
            df = pd.read_csv(file_path)
        else:
            df = pd.read_excel(file_path)
        
        # Clean column names
        df.columns = df.columns.str.strip().str.lower()
        
        # Map common column names
        column_mapping = {
            'component': 'component',
            'part no': 'component',
            'part number': 'component',
            'part_no': 'component',
            'part_number': 'component',
            'lev': 'lev',
            'level': 'lev',
            'lvl': 'lev',
            'quantity': 'quantity',
            'qty': 'quantity',
            'std price': 'std_price',
            'std_price': 'std_price',
            'price': 'std_price',
            'cost': 'std_price',
            'unit_price': 'std_price',
            'crcy': 'currency',
            'currency': 'currency',
            'curr': 'currency'
        }
        
        # Rename columns
        for old_col in df.columns:
            if old_col in column_mapping:
                df.rename(columns={old_col: column_mapping[old_col]}, inplace=True)
        
        # Ensure required columns exist
        required_cols = ['component', 'lev', 'quantity', 'std_price']
        
        for col in required_cols:
            if col not in df.columns:
                raise ValueError(f"Required column '{col}' not found in file")
        
        # Convert data types
        df['lev'] = pd.to_numeric(df['lev'], errors='coerce').fillna(0).astype(int)
        df['quantity'] = pd.to_numeric(df['quantity'], errors='coerce').fillna(1)
        
        # Clean price column
        if df['std_price'].dtype == 'object':
            df['std_price'] = (
                df['std_price']
                .astype(str)
                .str.replace(',', '')
                .str.replace('£', '')
                .str.replace('$', '')
                .str.replace('€', '')
                .str.strip()
            )
        df['std_price'] = pd.to_numeric(df['std_price'], errors='coerce').fillna(0)
        
        # Add currency if not present
        if 'currency' not in df.columns:
            df['currency'] = 'GBP'  # Default currency
        
        return df
    
    except Exception as e:
        raise Exception(f"Failed to parse BOM file: {str(e)}")

def calculate_bom_savings(
    bom_df: pd.DataFrame,
    replacements: Dict[str, Dict]
) -> Tuple[List[Dict], Dict]:
    """
    Calculate savings by applying replacements to BOM.
    
    Args:
        bom_df: Cleaned BOM DataFrame
        replacements: Dictionary of component replacements with price differences
    
    Returns:
        Tuple of (results_list, summary_dict)
    """
    # Group by assembly
    assemblies = []
    current_assembly = None
    assembly_components = []
    
    for _, row in bom_df.iterrows():
        if row['lev'] == 0:
            # Save previous assembly if exists
            if current_assembly is not None:
                assemblies.append({
                    'assembly': current_assembly,
                    'components': assembly_components.copy()
                })
            
            # Start new assembly
            current_assembly = row['component']
            assembly_components = [{
                'component': row['component'],
                'quantity': row['quantity'],
                'price': row['std_price'],
                'currency': row['currency'],
                'level': 0
            }]
        else:
            # Add component to current assembly
            assembly_components.append({
                'component': row['component'],
                'quantity': row['quantity'],
                'price': row['std_price'],
                'currency': row['currency'],
                'level': 1
            })
    
    # Add the last assembly
    if current_assembly is not None:
        assemblies.append({
            'assembly': current_assembly,
            'components': assembly_components
        })
    
    # Calculate savings for each assembly
    results = []
    total_stats = {
        'assemblies_processed': 0,
        'assemblies_with_savings': 0,
        'total_cost_before': 0,
        'total_savings': 0,
        'components_replaced': 0
    }
    
    for assembly in assemblies:
        assembly_data = assembly['components'][0]  # First item is the assembly itself
        components = assembly['components'][1:]    # Rest are components
        
        assembly_code = assembly['assembly']
        assembly_price_before = assembly_data['price']
        currency = assembly_data['currency']
        
        # Calculate component savings
        component_savings = 0
        replaced_components = []
        
        for comp in components:
            comp_code = comp['component']
            comp_qty = comp['quantity']
            comp_price = comp['price']
            
            if comp_code in replacements:
                replacement = replacements[comp_code]
                savings = replacement['price_diff'] * comp_qty
                component_savings += savings
                
                replaced_components.append({
                    'old_component': comp_code,
                    'new_component': replacement['new_component'],
                    'quantity': comp_qty,
                    'savings': savings,
                    'old_price': comp_price,
                    'new_price': replacement['new_price']
                })
                
                total_stats['components_replaced'] += 1
        
        assembly_price_after = assembly_price_before - component_savings
        savings_percent = (component_savings / assembly_price_before * 100) if assembly_price_before > 0 else 0
        
        total_stats['assemblies_processed'] += 1
        total_stats['total_cost_before'] += assembly_price_before
        total_stats['total_savings'] += component_savings
        
        if component_savings > 0:
            total_stats['assemblies_with_savings'] += 1
        
        results.append({
            'assembly_code': assembly_code,
            'component': assembly_data.get('component'),
            'quantity': assembly_data['quantity'],
            'original_price': float(assembly_price_before),
            'currency': currency,
            'replaced_components': [
                f"{rc['old_component']} → {rc['new_component']}: £{rc['savings']:.2f}"
                for rc in replaced_components
            ],
            'replaced_components_detail': replaced_components,
            'total_before': float(assembly_price_before),
            'total_after': float(assembly_price_after),
            'savings': float(component_savings),
            'savings_percent': float(savings_percent)
        })
    
    total_stats['total_cost_after'] = total_stats['total_cost_before'] - total_stats['total_savings']
    total_stats['avg_savings_percent'] = (
        (total_stats['total_savings'] / total_stats['total_cost_before'] * 100)
        if total_stats['total_cost_before'] > 0 else 0
    )
    
    return results, total_stats