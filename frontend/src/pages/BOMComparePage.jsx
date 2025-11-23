// File: src/pages/BOMComparePage.jsx
import React, { useMemo } from "react";
import { useParams, useLocation, useNavigate } from "react-router-dom";
import { Card, Row, Col, Tag, Button, Typography, Divider } from "antd";
const { Title, Text } = Typography;

/* Utility: normalize list input into array of items.
   Supported input types:
   - Array of objects or strings
   - String (comma or whitespace separated)
   - Object map {component: qty, ...} -> converts to [{component, qty}, ...]
*/
function parseList(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw === "string") {
    // comma separated first
    const byComma = raw.split(",").map((s) => s.trim()).filter(Boolean);
    if (byComma.length > 1) return byComma;
    return raw.split(/\s+/).map((s) => s.trim()).filter(Boolean);
  }
  if (typeof raw === "object") {
    // object map {comp: qty}
    try {
      return Object.entries(raw).map(([k, v]) => {
        if (v && typeof v === "object") return { component: k, ...v };
        // v might be numeric qty or string
        return {
          component: k,
          qty:
            typeof v === "number"
              ? v
              : typeof v === "string" && v !== ""
              ? Number(v) || v
              : v,
        };
      });
    } catch {
      return [String(raw)];
    }
  }
  return [String(raw)];
}

/* Try to extract {component, qty} from a string like:
   "COMP123:4", "COMP123 (4)", "COMP123 qty=4", "COMP123 A:4", "COMP123|4"
   Returns object {component, qty} or null if not parsable
*/
function parseComponentQtyString(s) {
  if (!s || typeof s !== "string") return null;
  // common regexes
  const patterns = [
    /^(?<name>[\w\-\.]+)\s*[:|]\s*(?<qty>\d+(?:\.\d+)?)$/, // COMP:4 or COMP|4
    /^(?<name>.+?)\s*\(\s*(?<qty>\d+(?:\.\d+)?)\s*\)$/, // COMP (4)
    /^(?<name>.+?)\s+qty\s*=\s*(?<qty>\d+(?:\.\d+)?)$/i, // COMP qty=4
    /^(?<name>.+?)\s+[A|B]\s*:\s*(?<qty>\d+(?:\.\d+)?)$/i, // COMP A:4 or COMP B:4
    /^(?<name>.+?)\s+(?<qty>\d+)$/, // COMP 4 (last token number)
  ];

  for (const rx of patterns) {
    const m = s.match(rx);
    if (m && m.groups) {
      const name = (m.groups.name || "").trim();
      const qtyRaw = m.groups.qty;
      const qty = qtyRaw != null ? Number(qtyRaw) : null;
      return { component: name, qty: !Number.isNaN(qty) ? qty : qtyRaw };
    }
  }
  return null;
}

/* Small helpers for CSV export */
function getComponentName(item) {
  if (!item) return "";
  if (typeof item === "object") {
    return item.component || item.part || item.name || "";
  }
  if (typeof item === "string") {
    const parsed = parseComponentQtyString(item);
    if (parsed) return parsed.component || "";
    return item;
  }
  return String(item);
}

function listToNameString(list) {
  return list
    .map((item) => getComponentName(item))
    .filter((name) => name && String(name).trim() !== "")
    .join(", ");
}

function csvEscape(value) {
  const str = value == null ? "" : String(value);
  // escape " by doubling them, then wrap in quotes to protect commas
  const escaped = str.replace(/"/g, '""');
  return `"${escaped}"`;
}

/* Render a common component (object or string) showing qty_a, qty_b, common_qty */
function CommonComponentTag({ item }) {
  if (!item) return null;
  if (typeof item === "object") {
    const name = item.component || item.part || item.name || "unknown";
    const qa =
      item.qty_a != null ? item.qty_a : item.qty != null ? item.qty : "-";
    const qb = item.qty_b != null ? item.qty_b : "-";
    const common =
      item.common_qty != null
        ? item.common_qty
        : Math.min(Number(qa || 0), Number(qb || 0)) || null;

    return (
      <div
        style={{
          display: "inline-flex",
          flexDirection: "column",
          alignItems: "flex-start",
          margin: 6,
          padding: "8px 10px",
          borderRadius: 12,
          background: "#f7fbff",
          border: "1px solid #e6f3ff",
          minWidth: 150,
        }}
      >
        <div style={{ fontWeight: 600, fontSize: 13 }}>{name}</div>
        <div style={{ fontSize: 12, color: "#333", marginTop: 4 }}>
          <span style={{ marginRight: 8 }}>A: {qa}</span>
          <span style={{ marginRight: 8 }}>B: {qb}</span>
          {common !== null && (
            <span style={{ color: "#1677ff", fontWeight: 600 }}>
              common: {common}
            </span>
          )}
        </div>
      </div>
    );
  }
  // fallback single string
  const parsed = parseComponentQtyString(item);
  if (parsed) {
    return (
      <div style={{ display: "inline-block", margin: 6 }}>
        <Tag style={{ padding: "6px 10px" }}>
          <div style={{ fontWeight: 600 }}>{parsed.component}</div>
          <div style={{ fontSize: 12 }}>(qty: {parsed.qty})</div>
        </Tag>
      </div>
    );
  }
  return <Tag style={{ margin: 6 }}>{String(item)}</Tag>;
}

/* Render unique item with quantity reliably */
function UniqueComponentTag({ item }) {
  if (!item) return null;

  // If item is object with component & qty
  if (typeof item === "object") {
    const name = item.component || item.part || item.name || "unknown";
    const qty =
      item.qty != null
        ? item.qty
        : item.qty_a != null
        ? item.qty_a
        : item.quantity != null
        ? item.quantity
        : "-";
    return (
      <Tag style={{ margin: 6, padding: "6px 10px", borderRadius: 10 }}>
        <div style={{ fontWeight: 600 }}>{name}</div>
        <div style={{ fontSize: 12 }}>(qty: {qty})</div>
      </Tag>
    );
  }

  // If item is string, try to parse "name:qty" etc.
  const parsed = parseComponentQtyString(item);
  if (parsed) {
    return (
      <Tag style={{ margin: 6, padding: "6px 10px", borderRadius: 10 }}>
        <div style={{ fontWeight: 600 }}>{parsed.component}</div>
        <div style={{ fontSize: 12 }}>(qty: {parsed.qty})</div>
      </Tag>
    );
  }

  // fallback: unknown qty
  return (
    <Tag style={{ margin: 6, padding: "6px 10px", borderRadius: 10 }}>
      <div style={{ fontWeight: 600 }}>{String(item)}</div>
      <div style={{ fontSize: 12 }}>(qty: -)</div>
    </Tag>
  );
}

export default function BOMComparePage() {
  const { bomA: bomAparam, bomB: bomBparam } = useParams();
  const location = useLocation();
  const navigate = useNavigate();

  const pair = location.state?.pair || {};

  const bomA = pair.bom_a || pair.bomA || bomAparam || "BOM_A";
  const bomB = pair.bom_b || pair.bomB || bomBparam || "BOM_B";

  // Primary sources for lists: prefer quantity-aware fields from backend
  const commonRaw =
    pair.common_components || pair.common_parts || pair.common || [];
  const uniqueARaw =
    pair.unique_components_a ||
    pair.unique_a ||
    pair.unique_in_a ||
    pair.uniqueA ||
    [];
  const uniqueBRaw =
    pair.unique_components_b ||
    pair.unique_b ||
    pair.unique_in_b ||
    pair.uniqueB ||
    [];

  // Normalize to arrays
  const common = Array.isArray(commonRaw) ? commonRaw : parseList(commonRaw);
  const uniqueA = Array.isArray(uniqueARaw) ? uniqueARaw : parseList(uniqueARaw);
  const uniqueB = Array.isArray(uniqueBRaw) ? uniqueBRaw : parseList(uniqueBRaw);

  // If unique arrays are empty, attempt to compute remaining qty from common entries
  const computedUniqueA = useMemo(() => {
    if (uniqueA.length > 0) return uniqueA;
    const res = [];
    common.forEach((c) => {
      if (typeof c === "object") {
        const comp = c.component || c.part || c.name;
        const qa = Number(c.qty_a || 0);
        const commonQty = Number(
          c.common_qty || Math.min(c.qty_a || 0, c.qty_b || 0) || 0
        );
        const rem = qa - commonQty;
        if (rem > 0) res.push({ component: comp, qty: rem });
      }
    });
    return res;
  }, [uniqueA, common]);

  const computedUniqueB = useMemo(() => {
    if (uniqueB.length > 0) return uniqueB;
    const res = [];
    common.forEach((c) => {
      if (typeof c === "object") {
        const comp = c.component || c.part || c.name;
        const qb = Number(c.qty_b || 0);
        const commonQty = Number(
          c.common_qty || Math.min(c.qty_a || 0, c.qty_b || 0) || 0
        );
        const rem = qb - commonQty;
        if (rem > 0) res.push({ component: comp, qty: rem });
      }
    });
    return res;
  }, [uniqueB, common]);

  const finalUniqueA = uniqueA.length > 0 ? uniqueA : computedUniqueA;
  const finalUniqueB = uniqueB.length > 0 ? uniqueB : computedUniqueB;

  // Build name-sets for Jaccard
  const namesFromCommon = common.map((c) =>
    typeof c === "object" ? c.component || c.part || c.name : String(c)
  );
  const namesUniqueA = finalUniqueA.map((u) =>
    typeof u === "object" ? u.component || u.part || u.name : String(u)
  );
  const namesUniqueB = finalUniqueB.map((u) =>
    typeof u === "object" ? u.component || u.part || u.name : String(u)
  );

  const setA = new Set([...namesFromCommon, ...namesUniqueA]);
  const setB = new Set([...namesFromCommon, ...namesUniqueB]);

  const jaccardPercent = useMemo(() => {
    if (pair.similarity_score != null) {
      const score = Number(pair.similarity_score);
      if (!Number.isNaN(score)) return Math.round(score * 10000) / 100;
    }
    const inter = new Set([...setA].filter((x) => setB.has(x)));
    const union = new Set([...setA, ...setB]);
    if (union.size === 0) return 0;
    const pct = (inter.size / union.size) * 100;
    return Math.round(pct * 100) / 100;
  }, [pair, setA, setB]);

  const counts = {
    commonCount: namesFromCommon.length,
    uniqueCountA: namesUniqueA.length,
    uniqueCountB: namesUniqueB.length,
  };

  const handleExportCsv = () => {
    const headers = [
      "BOMA",
      "BOMB",
      "Unique in A",
      "Unique in B",
      "Common Parts",
      "Match % (Jaccard)",
    ];

    const row = [
      bomA,
      bomB,
      listToNameString(finalUniqueA),
      listToNameString(finalUniqueB),
      listToNameString(common),
      jaccardPercent != null ? `${jaccardPercent}` : "",
    ];

    const csvContent =
      headers.map(csvEscape).join(",") +
      "\n" +
      row.map(csvEscape).join(",") +
      "\n";

    const blob = new Blob([csvContent], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = url;
    link.download = `bom_compare_${bomA}_${bomB}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <Row style={{ marginBottom: 12, alignItems: "center" }}>
        <Col flex="auto">
          <Title level={4} style={{ margin: 0 }}>
            Detailed BOM Comparison
          </Title>
          <Text type="secondary">
            Comparison shows quantities (common = min(qA,qB); unique = remaining
            qty)
          </Text>
        </Col>
        <Col>
          <Button onClick={handleExportCsv} type="primary" style={{ marginRight: 8 }}>
            Export CSV
          </Button>
          <Button onClick={() => navigate(-1)}>Back</Button>
        </Col>
      </Row>

      <Card style={{ marginBottom: 16 }}>
        <Row align="middle">
          <Col xs={24} sm={8}>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <Text strong>BOM A</Text>
              <Tag color="blue" style={{ fontSize: 14, padding: "6px 10px" }}>
                {bomA}
              </Tag>
            </div>
          </Col>

          <Col xs={24} sm={8} style={{ textAlign: "center" }}>
            <div>
              <Text strong>Summary</Text>
              <div style={{ marginTop: 8 }}>
                <div>
                  <Text>Unique A: </Text>
                  <Text strong>{counts.uniqueCountA || finalUniqueA.length}</Text>
                </div>
                <div>
                  <Text>Common: </Text>
                  <Text strong>{counts.commonCount || common.length}</Text>
                </div>
                <div>
                  <Text>Unique B: </Text>
                  <Text strong>{counts.uniqueCountB || finalUniqueB.length}</Text>
                </div>
                <div style={{ marginTop: 6 }}>
                  <Text type="secondary">Jaccard: </Text>
                  <Text strong>{jaccardPercent}%</Text>
                </div>
              </div>
            </div>
          </Col>

          <Col xs={24} sm={8}>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <Text strong>BOM B</Text>
              <Tag color="green" style={{ fontSize: 14, padding: "6px 10px" }}>
                {bomB}
              </Tag>
            </div>
          </Col>
        </Row>
      </Card>

      <Row gutter={16}>
        <Col xs={24} md={8}>
          <Card
            title={`Unique in A (${finalUniqueA.length})`}
            size="small"
            style={{ minHeight: 260 }}
          >
            <div style={{ maxHeight: 420, overflow: "auto", paddingTop: 6 }}>
              {finalUniqueA.length === 0 ? (
                <Text type="secondary">No unique components found in A.</Text>
              ) : (
                finalUniqueA.map((u, idx) => (
                  <div key={idx}>
                    <UniqueComponentTag item={u} />
                  </div>
                ))
              )}
            </div>
          </Card>
        </Col>

        <Col xs={24} md={8}>
          <Card
            title={`Common Parts (${common.length})`}
            size="small"
            style={{ minHeight: 260 }}
          >
            <div style={{ maxHeight: 420, overflow: "auto", paddingTop: 6 }}>
              {common.length === 0 ? (
                <Text type="secondary">No common components.</Text>
              ) : (
                common.map((c, idx) => <CommonComponentTag key={idx} item={c} />)
              )}
            </div>
          </Card>
        </Col>

        <Col xs={24} md={8}>
          <Card
            title={`Unique in B (${finalUniqueB.length})`}
            size="small"
            style={{ minHeight: 260 }}
          >
            <div style={{ maxHeight: 420, overflow: "auto", paddingTop: 6 }}>
              {finalUniqueB.length === 0 ? (
                <Text type="secondary">No unique components found in B.</Text>
              ) : (
                finalUniqueB.map((u, idx) => (
                  <div key={idx}>
                    <UniqueComponentTag item={u} />
                  </div>
                ))
              )}
            </div>
          </Card>
        </Col>
      </Row>

      <Divider />
    </div>
  );
}
