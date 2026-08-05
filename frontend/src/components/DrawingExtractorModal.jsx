import React, { useState, useCallback, useRef } from 'react';
import PageVisual from "./PageVisual";
import { Modal, Button, Alert, Divider, message } from 'antd';
import { extractDimensions, extractDimensionsBbox } from '../services/api';
import DimTable from './DimTable';

const buildRowsFromBbox = (pages) => {
  const rows = [];

  (pages || []).forEach(pg => {
    const counter = {};

    const labels = (pg.blocks || []).filter(b => b.is_label);
    const numbers = (pg.blocks || []).filter(
      b => !b.is_label && b.value != null
    );

    const distance = (a, b) => {
      const ax = (a.bbox_2x[0] + a.bbox_2x[2]) / 2;
      const ay = (a.bbox_2x[1] + a.bbox_2x[3]) / 2;
      const bx = (b.bbox_2x[0] + b.bbox_2x[2]) / 2;
      const by = (b.bbox_2x[1] + b.bbox_2x[3]) / 2;
      return Math.hypot(ax - bx, ay - by);
    };

    numbers.forEach(num => {
      let bestLabel = null;
      let bestDist = Infinity;

      labels.forEach(lbl => {
        const d = distance(lbl, num);

        const verticalAligned =
          Math.abs(
            ((lbl.bbox_2x[1] + lbl.bbox_2x[3]) / 2) -
            ((num.bbox_2x[1] + num.bbox_2x[3]) / 2)
          ) < 40;

        if (d < bestDist && d < 120 && verticalAligned) {
          bestDist = d;
          bestLabel = lbl;
        }
      });

      // 🔥 label selection
      let key =
        bestLabel?.user_label ||
        bestLabel?.suggested_label ||
        num.user_label ||
        num.suggested_label ||
        "dim";

      // 🔥 clean
      key = key
        .toLowerCase()
        .replace(/\s+/g, "_")
        .replace(/[^\w]/g, "")
        .replace(/_+$/, "");

      if (!key) key = "dim";

      // 🔥 per-page numbering
      counter[key] = (counter[key] || 0) + 1;

      const finalLabel =
        counter[key] === 1 ? key : `${key}_${counter[key]}`;

      const fullLabel = `page_${pg.page}_${finalLabel}`;

      // ✅ PUSH ROW (THIS IS THE KEY CHANGE)
      rows.push({
        id: crypto.randomUUID(),   // 🔥 stable ID
        label: fullLabel,          // editable
        value: num.value           // editable
      });
    });
  });

  return rows;
};


export default function DrawingExtractorModal({ open, onClose, onConfirm }) {

  const [mode, setMode] = useState('quick');
  const [loading, setLoading] = useState(false);

  const [rows, setRows] = useState([]);          // ✅ single source of truth
  const [bboxPages, setBboxPages] = useState(null);
  const [currentPageIdx, setCurrentPageIdx] = useState(0);
  const [selectedBox, setSelectedBox] = useState(null);

  const labelsRef = useRef({});
  const [messageApi, contextHolder] = message.useMessage();

  const handleLabelChange = () => {
    setRows(prevRows => {
      return prevRows.map((row, idx) => {
        // match using page + index logic
        const [_, pageNum, ...rest] = row.label.split("_");
        const page = Number(pageNum);

        const pg = bboxPages.find(p => p.page === page);
        if (!pg) return row;

        // find matching block (by value for now)
        const block = pg.blocks.find(b => b.value == row.value);

        if (!block) return row;

        const refKey = `${page}_${pg.blocks.indexOf(block)}`;
        const newLabel = labelsRef.current[refKey];

        if (!newLabel) return row;

        return {
          ...row,
          label: `page_${page}_${newLabel}`
        };
      });
    });
  };

  // ─────────────────────────────────────────────
  // Upload handler
  // ─────────────────────────────────────────────
  const handleUpload = useCallback(async (file) => {
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      messageApi.error('Only PDF files are supported');
      return;
    }

    setLoading(true);

    const formData = new FormData();
    formData.append('file', file);

    try {
      let result;

      if (mode === 'quick') {
        const response = await extractDimensions(formData);
        result = response.data;

        if (result.status === 'error') {
          messageApi.error(result.error);
          return;
        }

        // ✅ flat → rows
        setRows(
          Object.entries(result.flat || {}).map(([k, v]) => ({
            id: crypto.randomUUID(),
            label: k,
            value: v
          }))
        );

        messageApi.success(`Extracted ${Object.keys(result.flat || {}).length} dimensions`);
      }

      else {
        const response = await extractDimensionsBbox(formData);
        result = response.data;

        if (result.status === 'error') {
          messageApi.error(result.error);
          return;
        }

        const pages = result.pages || [];
        setBboxPages(pages);
        setCurrentPageIdx(0);

        // ✅ build rows directly
        const newRows = buildRowsFromBbox(result.pages || []);
        setRows(newRows);

        messageApi.success(`Visual extraction complete — ${result.total_pages} page(s)`);
      }

    } catch (err) {
      messageApi.error('Extraction failed');
      console.error(err);
    } finally {
      setLoading(false);
    }

  }, [mode]);

  // ─────────────────────────────────────────────
  // Confirm (rows → flat)
  // ─────────────────────────────────────────────
  const handleConfirm = () => {
    const flat = Object.fromEntries(
      rows.map(r => [r.label, r.value])
    );

    if (!flat || Object.keys(flat).length === 0) {
      messageApi.warning('No dimensions to confirm');
      return;
    }

    onConfirm(flat);
    onClose();
  };


  // ─────────────────────────────────────────────
  return (
    <>
    {contextHolder}
      <Modal
        open={open}
        onCancel={onClose}
        width={1100}
        footer={[
          <Button key="cancel" onClick={onClose}>Cancel</Button>,
          <Button key="ok" type="primary" onClick={handleConfirm}>
            Use these dimensions
          </Button>
        ]}
      >

        {/* Upload */}
        <input
          type="file"
          onChange={(e) => handleUpload(e.target.files[0])}
          style={{ marginBottom: 12 }}
        />

        {/* Mode toggle */}
        <div style={{ marginBottom: 12 }}>
          <Button
            type={mode === 'quick' ? 'primary' : 'default'}
            onClick={() => setMode('quick')}
          >
            Quick
          </Button>

          <Button
            style={{ marginLeft: 8 }}
            type={mode === 'visual' ? 'primary' : 'default'}
            onClick={() => setMode('visual')}
          >
            Visual
          </Button>
        </div>

        <Divider />

        {/* ── QUICK MODE ───────────────────────── */}
        {mode === 'quick' && (
          <DimTable
            rows={rows}
            onChange={setRows}
          />
        )}

        {mode === 'visual' && Array.isArray(bboxPages) && bboxPages.length > 0 && (
          <>
            <Alert
              message={`${bboxPages.length} page(s) — click boxes to edit labels`}
              type="info"
              style={{ marginBottom: 12 }}
            />

            <div style={{ marginTop: 10 }}>
              {bboxPages.map((_, i) => (
                <Button
                  key={i}
                  size="small"
                  type={i === currentPageIdx ? "primary" : "default"}
                  onClick={() => setCurrentPageIdx(i)}
                  style={{ marginRight: 4 }}
                >
                  {i + 1}
                </Button>
              ))}
            </div>
            <div style={{ textAlign: "center", marginBottom: 12 }}>
              <Button
                disabled={currentPageIdx === 0}
                onClick={() => setCurrentPageIdx(p => p - 1)}
              >
                ← Prev
              </Button>

              <span style={{ margin: "0 12px" }}>
                Page {currentPageIdx + 1} / {bboxPages.length}
              </span>

              <Button
                disabled={currentPageIdx === bboxPages.length - 1}
                onClick={() => setCurrentPageIdx(p => p + 1)}
              >
                Next →
              </Button>
            </div>

            <div style={{ marginBottom: 10 }}>
              <Button
                danger
                disabled={!selectedBox}
                onClick={() => {
                  if (!selectedBox) return;

                  const { page, idx } = selectedBox;

                  setBboxPages(prev => {
                    const updated = prev.map(p =>
                      p.page === page
                        ? { ...p, blocks: p.blocks.filter((_, i) => i !== idx) }
                        : p
                    );

                    setRows(buildRowsFromBbox(updated));
                    return updated;
                  });

                  setSelectedBox(null);
                }}
              >
                Delete Selected
              </Button>
            </div>
            {/* 🔥 SINGLE PAGE VIEW */}
            <PageVisual
              key={bboxPages[Math.min(currentPageIdx, bboxPages.length - 1)].page}
              pageData={bboxPages[Math.min(currentPageIdx, bboxPages.length - 1)]}
              labelsRef={labelsRef}
              onLabelChange={handleLabelChange}
              onAddBlock={(pageNum, newBlock) => {
                setBboxPages(prev => {
                  const updated = prev.map(p =>
                    p.page === pageNum
                      ? { ...p, blocks: [...p.blocks, newBlock] }
                      : p
                  );
                  setRows(buildRowsFromBbox(updated));

                  return updated;
                });
              }}
              onUpdateBlocks={(pageNum, updatedBlocks) => {
                setBboxPages(prev => {
                  const updated = prev.map(p =>
                    p.page === pageNum
                      ? { ...p, blocks: updatedBlocks }
                      : p
                  );
                  setRows(buildRowsFromBbox(updated));

                  return updated;
                });
              }}
              onDeleteBlock={(pageNum, idx) => {
                setBboxPages(prev => {
                  const updated = prev.map(p =>
                    p.page === pageNum
                      ? { ...p, blocks: p.blocks.filter((_, i) => i !== idx) }
                      : p
                  );
                  setRows(buildRowsFromBbox(updated));

                  return updated;
                });
              }}
              onSelect={(page, idx) => setSelectedBox({ page, idx })}
            />

            <Divider />

            <div style={{ marginBottom: 8, fontWeight: 500 }}>
              {rows.length} dimension{rows.length !== 1 ? "s" : ""} found
            </div>

            {/* KEEP YOUR TABLE */}
            <DimTable
              rows={rows}
              onChange={(updatedRows) => {
                setRows(updatedRows);

                setBboxPages(prev =>
                  prev.map(pg => ({
                    ...pg,
                    blocks: pg.blocks.map((b, idx) => {
                      if (b.is_label || b.value == null) return b;

                      // match by value
                      const match = updatedRows.find(r => r.value == b.value);

                      if (!match) return b;

                      // 🔥 ALSO SYNC LABEL BACK
                      const refKey = `${pg.page}_${idx}`;
                      labelsRef.current[refKey] = match.label.replace(`page_${pg.page}_`, "");

                      return {
                        ...b,
                        value: match.value
                      };
                    })
                  }))
                );
              }}
            />
          </>
        )}      
        
      </Modal>
    </>
  );
}
