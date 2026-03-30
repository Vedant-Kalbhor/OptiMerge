import React, { useRef, useState, memo, useEffect } from "react";
import { Modal, Input } from "antd";

const CATEGORY_COLOR = {
  dimension: "#52c41a",
  named_dim: "#fa8c16",
  label: "#4096ff"
};

export default memo(function PageVisual({ pageData, labelsRef, onLabelChange, onAddBlock, onUpdateBlocks, onSelect }) {
  const imgRef = useRef(null);
  const [scale, setScale] = useState(1);
  const [editingIdx, setEditingIdx] = useState(null);
  const [editVal, setEditVal] = useState("");
  const [drawing, setDrawing] = useState(null);
  const [resizing, setResizing] = useState(null);
  const [selectedIdx, setSelectedIdx] = useState(null); //for selecting resize, edit, delete mode
  const [newBoxDraft, setNewBoxDraft] = useState(null);
  const [labelInput, setLabelInput] = useState("");
  const [valueInput, setValueInput] = useState("");

  // 🔥 auto-scale to match rendered image
  const handleImgLoad = () => {
    if (imgRef.current) {
      setScale(imgRef.current.clientWidth / pageData.display_width);
    }
  };

  const getLabel = (idx) => {
    const key = `${pageData.page}_${idx}`;
    return labelsRef.current[key] ?? pageData.blocks[idx].user_label;
  };

  const getCoords = (e) => {
    const rect = imgRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / scale;
    const y = (e.clientY - rect.top) / scale;
    return { x, y };
  };

  const startEdit = (idx) => {
    const key = `${pageData.page}_${idx}`;
    const current = labelsRef.current[key] ?? pageData.blocks[idx].user_label;
    setEditingIdx(idx);
    setEditVal(current);
  };

  const confirmEdit = (idx) => {
    const key = `${pageData.page}_${idx}`;
    labelsRef.current[key] = editVal;
    onLabelChange();
    setEditingIdx(null);
  };

  //handle new annotation
  const handleMouseDown = (e) => {
    // don't draw if clicking on box or resize handle
    if (e.target !== imgRef.current) return;

    const { x, y } = getCoords(e);
    setDrawing({ x0: x, y0: y, x1: x, y1: y });
  };

  const handleMouseMove = (e) => {
    const { x, y } = getCoords(e);

    // PRIORITY 1: resizing
    if (resizing) {
      const updatedBlocks = [...pageData.blocks];
      const b = updatedBlocks[resizing.idx];

      updatedBlocks[resizing.idx] = {
        ...b,
        bbox_2x: [b.bbox_2x[0], b.bbox_2x[1], x, y]
      };

      onUpdateBlocks(pageData.page, updatedBlocks);
      return;
    }

    // PRIORITY 2: drawing
    if (drawing) {
      setDrawing(prev => ({ ...prev, x1: x, y1: y }));
    }
  };

  const handleMouseUp = () => {
    // stop resize
    if (resizing) {
      setResizing(null);
      return;
    }

    // drawing complete
    if (!drawing) return;

    const width = Math.abs(drawing.x1 - drawing.x0);
    const height = Math.abs(drawing.y1 - drawing.y0);

    // 🚫 ignore clicks (no drag)
    if (width < 5 || height < 5) {
      setDrawing(null);
      return;
    }

    // ✅ open modal
    setNewBoxDraft({
      bbox_2x: [
        Math.min(drawing.x0, drawing.x1),
        Math.min(drawing.y0, drawing.y1),
        Math.max(drawing.x0, drawing.x1),
        Math.max(drawing.y0, drawing.y1),
      ]
    });

    setLabelInput("dim");
    setValueInput("");

    setDrawing(null);
  };

  //resize Handler 
  const handleResizeStart = (e, idx) => {
    e.stopPropagation();
    setResizing({ idx });
  };

  useEffect(() => {
    const handler = (e) => {
      if (e.key === "Escape") {
        setSelectedIdx(null);
        onSelect?.(null, null);
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  return (
    <div style={{ marginBottom: 32 }}>
      <div style={{ fontWeight: 600, marginBottom: 6 }}>
        Page {pageData.page}
      </div>

      <Modal
        open={!!newBoxDraft}
        title="Add Dimension"
        onOk={() => {
          if (!labelInput) return;

          const newBlock = {
            ...newBoxDraft,
            value: valueInput || null,
            user_label: labelInput,
            suggested_label: labelInput,
            is_label: false,
            category: "dimension"
          };

          onAddBlock(pageData.page, newBlock);

          setNewBoxDraft(null);
          setLabelInput("");
          setValueInput("");
        }}
        onCancel={() => setNewBoxDraft(null)}
      >
        <div style={{ marginBottom: 8 }}>Label</div>
        <Input
          value={labelInput}
          onChange={(e) => setLabelInput(e.target.value)}
        />

        <div style={{ marginTop: 12, marginBottom: 8 }}>Value</div>
        <Input
          value={valueInput}
          onChange={(e) => setValueInput(e.target.value)}
        />
      </Modal>

      <div style={{ position: "relative", display: "inline-block", width: "100%" }} 
        onMouseDown={(e) => {
          // click on empty area → deselect
          if (e.target === imgRef.current) {
            setSelectedIdx(null);
            onSelect?.(null, null);
          }

          handleMouseDown(e);
        }}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
      >
        {/* IMAGE */}
        <img
          ref={imgRef}
          src={`data:image/png;base64,${pageData.image_b64}`}
          alt=""
          style={{ width: "100%", display: "block" }}
          onLoad={handleImgLoad}
        />

        {/* BOXES */}
        {pageData.blocks.map((block, idx) => {
          const [x0, y0, x1, y1] = block.bbox_2x;
          const color = CATEGORY_COLOR[block.category] || "#999";
          const label = getLabel(idx);

          return (
            <div
              key={idx}
              onClick={(e) => {
                e.stopPropagation();
                setSelectedIdx(idx);
                onSelect(pageData.page, idx);
              }}
              style={{
                position: "absolute",
                left: x0 * scale,
                top: y0 * scale,
                width: (x1 - x0) * scale,
                height: (y1 - y0) * scale,
                border: selectedIdx === idx? "3px solid #1677ff" : `2px solid ${color}`,
                borderRadius: 3,
                cursor: "pointer"
              }}
            >

              {/* 🟡 LABEL */}
              <div style={{
                position: "absolute",
                top: -20,
                left: 0,
                background: color,
                color: "#fff",
                fontSize: 10,
                padding: "2px 6px",
                borderRadius: 3,
                whiteSpace: "nowrap",
                zIndex: 10   // 🔥 IMPORTANT
              }}>
                {editingIdx === idx ? (
                  <input
                    autoFocus
                    value={editVal}
                    onChange={(e) => setEditVal(e.target.value)}
                    onBlur={() => confirmEdit(idx)}
                    style={{ fontSize: 10, width: 120 }}
                  />
                ) : (
                  <span onDoubleClick={() => startEdit(idx)}>
                    {block.value ? `${label}: ${block.value}` : label}
                  </span>
                )}
              </div>

              {/* 🔲 RESIZE HANDLE (ADD HERE) */}
              <div
                onMouseDown={(e) => handleResizeStart(e, idx)}
                style={{
                  position: "absolute",
                  right: -4,
                  bottom: -4,
                  width: 10,
                  height: 10,
                  background: "#1677ff",
                  cursor: "nwse-resize"
                }}
              />

            </div>
          );
        })}

        {drawing && (
          <div
            style={{
              position: "absolute",
              left: drawing.x0 * scale,
              top: drawing.y0 * scale,
              width: (drawing.x1 - drawing.x0) * scale,
              height: (drawing.y1 - drawing.y0) * scale,
              border: "2px dashed blue",
              zIndex: 5
            }}
          />
        )}
      </div>
    </div>
  );
});