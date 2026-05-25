from __future__ import annotations

import re
from pathlib import Path
from typing import Dict, Iterable, List, Optional

import pandas as pd


def _clean_text(value) -> str:
    if value is None:
        return ""
    text = str(value).strip()
    if not text:
        return ""
    text = text.replace("\r", " ").replace("\n", " ")
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def _normalize_column_name(value) -> str:
    text = _clean_text(value).lower()
    text = text.replace("/", " ")
    text = text.replace(".", " ")
    text = text.replace(",", " ")
    text = re.sub(r"[^a-z0-9]+", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def _pick_column(columns: Iterable[str], *needles: str) -> Optional[str]:
    normalized_map = {_normalize_column_name(col): col for col in columns}
    for needle in needles:
        needle_norm = _normalize_column_name(needle)
        for norm_col, original in normalized_map.items():
            if needle_norm == norm_col or needle_norm in norm_col:
                return original
    return None


def _parse_metric_value(value) -> Optional[float]:
    text = _clean_text(value).lower()
    if not text:
        return None
    match = re.search(r"(\d+(?:[.,]\d+)?)", text)
    if not match:
        return None
    try:
        return float(match.group(1).replace(",", "."))
    except ValueError:
        return None


def _format_metric_value(value) -> str:
    parsed = _parse_metric_value(value)
    if parsed is None:
        return _clean_text(value)
    if float(parsed).is_integer():
        return str(int(parsed))
    return f"{parsed:g}"


def _family_from_sheet(sheet_name: str) -> str:
    sheet = _normalize_column_name(sheet_name)
    if any(term in sheet for term in ["hex sock", "socket screw", "hex socket"]):
        return "hex_socket_screw"
    if any(term in sheet for term in ["flat head", "countersunk"]):
        return "flat_head_cap_screw"
    if any(term in sheet for term in ["hex head", "hex screw"]):
        return "hex_head_screw"
    return "other"


def load_standard_library(path: str | Path) -> pd.DataFrame:
    """Load all sheets from the standard library workbook into one normalized table."""
    workbook_path = Path(path)
    xl = pd.ExcelFile(workbook_path)
    records: List[dict] = []

    for sheet_name in xl.sheet_names:
        raw = pd.read_excel(workbook_path, sheet_name=sheet_name)
        if raw.empty:
            continue

        columns = list(raw.columns)
        part_col = _pick_column(columns, "part numbers", "part number", "number")
        name_col = _pick_column(columns, "name")
        thread_col = _pick_column(columns, "thread metric m", "thread metric")
        length_col = _pick_column(columns, "l num", "length", "l (num)")
        std_ref_col = _pick_column(columns, "standard reference", "reference")
        material_col = _pick_column(columns, "material")
        surface_col = _pick_column(columns, "surface treatment", "coating", "finish")

        family = _family_from_sheet(sheet_name)

        for idx, row in raw.iterrows():
            part_no = _clean_text(row.get(part_col)) if part_col else ""
            if not part_no:
                continue

            name = _clean_text(row.get(name_col)) if name_col else ""
            normalized_name = re.sub(r"\s+", " ", name.lower()).strip() if name else sheet_name.lower()
            thread_m = _format_metric_value(row.get(thread_col)) if thread_col else ""
            length_mm = _format_metric_value(row.get(length_col)) if length_col else ""
            std_ref = _clean_text(row.get(std_ref_col)) if std_ref_col else ""
            material = _clean_text(row.get(material_col)) if material_col else ""
            surface = _clean_text(row.get(surface_col)) if surface_col else ""

            records.append(
                {
                    "sheet_name": sheet_name,
                    "part_no": part_no,
                    "family": family,
                    "normalized_name": normalized_name,
                    "thread_m": thread_m,
                    "length_mm": length_mm,
                    "standard_reference": std_ref,
                    "material": material,
                    "surface_treatment": surface,
                    "raw_payload": row.to_dict(),
                }
            )

    if not records:
        return pd.DataFrame(
            columns=[
                "sheet_name",
                "part_no",
                "family",
                "normalized_name",
                "thread_m",
                "length_mm",
                "standard_reference",
                "material",
                "surface_treatment",
                "raw_payload",
            ]
        )

    df = pd.DataFrame(records)
    df = df.drop_duplicates(subset=["part_no", "sheet_name"], keep="first").reset_index(drop=True)
    return df


def load_legacy_bom(path: str | Path) -> pd.DataFrame:
    """Load the legacy BOM workbook into a flattened, row-oriented table."""
    workbook_path = Path(path)
    xl = pd.ExcelFile(workbook_path)
    records: List[dict] = []

    for sheet_name in xl.sheet_names:
        try:
            raw = pd.read_excel(workbook_path, sheet_name=sheet_name, header=6)
        except Exception:
            raw = pd.read_excel(workbook_path, sheet_name=sheet_name)

        if raw.empty:
            continue

        raw.columns = [_clean_text(c) for c in raw.columns]
        columns = list(raw.columns)
        pos_col = _pick_column(columns, "pos", "position")
        qty_col = _pick_column(columns, "quantity", "stückzahl")
        designation_col = _pick_column(columns, "benennung designation", "designation")
        type_col = _pick_column(columns, "typ normbezeichnung", "type norm designation", "type")
        drawing_col = _pick_column(columns, "drawing no", "zeichn nr")
        order_col = _pick_column(columns, "order no", "bestell nr")
        manufacturer_col = _pick_column(columns, "manufacturer", "hersteller")
        sap_col = _pick_column(columns, "sap part no", "sap artikel")
        spare_col = _pick_column(columns, "spare wear part", "ersatz verschleißteil")
        supply_col = _pick_column(columns, "supply manuf part", "kauf herstellteil")
        remarks_col = _pick_column(columns, "remarks", "bemerkung")

        for idx, row in raw.iterrows():
            pos_value = row.get(pos_col) if pos_col else None
            if pd.isna(pos_value):
                continue
            if isinstance(pos_value, (int, float)) and not pd.isna(pos_value):
                if float(pos_value).is_integer():
                    pos = str(int(pos_value))
                else:
                    pos = _clean_text(pos_value)
            else:
                pos = _clean_text(pos_value)
                if pos.endswith(".0"):
                    pos = pos[:-2]
            if not pos:
                continue

            quantity = _clean_text(row.get(qty_col)) if qty_col else ""
            designation = _clean_text(row.get(designation_col)) if designation_col else ""
            type_norm = _clean_text(row.get(type_col)) if type_col else ""
            drawing_no = _clean_text(row.get(drawing_col)) if drawing_col else ""
            order_no = _clean_text(row.get(order_col)) if order_col else ""
            manufacturer = _clean_text(row.get(manufacturer_col)) if manufacturer_col else ""
            sap_part_no = _clean_text(row.get(sap_col)) if sap_col else ""
            spare_wear = _clean_text(row.get(spare_col)) if spare_col else ""
            supply_part = _clean_text(row.get(supply_col)) if supply_col else ""
            remarks = _clean_text(row.get(remarks_col)) if remarks_col else ""

            source_text = " | ".join(
                part for part in [designation, type_norm, drawing_no, manufacturer, order_no, sap_part_no]
                if part
            )

            records.append(
                {
                    "source_sheet": sheet_name,
                    "row_index": idx + 1,
                    "position": pos,
                    "quantity": quantity,
                    "designation": designation,
                    "type_norm_designation": type_norm,
                    "drawing_no": drawing_no,
                    "order_no": order_no,
                    "manufacturer": manufacturer,
                    "sap_part_no": sap_part_no,
                    "spare_wear_part": spare_wear,
                    "supply_manuf_part": supply_part,
                    "remarks": remarks,
                    "source_text": source_text,
                }
            )

    if not records:
        return pd.DataFrame(
            columns=[
                "source_sheet",
                "row_index",
                "position",
                "quantity",
                "designation",
                "type_norm_designation",
                "drawing_no",
                "order_no",
                "manufacturer",
                "sap_part_no",
                "spare_wear_part",
                "supply_manuf_part",
                "remarks",
                "source_text",
            ]
        )

    return pd.DataFrame(records)
