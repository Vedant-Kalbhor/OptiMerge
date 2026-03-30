# """
# dimension_extractor.py
# ======================
# Offline PDF dimension extraction using PyMuPDF (fitz) + spatial proximity matching.
# No LLMs, no cloud APIs — runs fully locally.

# Handles engineering drawing notation:
#   - Plain numbers:          80, 12.5
#   - Radius:                 R20  or  20\\nR
#   - Diameter prefix:        ⌀6  or  Ø6
#   - Thread spec:            M8x1.0  →  thread_major=8, thread_pitch=1.0
#   - Hole callout:           6.5\\n6 HOLES -  →  hole_dia=6.5, hole_count=6
#   - Counterbore:            CB 10 5  →  counterbore_dia=10, counterbore_depth=5
#   - Stacked numbers:        6\\n20  →  two separate dimensions
#   - Labeled drawings:       "Total Height" label matched to nearest numeric value
# """

import re
import math
from typing import Dict, List, Any, Optional

try:
    import fitz  # PyMuPDF
except ImportError:
    raise ImportError("PyMuPDF is required: pip install pymupdf")


# ── Regexes ───────────────────────────────────────────────────────────────────

PURE_NUM_RE   = re.compile(r'^\d+(\.\d+)?$')
RADIUS_RE     = re.compile(r'^R\s*(\d+\.?\d*)$', re.IGNORECASE)
DIAMETER_RE   = re.compile(r'^[⌀Øø]\s*(\d+\.?\d*)$')
THREAD_RE     = re.compile(r'^M(\d+\.?\d*)[xX×](\d+\.?\d*)$', re.IGNORECASE)
CB_RE         = re.compile(r'^CB\s+(\d+\.?\d*)\s+(\d+\.?\d*)$', re.IGNORECASE)
HOLES_LINE_RE = re.compile(r'^(\d+)\s+HOLES?\s*[-–]?\s*$', re.IGNORECASE)

SKIP_PHRASES = {
    "isometric view", "iosmetric view", "isometric", "view",
    "section", "detail", "scale", "drawing", "sheet", "r"
}

LABEL_KEYWORDS = [
    "height", "width", "depth", "length", "diameter", "dia",
    "radius", "thickness", "outer", "inner", "flange", "bore",
    "pitch", "hole", "total", "overall", "size", "dim"
]

MAX_MATCH_DISTANCE = 300



def _parse_block(text: str, cx: float, cy: float) -> List[Dict]: 
    raw = text.strip()
    if not raw:
        return []

    lines = [l.strip() for l in raw.split('\n') if l.strip()]
    if not lines:
        return []

    # Skip irrelevant annotations
    if all(l.lower() in SKIP_PHRASES for l in lines):
        return []

    results = []

    # ── Radius ─────────────────────────────────────────────
    if len(lines) == 1 and RADIUS_RE.match(lines[0]):
        m = RADIUS_RE.match(lines[0])
        results.append({'label': 'radius', 'value': m.group(1), 'cx': cx, 'cy': cy, 'is_label': False})

    elif len(lines) == 2:
        if lines[1].upper() == 'R' and PURE_NUM_RE.match(lines[0]):
            results.append({'label': 'radius', 'value': lines[0], 'cx': cx, 'cy': cy, 'is_label': False})
        elif lines[0].upper() == 'R' and PURE_NUM_RE.match(lines[1]):
            results.append({'label': 'radius', 'value': lines[1], 'cx': cx, 'cy': cy, 'is_label': False})

    # ── Diameter ───────────────────────────────────────────
    if len(lines) == 1 and DIAMETER_RE.match(lines[0]):
        m = DIAMETER_RE.match(lines[0])
        results.append({'label': 'diameter', 'value': m.group(1), 'cx': cx, 'cy': cy, 'is_label': False})

    # ── Thread ─────────────────────────────────────────────
    if len(lines) == 1 and THREAD_RE.match(lines[0]):
        m = THREAD_RE.match(lines[0])
        results.extend([
            {'label': 'thread_major_dia', 'value': m.group(1), 'cx': cx, 'cy': cy, 'is_label': False},
            {'label': 'thread_pitch',     'value': m.group(2), 'cx': cx, 'cy': cy, 'is_label': False},
        ])

    # ── Counterbore ────────────────────────────────────────
    single = ' '.join(lines)
    if CB_RE.match(single):
        m = CB_RE.match(single)
        results.extend([
            {'label': 'counterbore_dia',   'value': m.group(1), 'cx': cx, 'cy': cy, 'is_label': False},
            {'label': 'counterbore_depth', 'value': m.group(2), 'cx': cx, 'cy': cy, 'is_label': False},
        ])

    # ── Hole callout ───────────────────────────────────────
    num_lines  = [l for l in lines if PURE_NUM_RE.match(l)]
    hole_lines = [l for l in lines if HOLES_LINE_RE.match(l)]

    if hole_lines and num_lines:
        hole_count = HOLES_LINE_RE.match(hole_lines[0]).group(1)
        results.extend([
            {'label': 'hole_dia',   'value': num_lines[0], 'cx': cx, 'cy': cy, 'is_label': False},
            {'label': 'hole_count', 'value': hole_count,   'cx': cx, 'cy': cy, 'is_label': False},
        ])

    # ── Label extraction (IMPORTANT: do NOT return early) ──
    lbl_lines = [
        l for l in lines
        if any(c.isalpha() for c in l)
        and l.lower() not in SKIP_PHRASES
        and not THREAD_RE.match(l)
        and not CB_RE.match(l)
        and not HOLES_LINE_RE.match(l)
        and not RADIUS_RE.match(l)
        and not DIAMETER_RE.match(l)
    ]

    if lbl_lines:
        label_text = ' '.join(lbl_lines)
        results.append({
            'label': label_text,
            'value': None,
            'cx': cx,
            'cy': cy,
            'is_label': True
        })

    # ── Plain numbers ──────────────────────────────────────
    for n in lines:
        if PURE_NUM_RE.match(n):
            results.append({
                'label': None,
                'value': n,
                'cx': cx,
                'cy': cy,
                'is_label': False
            })

    return results

# ── Page extractor ────────────────────────────────────────────────────────────

def _euclidean(a: dict, b: dict) -> float:
    return math.sqrt((a['cx'] - b['cx']) ** 2 + (a['cy'] - b['cy']) ** 2)

def split_span_bbox(text, bbox):
    x0, y0, x1, y1 = bbox
    tokens = re.split(r'\s+', text)
    width = (x1 - x0) / max(len(tokens), 1)

    results = []
    for i, t in enumerate(tokens):
        tx0 = x0 + i * width
        tx1 = tx0 + width
        cx = (tx0 + tx1) / 2
        cy = (y0 + y1) / 2

        results.append((t, tx0, y0, tx1, y1, cx, cy))

    return results

def _merge_nearby_labels(labels: list, cx_tol=80, cy_tol=50) -> list:
    used, merged = set(), []
    for i, la in enumerate(labels):
        if i in used:
            continue
        group_text = la['label']
        for j, lb in enumerate(labels):
            if i == j or j in used:
                continue
            if abs(la['cx'] - lb['cx']) < cx_tol and abs(la['cy'] - lb['cy']) < cy_tol and la['is_label'] and lb['is_label']:
                group_text += ' ' + lb['label']
                used.add(j)
        used.add(i)
        merged.append({'label': group_text.strip(), 'cx': la['cx'], 'cy': la['cy']})
    return merged

import re

def _split_span_tokens(text, bbox):
    x0, y0, x1, y1 = bbox
    tokens = re.split(r'\s+', text.strip())

    if len(tokens) == 1:
        cx, cy = (x0 + x1)/2, (y0 + y1)/2
        return [(tokens[0], x0, y0, x1, y1, cx, cy)]

    # 🔥 split horizontally (important)
    width = (x1 - x0) / len(tokens)
    results = []

    for i, t in enumerate(tokens):
        tx0 = x0 + i * width
        tx1 = tx0 + width
        cx = (tx0 + tx1)/2
        cy = (y0 + y1)/2

        results.append((t, tx0, y0, tx1, y1, cx, cy))

    return results


def _extract_page(page) -> Dict[str, Any]:
    all_entries = []
    for block in page.get_text("dict")["blocks"]:
      for line in block.get("lines", []):
          for span in line.get("spans", []):
              text = span["text"].strip()
              if not text:
                  continue

              
              x0, y0, x1, y1 = span["bbox"]

              # 🔥 split span into individual tokens WITH bbox
              for t, tx0, ty0, tx1, ty1, tcx, tcy in _split_span_tokens(text, (x0, y0, x1, y1)):
                  entries = _parse_block(t, tcx, tcy)
                  all_entries.extend(entries)
    
    # 🔥 IMPORTANT: reconstruct multi-token patterns
    all_entries = _post_process_entries(all_entries)      

    labels  = [e for e in all_entries if e['is_label']]
    numbers = [e for e in all_entries if not e['is_label'] and e['value'] is not None]

    # ── LABELED mode ──────────────────────────────────────────────────────────
    has_dim_labels = any(
        any(kw in e['label'].lower() for kw in LABEL_KEYWORDS)
        for e in labels
    )

    if has_dim_labels and numbers:
        merged = _merge_nearby_labels(labels)
        dim_labels = [l for l in merged if any(kw in l['label'].lower() for kw in LABEL_KEYWORDS)]
        dim_labels = sorted(dim_labels, key=lambda l: sum(1 for kw in LABEL_KEYWORDS if kw in l['label'].lower()), reverse=True)

        used_idx, dimensions = set(), {}
        for lbl in dim_labels:
            best_d, best_i = float('inf'), None
            for idx, num in enumerate(numbers):
                if idx in used_idx:
                    continue
                d = _euclidean(lbl, num)
                if d < best_d and d <= MAX_MATCH_DISTANCE:
                    best_d, best_i = d, idx
            if best_i is not None:
                dimensions[lbl['label']] = numbers[best_i]['value']
                used_idx.add(best_i)
        return {'mode': 'labeled', 'dimensions': dimensions}

    # ── UNLABELED mode ────────────────────────────────────────────────────────
    if numbers:
        named   = [e for e in numbers if e['label'] is not None]
        unnamed = [e for e in numbers if e['label'] is None]

        dimensions = {}
        name_counter = {}
        for e in named:
            base = e['label']
            name_counter[base] = name_counter.get(base, 0) + 1
            key = base if name_counter[base] == 1 else f"{base}_{name_counter[base]}"
            dimensions[key] = e['value']

        sorted_unnamed = sorted(unnamed, key=lambda n: (round(n['cy'] / 30), n['cx']))
        for i, e in enumerate(sorted_unnamed):
            dimensions[f'dim_{i+1}'] = e['value']

        return {'mode': 'unlabeled', 'dimensions': dimensions}

    return {'mode': 'empty', 'dimensions': {}}



# ── Public API ────────────────────────────────────────────────────────────────

def _process_doc(doc, filename: str) -> Dict[str, Any]:
    pages_result, flat, modes_seen = {}, {}, set()

    for page_num in range(len(doc)):
        result = _extract_page(doc[page_num])
        pages_result[page_num + 1] = result
        modes_seen.add(result['mode'])

        for key, val in result['dimensions'].items():
            if result['mode'] == 'labeled':
                flat[key] = val
            else:
                flat[f'page_{page_num+1}_{key}'] = val

    doc.close()

    meaningful = modes_seen - {'empty'}
    overall_mode = (
        'empty' if not meaningful else
        'mixed' if len(meaningful) > 1 else
        meaningful.pop()
    )

    return {
        'status':      'ok',
        'filename':    filename,
        'total_pages': len(pages_result),
        'mode':        overall_mode,
        'pages':       pages_result,
        'flat':        flat,
    }


def extract_dimensions_from_pdf(pdf_path: str) -> Dict[str, Any]:
    try:
        doc = fitz.open(pdf_path)
    except Exception as e:
        return {'status': 'error', 'error': str(e), 'filename': pdf_path}
    return _process_doc(doc, pdf_path)


def extract_dimensions_from_bytes(file_bytes: bytes, filename: str = 'drawing.pdf') -> Dict[str, Any]:
    try:
        doc = fitz.open(stream=file_bytes, filetype='pdf')
    except Exception as e:
        return {'status': 'error', 'error': str(e), 'filename': filename}
    return _process_doc(doc, filename)


def _post_process_entries(entries):
    result = []
    i = 0

    while i < len(entries):
        e = entries[i]

        # ── HOLES pattern: [6.5] [6] [HOLES] ──
        if (
            i + 2 < len(entries)
            and entries[i]['value'] is not None
            and entries[i+1]['value'] is not None
            and entries[i+2]['label'] and 'hole' in entries[i+2]['label'].lower()
        ):
            result.append({
                'label': 'hole_dia',
                'value': entries[i]['value'],
                'cx': e['cx'], 'cy': e['cy'],
                'is_label': False
            })
            result.append({
                'label': 'hole_count',
                'value': entries[i+1]['value'],
                'cx': e['cx'], 'cy': e['cy'],
                'is_label': False
            })
            i += 3
            continue

        # ── CB pattern: [CB] [10] [5] ──
        if (
            i + 2 < len(entries)
            and entries[i]['label'] and entries[i]['label'].lower() == 'cb'
            and entries[i+1]['value'] is not None
            and entries[i+2]['value'] is not None
        ):
            result.append({
                'label': 'counterbore_dia',
                'value': entries[i+1]['value'],
                'cx': e['cx'], 'cy': e['cy'],
                'is_label': False
            })
            result.append({
                'label': 'counterbore_depth',
                'value': entries[i+2]['value'],
                'cx': e['cx'], 'cy': e['cy'],
                'is_label': False
            })
            i += 3
            continue

        # default
        result.append(e)
        i += 1

    return result


def extract_with_bboxes(file_bytes: bytes, filename: str = 'drawing.pdf') -> Dict[str, Any]:
    """
    Returns per-page rasterized image (base64 PNG) + all detected text blocks
    with their bounding boxes, colors, categories and suggested labels.
    """

    import base64

    try:
        doc = fitz.open(stream=file_bytes, filetype='pdf')
    except Exception as e:
        return {'status': 'error', 'error': str(e), 'filename': filename}

    NAMED_LABELS = {
        'radius', 'diameter', 'thread_major_dia', 'thread_pitch',
        'counterbore_dia', 'counterbore_depth', 'hole_dia', 'hole_count'
    }

    pages = []

    for page_num in range(len(doc)):
        page = doc[page_num]

        # Render page image (2x scale)
        mat = fitz.Matrix(2, 2)
        pix = page.get_pixmap(matrix=mat)
        img_b64 = base64.b64encode(pix.tobytes('png')).decode()

        blocks_data = []
        dim_counter = 0

        # 🔥 FIX: Use dict → lines → spans (NOT blocks)
        for block in page.get_text("dict")["blocks"]:
            for line in block.get("lines", []):
                for span in line.get("spans", []):

                    text = span["text"].strip()
                    if not text:
                        continue

                    x0, y0, x1, y1 = span["bbox"]

                    # 🔥 SPLIT MULTIPLE VALUES INSIDE SPAN
                    for t, tx0, ty0, tx1, ty1, tcx, tcy in _split_span_tokens(
                        text, (x0, y0, x1, y1)
                    ):
                        entries = _parse_block(t, tcx, tcy)

                        for entry in entries:

                            # ── Determine category & color ──
                            if entry['is_label']:
                                color = '#4096ff'   # blue
                                category = 'label'
                                suggested_label = entry['label']

                            elif entry['label'] in NAMED_LABELS:
                                color = '#fa8c16'   # orange
                                category = 'named_dim'
                                suggested_label = entry['label']

                            else:
                                dim_counter += 1
                                color = '#52c41a'   # green
                                category = 'dimension'
                                suggested_label = f'dim_{dim_counter}'

                            # ── Append block ──
                            blocks_data.append({
                                'bbox':    [round(tx0,1), round(ty0,1), round(tx1,1), round(ty1,1)],
                                'bbox_2x': [round(tx0*2,1), round(ty0*2,1), round(tx1*2,1), round(ty1*2,1)],
                                'text': t,
                                'value': entry['value'],
                                'is_label': entry['is_label'],
                                'category': category,
                                'color': color,
                                'suggested_label': suggested_label,
                                'user_label': suggested_label,
                            })

        pages.append({
            'page':           page_num + 1,
            'pdf_width':      round(page.rect.width, 1),
            'pdf_height':     round(page.rect.height, 1),
            'display_width':  pix.width,
            'display_height': pix.height,
            'image_b64':      img_b64,
            'blocks':         blocks_data,
        })

    doc.close()

    return {
        'status': 'ok',
        'filename': filename,
        'total_pages': len(pages),
        'pages': pages
    }