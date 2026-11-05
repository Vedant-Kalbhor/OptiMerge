import fitz
from app.exceptions import OCRProcessingError
from app.services.ocr_service import OCRService
from app.schemas.ocr_schema import OCRTableResult

class PDFService:
    def __init__(self, ocr_service: OCRService):
        self.ocr_service = ocr_service

    def process_pdf(self, data: bytes, filename: str, max_pages: int):
        try:
            document = fitz.open(stream=data, filetype="pdf")
        except Exception as exc:
            raise OCRProcessingError("Invalid or unreadable PDF.") from exc

        if document.page_count == 0:
            raise OCRProcessingError("PDF contains no pages.")

        if document.page_count > max_pages:
            raise OCRProcessingError(
                f"PDF has {document.page_count} pages; maximum is {max_pages}."
            )

        results = []

        for page_number in range(document.page_count):
            page = document.load_page(page_number)

            # 2x rendering gives OCR considerably more pixels than the original PDF.
            pixmap = page.get_pixmap(
                matrix=fitz.Matrix(2.0, 2.0),
                alpha=False
            )

            image_bytes = pixmap.tobytes("png")
            source_name = f"{filename} - page {page_number + 1}"

            result = self.ocr_service.process_image_bytes(
                image_bytes,
                source_name
            )
            results.append(result)

        document.close()
        return results
