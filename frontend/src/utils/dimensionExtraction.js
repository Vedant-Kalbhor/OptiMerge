const flatToRows = (flat) =>
  Object.entries(flat || {}).map(([k, v]) => ({
    id: crypto.randomUUID(),
    label: k,
    value: v
  }));

const rowsToFlat = (rows) =>
  Object.fromEntries(rows.map(r => [r.label, r.value]));

export {flatToRows, rowsToFlat}