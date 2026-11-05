import logging
import re
from typing import List, Optional, Tuple

import cv2
import numpy as np
import pytesseract

from app.config import TESSERACT_CMD
from app.exceptions import OCRProcessingError
from app.schemas.ocr_schema import OCRTableResult
from app.utils.text_parser import clean_text, parse_development_length

logger = logging.getLogger(__name__)

if TESSERACT_CMD:
    pytesseract.pytesseract.tesseract_cmd = TESSERACT_CMD

# Safety limits
MIN_IMAGE_SIDE = 50          # smaller than this cannot hold a table
MAX_IMAGE_SIDE = 4000        # larger images are downscaled (speed / memory)
OCR_TIMEOUT_SEC = 30         # per tesseract call


class OCRService:
    """
    Contract: process_image_bytes() NEVER raises for "no image" or
    "no coordinates". It returns an OCRTableResult whose `points` is an
    empty list and `development_length` is None. The Excel writer should
    turn those into "null" (see write_result_rows at the bottom).
    """

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------
    def empty_result(self, source_name: str) -> OCRTableResult:
        return OCRTableResult(
            source_name=source_name,
            development_length=None,
            points=[],
        )

    def process_image_bytes(self, data: Optional[bytes], source_name: str) -> OCRTableResult:
        # Case 1: page has no image at all
        if not data:
            logger.info("%s: no image data.", source_name)
            return self.empty_result(source_name)

        try:
            gray = self._prepare_gray(data)
        except Exception as exc:  # undecodable / corrupt / tiny image
            logger.warning("%s: unusable image (%s).", source_name, exc)
            return self.empty_result(source_name)

        development_length = self._safe(self._extract_development_length, gray, default=None)

        # Strategy 1: table lines
        rows = self._safe(self._rows_from_table_lines, gray, default=[])

        # Strategy 2: OCR word positions (broken / missing borders)
        if len(rows) < 2:
            rows = self._safe(self._extract_table_by_ocr, gray, default=[])

        points = self._rows_to_points(rows)

        if not points:
            logger.info("%s: no coordinates found.", source_name)

        return OCRTableResult(
            source_name=source_name,
            development_length=development_length,
            points=points,
        )

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------
    @staticmethod
    def _safe(func, *args, default=None):
        """Run func; on ANY error log it and return default."""
        try:
            result = func(*args)
            return default if result is None else result
        except Exception as exc:
            logger.warning("%s failed: %s", func.__name__, exc)
            return default

    @staticmethod
    def _label(index: int) -> str:
        """0->A ... 25->Z, 26->AA ... (never goes past 'Z' into symbols)."""
        name = ""
        index += 1
        while index > 0:
            index, rem = divmod(index - 1, 26)
            name = chr(65 + rem) + name
        return name

    def decode_image(self, data: bytes) -> np.ndarray:
        array = np.frombuffer(data, dtype=np.uint8)
        image = cv2.imdecode(array, cv2.IMREAD_COLOR)
        if image is None:
            raise OCRProcessingError("Could not decode the uploaded image.")
        return image

    def _prepare_gray(self, data: bytes) -> np.ndarray:
        image = self.decode_image(data)
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        h, w = gray.shape[:2]

        if h < MIN_IMAGE_SIDE or w < MIN_IMAGE_SIDE:
            raise OCRProcessingError("Image too small.")

        longest = max(h, w)
        if longest > MAX_IMAGE_SIDE:
            scale = MAX_IMAGE_SIDE / longest
            gray = cv2.resize(gray, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)

        return gray

    # ------------------------------------------------------------------
    # Number handling
    # ------------------------------------------------------------------
    def _normalize_coordinate_text(self, value) -> str:
        if value is None:
            return ""

        text = clean_text(str(value)).strip()
        if not text:
            return ""

        text = text.replace("\u2212", "-").replace("\u2013", "-").replace("\u2014", "-")
        text = re.sub(r"(?i)\s*(mm|cm|m)\s*$", "", text)      # units
        text = re.sub(r"(?<=\d)[Oo]|[Oo](?=\d)", "0", text)   # O <-> 0
        text = re.sub(r"(?<=\d),(?=\d{1,3}$)", ".", text)     # 12,5 -> 12.5
        text = text.replace(" ", "")

        match = re.search(r"-?\d+(?:\.\d+)?", text)
        return match.group(0) if match else ""

    def _to_float(self, value) -> Optional[float]:
        text = self._normalize_coordinate_text(value)
        if not text:
            return None
        try:
            return float(text)
        except ValueError:
            return None

    def _is_valid_point_row(self, row) -> bool:
        if not row or len(row) < 4:
            return False
        head = clean_text(str(row[0])).strip().lower()
        if head in {"point", "points", "coordinate", "coordinates"}:
            return False
        return all(self._to_float(row[i]) is not None for i in (1, 2, 3))

    def _rows_to_points(self, rows) -> List[Tuple[str, float, float, float]]:
        points = []
        for row in rows or []:
            if not self._is_valid_point_row(row):
                continue
            points.append((
                self._label(len(points)),
                self._to_float(row[1]),
                self._to_float(row[2]),
                self._to_float(row[3]),
            ))
        return points

    # ------------------------------------------------------------------
    # Strategy 1: table lines
    # ------------------------------------------------------------------
    @staticmethod
    def _cluster_positions(positions, tolerance=10):
        positions = sorted(positions)
        if not positions:
            return []
        groups = [[positions[0]]]
        for value in positions[1:]:
            if abs(value - groups[-1][-1]) <= tolerance:
                groups[-1].append(value)
            else:
                groups.append([value])
        return [int(round(sum(g) / len(g))) for g in groups]

    def _detect_table_lines(self, gray):
        height, width = gray.shape
        gray = cv2.GaussianBlur(gray, (3, 3), 0)

        binary = cv2.adaptiveThreshold(
            gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, 31, 10
        )

        # Horizontal lines
        h_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (max(30, width // 15), 1))
        horizontal = cv2.morphologyEx(binary, cv2.MORPH_OPEN, h_kernel)
        contours, _ = cv2.findContours(horizontal, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

        horizontal_lines = []
        for c in contours:
            x, y, w, h = cv2.boundingRect(c)
            if w > width * 0.30 and h <= 15:
                horizontal_lines.append(y + h // 2)
        horizontal_lines = self._cluster_positions(horizontal_lines, 8)

        if len(horizontal_lines) < 2:
            raise OCRProcessingError("Could not detect table rows.")

        # Vertical lines
        v_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (1, max(20, height // 25)))
        vertical = cv2.morphologyEx(binary, cv2.MORPH_OPEN, v_kernel)
        vertical = cv2.dilate(vertical, np.ones((3, 3), np.uint8), iterations=1)
        contours, _ = cv2.findContours(vertical, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

        vertical_lines = []
        for c in contours:
            x, y, w, h = cv2.boundingRect(c)
            if h > height * 0.12 and w <= 15:
                vertical_lines.append(x + w // 2)
        vertical_lines = self._cluster_positions(vertical_lines, 10)

        # Projection fallback
        if len(vertical_lines) < 2:
            projection = np.sum(vertical > 0, axis=0)
            threshold = max(int(height * 0.05), 20)
            candidates = np.where(projection > threshold)[0]
            vertical_lines = self._cluster_positions(candidates.tolist(), 10)

        if len(vertical_lines) < 2:
            raise OCRProcessingError("Could not detect table columns.")

        return horizontal_lines, vertical_lines

    def _ocr_cell(self, cell) -> str:
        if cell is None or cell.size == 0:
            return ""
        cell = cv2.resize(cell, None, fx=2, fy=2, interpolation=cv2.INTER_CUBIC)
        cell = cv2.threshold(cell, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)[1]
        try:
            text = pytesseract.image_to_string(cell, config="--psm 7", timeout=OCR_TIMEOUT_SEC)
        except RuntimeError:  # tesseract timeout
            return ""
        return clean_text(text.strip())

    def _rows_from_table_lines(self, gray):
        horizontal_lines, vertical_lines = self._detect_table_lines(gray)
        margin = 8
        table = []

        for r in range(len(horizontal_lines) - 1):
            y1, y2 = horizontal_lines[r], horizontal_lines[r + 1]
            row_data = []
            for c in range(len(vertical_lines) - 1):
                x1, x2 = vertical_lines[c], vertical_lines[c + 1]
                top, bottom = y1 + margin, y2 - margin
                left, right = x1 + margin, x2 - margin
                if bottom <= top or right <= left:
                    row_data.append("")
                    continue
                row_data.append(self._ocr_cell(gray[top:bottom, left:right]))
            table.append(row_data)

        return [row for row in table if self._is_valid_point_row(row)]

    # ------------------------------------------------------------------
    # Development length (optional)
    # ------------------------------------------------------------------
    def _extract_development_length(self, gray):
        height = gray.shape[0]
        top_crop = gray[: max(150, int(height * 0.25)), :]

        text = pytesseract.image_to_string(top_crop, config="--psm 6", timeout=OCR_TIMEOUT_SEC)
        value = parse_development_length(text)

        if value is None:
            full = pytesseract.image_to_string(gray, config="--psm 6", timeout=OCR_TIMEOUT_SEC)
            value = parse_development_length(full)

        return value  # None when not found

    # ------------------------------------------------------------------
    # Strategy 2: OCR word positions
    # ------------------------------------------------------------------
    @staticmethod
    def _header_key(text: str) -> Optional[str]:
        t = re.sub(r"[^a-z\-]", "", text.lower())
        if t == "point":
            return "point"
        m = re.fullmatch(r"([xyz])-?axis", t)
        return m.group(1) if m else None

    def _extract_table_by_ocr(self, gray):
        data = pytesseract.image_to_data(
            gray,
            config="--psm 11",
            output_type=pytesseract.Output.DICT,
            timeout=OCR_TIMEOUT_SEC,
        )

        words = []
        for i, text in enumerate(data.get("text", [])):
            text = (text or "").strip()
            if not text:
                continue
            try:
                conf = float(data["conf"][i])
            except (ValueError, TypeError, KeyError):
                conf = 0
            if conf < 20:
                continue
            x, y, w, h = data["left"][i], data["top"][i], data["width"][i], data["height"][i]
            words.append({"text": text, "cx": x + w / 2, "cy": y + h / 2})

        if not words:
            return []

        headers = {}
        for word in words:
            key = self._header_key(clean_text(word["text"]))
            if key and key not in headers:
                headers[key] = word

        if not all(k in headers for k in ("x", "y", "z")):
            return []

        header_y = max(headers[k]["cy"] for k in ("x", "y", "z"))
        point_cx = headers["point"]["cx"] if "point" in headers else headers["x"]["cx"] - 200

        columns = [
            ("point", point_cx),
            ("x", headers["x"]["cx"]),
            ("y", headers["y"]["cx"]),
            ("z", headers["z"]["cx"]),
        ]

        data_words = [w for w in words if w["cy"] > header_y + 15]
        if not data_words:
            return []

        for word in data_words:
            word["column"] = min(columns, key=lambda c: abs(word["cx"] - c[1]))[0]

        data_words.sort(key=lambda w: w["cy"])
        rows, tolerance = [], 18
        for word in data_words:
            for row in rows:
                if abs(word["cy"] - row["cy"]) <= tolerance:
                    row["words"].append(word)
                    row["cy"] = sum(w["cy"] for w in row["words"]) / len(row["words"])
                    break
            else:
                rows.append({"cy": word["cy"], "words": [word]})

        table = []
        for row in rows:
            cells = {"point": [], "x": [], "y": [], "z": []}
            for word in sorted(row["words"], key=lambda w: w["cx"]):
                cells[word["column"]].append(word["text"])

            candidate = [
                " ".join(cells["point"]).strip(),
                " ".join(cells["x"]),
                " ".join(cells["y"]),
                " ".join(cells["z"]),
            ]
            if self._is_valid_point_row(candidate):
                table.append(candidate)

        return table


# ----------------------------------------------------------------------
# Excel: write "null" when there are no coordinates
# ----------------------------------------------------------------------
NULL = "null"


def write_result_rows(ws, result: OCRTableResult) -> None:
    """
    ws = openpyxl worksheet.
    Columns: Source | Development Length | Point | X | Y | Z
    """
    dev = result.development_length if result.development_length is not None else NULL

    if not result.points:
        ws.append([result.source_name, dev, NULL, NULL, NULL, NULL])
        return

    for name, x, y, z in result.points:
        ws.append([result.source_name, dev, name, x, y, z])