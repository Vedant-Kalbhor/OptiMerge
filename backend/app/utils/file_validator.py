from pathlib import Path
from fastapi import UploadFile
from app.config import (
    MAX_IMAGE_SIZE_MB,
    MAX_PDF_SIZE_MB,
    ALLOWED_IMAGE_EXTENSIONS,
    ALLOWED_PDF_EXTENSIONS,
    ALLOWED_EXCEL_EXTENSIONS,
)
from app.exceptions import ValidationError

def _extension(filename: str) -> str:
    return Path(filename or "").suffix.lower()

def validate_image_file(file: UploadFile, data: bytes) -> None:
    ext = _extension(file.filename)
    if ext not in ALLOWED_IMAGE_EXTENSIONS:
        raise ValidationError(
            f"Unsupported image type '{ext}'. Allowed: {sorted(ALLOWED_IMAGE_EXTENSIONS)}"
        )
    if not data:
        raise ValidationError("Image file is empty.")
    if len(data) > MAX_IMAGE_SIZE_MB * 1024 * 1024:
        raise ValidationError(f"Image exceeds {MAX_IMAGE_SIZE_MB} MB limit.")

def validate_pdf_file(file: UploadFile, data: bytes) -> None:
    ext = _extension(file.filename)
    if ext not in ALLOWED_PDF_EXTENSIONS:
        raise ValidationError("Only PDF files are accepted by the PDF endpoint.")
    if not data:
        raise ValidationError("PDF file is empty.")
    if len(data) > MAX_PDF_SIZE_MB * 1024 * 1024:
        raise ValidationError(f"PDF exceeds {MAX_PDF_SIZE_MB} MB limit.")

def validate_excel_file(file: UploadFile, data: bytes) -> None:
    ext = _extension(file.filename)
    if ext not in ALLOWED_EXCEL_EXTENSIONS:
        raise ValidationError("Existing Excel file must have .xlsx extension.")
    if not data:
        raise ValidationError("Existing Excel file is empty.")
