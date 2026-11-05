from io import BytesIO
from typing import List, Optional
from openpyxl import Workbook, load_workbook
from openpyxl.styles import Font, Alignment, PatternFill, Border, Side
from openpyxl.utils import get_column_letter
from app.schemas.ocr_schema import OCRTableResult
from pathlib import Path

class ExcelService:

    def _headers(self, max_points: int):
        headers = ["Name", "No. of Bends", "Development Length"]

        for index in range(max_points):
            point = chr(65 + index)
            headers.extend([f"x{point}", f"y{point}", f"z{point}"])

        return headers

    def _next_name(self, ws):
        highest = 0

        for row in range(3, ws.max_row + 1):
            value = ws.cell(row=row, column=1).value
            if isinstance(value, str) and value.startswith("P"):
                try:
                    highest = max(highest, int(value[1:]))
                except ValueError:
                    pass

        return f"P{highest + 1:03d}"

    def _image_name(self, ws, filename: str) -> str:
        """a001.png -> a001, abcd.JPG -> abcd, 12334.jpeg -> 12334.
        If that name is already in column 1, add _2, _3, ..."""
        stem = Path(filename or "").stem.strip() or "image"

        existing = {
            str(ws.cell(row=row, column=1).value)
            for row in range(3, ws.max_row + 1)
            if ws.cell(row=row, column=1).value is not None
        }

        name, n = stem, 2
        while name in existing:
            name = f"{stem}_{n}"
            n += 1
        return name

    def _resolve_name(self, ws, is_image: bool, filename: str = "") -> str:
        if is_image:
            return self._image_name(ws, filename)   # new: image's own file name
        return self._next_name(ws)                  # unchanged: P001, P002, ...

    def _find_data_end(self, ws):
        last = 2

        for row in range(3, ws.max_row + 1):
            if ws.cell(row=row, column=1).value:
                last = row

        return last

    def _remove_old_note_rows(self, ws):
        for row in range(ws.max_row, 2, -1):
            value = ws.cell(row=row, column=2).value
            if isinstance(value, str) and "no. of bends" in value.lower():
                ws.delete_rows(row, 1)

    def _ensure_headers(self, ws, max_points):
        required = self._headers(max_points)

        for col, header in enumerate(required, start=1):
            ws.cell(row=2, column=col).value = header

        return len(required)

    # old code
    # def _write_result(self, ws, row_number, result, max_points):
    #     ws.cell(row=row_number, column=1).value = self._next_name(ws)

    #     last_coordinate_column = 3 + max_points * 3
    #     last_coordinate_letter = get_column_letter(last_coordinate_column)

    #     # Excel formula: bends = number of points - 2.
    #     ws.cell(row=row_number, column=2).value = (
    #         f'=MAX(0,COUNTA(D{row_number}:{last_coordinate_letter}{row_number})/3-2)'
    #     )

    #     ws.cell(row=row_number, column=3).value = result.development_length

    #     column = 4
    #     for _, x, y, z in result.points:
    #         ws.cell(row=row_number, column=column).value = x
    #         ws.cell(row=row_number, column=column + 1).value = y
    #         ws.cell(row=row_number, column=column + 2).value = z
    #         column += 3

    def _write_result(
        self,
        ws,
        row_number,
        result,
        max_points,
        is_image=False
    ):
        ws.cell(row=row_number, column=1).value = (
            self._resolve_name(
                ws,
                is_image,
                result.source_name
            )
        )

        last_coordinate_column = 3 + max_points * 3
        last_coordinate_letter = get_column_letter(last_coordinate_column)

        ws.cell(row=row_number, column=2).value = (
            f'=MAX(0,COUNTA(D{row_number}:{last_coordinate_letter}{row_number})/3-2)'
        )

        ws.cell(row=row_number, column=3).value = result.development_length

        column = 4

        for _, x, y, z in result.points:
            ws.cell(row=row_number, column=column).value = x
            ws.cell(row=row_number, column=column + 1).value = y
            ws.cell(row=row_number, column=column + 2).value = z
            column += 3

    def build_excel(
        self,
        results: List[OCRTableResult],
        existing_excel: Optional[bytes] = None,
        is_image: bool = False #added new =====
    ) -> bytes:
        if existing_excel:
            wb = load_workbook(BytesIO(existing_excel))
            ws = wb[wb.sheetnames[0]]
            self._remove_old_note_rows(ws)
            start_row = self._find_data_end(ws) + 1

            existing_points = max(0, (ws.max_column - 3) // 3)
            max_points = max(
                existing_points,
                max(len(result.points) for result in results)
            )
        else:
            wb = Workbook()
            ws = wb.active
            ws.title = "Extraction"
            start_row = 3
            max_points = max(len(result.points) for result in results)

            ws.cell(row=1, column=1).value = "Engineering Drawing OCR Extraction"

        self._ensure_headers(ws, max_points)

        for offset, result in enumerate(results):
            self._write_result(
                ws,
                start_row + offset,
                result,
                max_points,
                is_image=is_image
            )

        note_row = start_row + len(results) + 1
        ws.cell(
            row=note_row,
            column=2
        ).value = "No. of bends = (No. of points - 2)"

        header_fill = PatternFill(fill_type="solid", fgColor="D9EAF7")
        thin = Side(style="thin", color="808080")

        for cell in ws[2]:
            if cell.value:
                cell.font = Font(bold=True)
                cell.fill = header_fill
                cell.alignment = Alignment(horizontal="center")
                cell.border = Border(
                    left=thin, right=thin, top=thin, bottom=thin
                )

        for row in ws.iter_rows(min_row=3, max_row=ws.max_row):
            for cell in row:
                if cell.value is not None:
                    cell.border = Border(
                        left=thin, right=thin, top=thin, bottom=thin
                    )

        for col in range(1, ws.max_column + 1):
            letter = get_column_letter(col)
            ws.column_dimensions[letter].width = 18

        ws.column_dimensions["A"].width = 14
        ws.column_dimensions["B"].width = 20
        ws.column_dimensions["C"].width = 22

        ws.freeze_panes = "D3"

        # Ask Excel to recalculate formulas when the workbook is opened.
        try:
            wb.calculation.fullCalcOnLoad = True
            wb.calculation.forceFullCalc = True
            wb.calculation.calcMode = "auto"
        except Exception:
            pass

        output = BytesIO()
        wb.save(output)
        return output.getvalue()
