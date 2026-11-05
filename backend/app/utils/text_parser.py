import re
from typing import Optional
from app.exceptions import OCRProcessingError

def clean_text(text: str) -> str:
    text = (text or "").strip()

    replacements = {
        "X-ax1s": "X-axis",
        "X-axl1s": "X-axis",
        "Y-ax1s": "Y-axis",
        "Y-axl1s": "Y-axis",
        "Z-ax1s": "Z-axis",
        "Z-axl1s": "Z-axis",
        "Omm": "0mm",
        "omm": "0mm",
        "oomm": "0mm",
        "Cl": "C",
        "—": "-",
        "–": "-",
        "−": "-",
    }

    for old, new in replacements.items():
        text = text.replace(old, new)

    return text

def parse_number(text: str, field_name: str = "value") -> float:
    s = clean_text(text)
    s = s.replace("MM", "mm").replace("mM", "mm").replace("Mm", "mm")
    # Common OCR confusions in decimal values:
    # 71,.5 -> 71.5, 79./7 -> 79.7
    s = re.sub(r"(?<=\d)\s*[,\.]\s*[.]\s*(?=\d)", ".", s)
    s = re.sub(r"(?<=\d)\s*[,\.]\s*[/|]\s*(?=\d)", ".", s)
    s = re.sub(r"(?<=\d)\s*[/|]\s*(?=\d)", ".", s)
    s = re.sub(r"(?<=\d)\s*[,\.]\s*(?=\d)", ".", s)
    s = re.sub(r"(?<!\d)-\s+", "-", s)

    match = re.search(r"[-+]?\d+(?:\.\d+)?", s)
    if not match:
        raise OCRProcessingError(f"Could not parse {field_name}: '{text}'")

    try:
        return float(match.group(0))
    except ValueError as exc:
        raise OCRProcessingError(
            f"Could not convert {field_name}: '{text}'"
        ) from exc

def parse_development_length(text: str) -> Optional[float]:
    text = clean_text(text)
    text = re.sub(r"\s+", " ", text)

    patterns = [
        r"=\s*([0-9]+(?:\s*[.,]\s*[0-9]+)?)\s*mm\b",
        r"DEVELOPMENT.*?=\s*([0-9]+(?:\s*[.,]\s*[0-9]+)?)\s*mm\b",
        r"DEVELOPMENT.*?([0-9]+(?:\s*[.,]\s*[0-9]+)?)\s*mm\b",
    ]

    for pattern in patterns:
        match = re.search(pattern, text, flags=re.IGNORECASE)
        if match:
            value = match.group(1).replace(" ", "").replace(",", ".")
            return float(value)

    return None
