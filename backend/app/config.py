import os

MAX_IMAGE_SIZE_MB = int(os.getenv("MAX_IMAGE_SIZE_MB", "15"))
MAX_PDF_SIZE_MB = int(os.getenv("MAX_PDF_SIZE_MB", "30"))
MAX_PDF_PAGES = int(os.getenv("MAX_PDF_PAGES", "50"))

# TESSERACT_CMD = os.getenv("TESSERACT_CMD", "").strip()

TESSERACT_CMD = r"C:\Program Files\Tesseract-OCR\tesseract.exe"

ALLOWED_IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}
ALLOWED_PDF_EXTENSIONS = {".pdf"}
ALLOWED_EXCEL_EXTENSIONS = {".xlsx"}