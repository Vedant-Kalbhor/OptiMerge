import os
import json
import uuid
from datetime import datetime
from typing import List, Dict, Any, Optional
import pandas as pd
import io

DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")
TEMPLATES_FILE = os.path.join(DATA_DIR, "custom_templates.json")

def _ensure_data_file():
    os.makedirs(DATA_DIR, exist_ok=True)
    if not os.path.exists(TEMPLATES_FILE):
        with open(TEMPLATES_FILE, "w", encoding="utf-8") as f:
            json.dump([], f, indent=2)

def list_templates() -> List[Dict[str, Any]]:
    _ensure_data_file()
    try:
        with open(TEMPLATES_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
            if isinstance(data, list):
                return data
            return []
    except Exception as e:
        print(f"Error loading custom templates: {e}")
        return []

def get_template(template_id: str) -> Optional[Dict[str, Any]]:
    templates = list_templates()
    for t in templates:
        if t.get("id") == template_id:
            return t
    return None

def save_template(template_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Creates or updates a custom analysis template in the JSON store.
    """
    _ensure_data_file()
    templates = list_templates()
    
    template_id = template_data.get("id")
    now_iso = datetime.utcnow().isoformat()
    
    # Clean and validate columns
    raw_columns = template_data.get("columns", [])
    cleaned_columns = []
    for col in raw_columns:
        if not col.get("name") or not str(col.get("name")).strip():
            continue
        cleaned_columns.append({
            "name": str(col.get("name")).strip(),
            "type": col.get("type", "numeric_proximity"), # numeric_proximity | tolerance | exact_text
            "weight": float(col.get("weight", 0.0)),
            "tolerance": float(col.get("tolerance", 0.0)) if col.get("tolerance") is not None and str(col.get("tolerance")).strip() != "" else None,
            "included": bool(col.get("included", True))
        })
    
    # Compute trigger columns (all included columns + identifier column)
    identifier_col = str(template_data.get("identifier_column", "")).strip()
    trigger_cols = [c["name"] for c in cleaned_columns if c.get("included", True)]
    if identifier_col and identifier_col not in trigger_cols:
        trigger_cols.append(identifier_col)
        
    record = {
        "id": template_id or str(uuid.uuid4()),
        "name": str(template_data.get("name", "Untitled Custom Analysis")).strip(),
        "description": str(template_data.get("description", "")).strip(),
        "identifier_column": identifier_col,
        "trigger_columns": trigger_cols,
        "default_threshold": float(template_data.get("default_threshold", 75.0)),
        "columns": cleaned_columns,
        "created_at": template_data.get("created_at", now_iso),
        "updated_at": now_iso
    }
    
    # Check if update or create
    existing_index = next((i for i, t in enumerate(templates) if t.get("id") == record["id"]), None)
    if existing_index is not None:
        templates[existing_index] = record
    else:
        templates.append(record)
        
    with open(TEMPLATES_FILE, "w", encoding="utf-8") as f:
        json.dump(templates, f, indent=2)
        
    return record

def delete_template(template_id: str) -> bool:
    _ensure_data_file()
    templates = list_templates()
    filtered = [t for t in templates if t.get("id") != template_id]
    if len(filtered) == len(templates):
        return False
        
    with open(TEMPLATES_FILE, "w", encoding="utf-8") as f:
        json.dump(filtered, f, indent=2)
    return True

def extract_headers_from_file(file_bytes: bytes, filename: str) -> List[str]:
    """
    Extracts column headers from an Excel or CSV file.
    """
    lower = filename.lower()
    if lower.endswith(".csv"):
        df = pd.read_csv(io.BytesIO(file_bytes), nrows=5)
    else:
        df = pd.read_excel(io.BytesIO(file_bytes), nrows=5)
    
    return [str(col).strip() for col in df.columns if str(col).strip() != ""]
