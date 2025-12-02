// BOMReplacementSuggestion.jsx
// Full updated component with:
// - Dashboard (Total BOMs, Similar, Unique, Replaced, After Replacement, Savings)
// - Accordion-style Similar Assembly Groups and Per-variant replacement savings
// - Currency code -> symbol mapping (GBP -> £)
// - Price of each variant appended in brackets after the assembly ID everywhere it appears
// - Minimal, non-breaking changes to existing logic; assembly costs are read from analysis.bom_analysis.assembly_costs

import React, { useEffect, useState } from 'react';
import { Card, Table, Button, Alert, Spin, message, Collapse, Typography } from 'antd';
import { DownloadOutlined } from '@ant-design/icons';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { getAnalysisResults } from '../services/api';
import { saveAs } from 'file-saver';

const { Panel } = Collapse;
const { Text, Title } = Typography;

const BOMReplacementSuggestion = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { analysisId } = useParams();

  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState(null);
  const [groups, setGroups] = useState([]);
  const [perVariantRows, setPerVariantRows] = useState([]); // rows: { groupId, fromId, toId, costFrom, costTo, savingAbs, savingPct, currency }
  const [overallSavings, setOverallSavings] = useState({ totalOriginal: 0, totalSavings: 0, savingsPct: 0, currency: '' });
  const [assemblyCosts, setAssemblyCosts] = useState({}); // mapping assemblyId -> cost

  useEffect(() => {
    const fromState = location.state?.analysisResults || location.state?.suggestions || location.state?.bomAnalysis;
    if (fromState && fromState.bom_analysis) {
      setAnalysis(fromState);
      buildGroups(fromState.bom_analysis);
    } else if (location.state && location.state.similarity_matrix) {
      setAnalysis({ bom_analysis: location.state });
      buildGroups(location.state);
    } else if (analysisId) {
      loadAnalysis(analysisId);
    } else {
      if (location.state?.analysis) {
        setAnalysis(location.state.analysis);
        buildGroups(location.state.analysis.bom_analysis || location.state.analysis);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analysisId, location.state]);

  const loadAnalysis = async (id) => {
    try {
      setLoading(true);
      const resp = await getAnalysisResults(id);
      setAnalysis(resp.data);
      const bomAnalysis = resp.data.bom_analysis || resp.data;
      buildGroups(bomAnalysis);
    } catch (err) {
      console.error('Failed to load analysis:', err);
      message.error('Unable to load analysis results');
    } finally {
      setLoading(false);
    }
  };

  const round2 = (v) => Math.round((Number(v) || 0) * 100) / 100;
  const round4 = (v) => Math.round((Number(v) || 0) * 10000) / 10000;

  /**
   * currencySymbol
   * convert common currency codes to symbols; fallback to code string if unknown
   */
  const currencySymbol = (curr) => {
    if (!curr) return '';
    const map = {
      GBP: '£',
      gbp: '£',
      USD: '$',
      usd: '$',
      EUR: '€',
      eur: '€',
      INR: '₹',
      inr: '₹',
    };
    return map[curr] || curr;
  };

  const fmtMoney = (val, currCode) => {
    const sym = currencySymbol(currCode || overallSavings.currency || '');
    const v = Number(val || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return `${sym}${v}`;
  };

  /**
   * getAssemblyCostLabel
   * returns "ASSEMBLY_ID (£123.45)" using assemblyCosts state and currency
   */
  const getAssemblyCostLabel = (id, currencyCode) => {
    const cost = Number(assemblyCosts?.[id] || 0);
    const sym = currencySymbol(currencyCode || overallSavings.currency || '');
    return `${id} (${sym}${cost.toFixed(2)})`;
  };

  /**
   * buildGroups
   * - finds connected components where similarity === 100
   * - computes per-variant replacement rows (replace every non-cheapest in group with cheapest)
   */
  const buildGroups = (bomAnalysis) => {
    if (!bomAnalysis || !bomAnalysis.similarity_matrix) {
      setGroups([]);
      setPerVariantRows([]);
      setOverallSavings({ totalOriginal: 0, totalSavings: 0, savingsPct: 0, currency: '' });
      setAssemblyCosts({});
      return;
    }

    const sim = bomAnalysis.similarity_matrix;
    const nodes = Object.keys(sim);

    // Build adjacency (only edges where similarity === 100)
    const adj = {};
    nodes.forEach(n => (adj[n] = new Set()));
    nodes.forEach(a => {
      const row = sim[a] || {};
      Object.keys(row).forEach(b => {
        const val = Number(row[b]);
        if (!isNaN(val) && val === 100) {
          adj[a].add(b);
          adj[b].add(a);
        }
      });
    });

    // Find connected components (DFS)
    const visited = new Set();
    const components = [];
    nodes.forEach(n => {
      if (!visited.has(n)) {
        const stack = [n];
        const comp = [];
        while (stack.length) {
          const cur = stack.pop();
          if (visited.has(cur)) continue;
          visited.add(cur);
          comp.push(cur);
          adj[cur].forEach(nei => {
            if (!visited.has(nei)) stack.push(nei);
          });
        }
        if (comp.length > 1) components.push(comp.sort());
      }
    });

    components.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));

    const formatted = components.map((members, idx) => {
      const id = `G${String(idx + 1).padStart(3, '0')}`;
      return { key: id, groupId: id, members };
    });

    setGroups(formatted);

    // Read assembly_costs (if provided)
    const assembly_costs = bomAnalysis.assembly_costs || bomAnalysis.assemblyCosts || {};
    setAssemblyCosts(assembly_costs || {});

    const currency_map = bomAnalysis.currency_map || bomAnalysis.currencyMap || {};
    let totalOriginal = 0;
    let totalSavings = 0;
    let currency = '';

    // Compute per-variant replacement rows
    const rows = [];
    formatted.forEach(g => {
      // gather members with costs
      const membersWithCost = g.members.map(m => ({
        id: m,
        cost: round2(Number(assembly_costs?.[m] || 0))
      }));

      if (membersWithCost.length === 0) return;

      // find cheapest variant in the group
      const cheapest = membersWithCost.reduce((best, cur) => (cur.cost < best.cost ? cur : best), membersWithCost[0]);
      currency = currency_map[g.members[0]] || currency || bomAnalysis.currency || bomAnalysis.currency_code || '';

      // for every other variant create a replacement row (replace variant -> cheapest)
      membersWithCost.forEach(m => {
        if (m.id === cheapest.id) return; // nothing to replace
        const costFrom = m.cost || 0;
        const costTo = cheapest.cost || 0;
        const savingAbs = round2(costFrom - costTo);
        const savingPct = costFrom > 0 ? round4((savingAbs / costFrom) * 100) : 0;

        // Only consider positive savings (skip negative or zero)
        if (savingAbs > 0) {
          rows.push({
            groupId: g.groupId,
            fromId: m.id,
            toId: cheapest.id,
            costFrom,
            costTo,
            savingAbs,
            savingPct,
            currency
          });
          totalOriginal += Number(costFrom || 0);
          totalSavings += Number(savingAbs || 0);
        }
      });
    });

    const overallPct = totalOriginal > 0 ? round4((totalSavings / totalOriginal) * 100) : 0;

    setPerVariantRows(rows);
    setOverallSavings({ totalOriginal: round2(totalOriginal), totalSavings: round2(totalSavings), savingsPct: overallPct, currency: currency || '' });
  };

  const handleExportCSV = () => {
    if (!perVariantRows.length) {
      message.warning('No replacement rows to export');
      return;
    }

    const header = ['GroupID', 'VariantToReplace', 'ReplaceWith', 'CostOriginal', 'CostReplacement', 'SavingAbs', 'SavingPct', 'Currency'];
    const rows = perVariantRows.map(r => [
      r.groupId,
      r.fromId,
      r.toId,
      (r.costFrom || 0).toFixed(2),
      (r.costTo || 0).toFixed(2),
      (r.savingAbs || 0).toFixed(2),
      (r.savingPct || 0).toFixed(4),
      r.currency || ''
    ]);

    // Add overall summary as the last row
    rows.push([]);
    rows.push(['Total Savings in percentage', '', '', '', '', '', (overallSavings.savingsPct || 0).toFixed(4) + '%', overallSavings.currency || '']);

    const csv = [header, ...rows].map(r => (r.length ? r.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',') : '')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    saveAs(blob, `bom-replacement-rows-${new Date().toISOString().slice(0,19).replace(/[:T]/g,'-')}.csv`);
    message.success('CSV exported');
  };

  // keep columns for potential reuse, but per-variant UI below is visual (Collapse)
  const columns = [
    { title: 'Group', dataIndex: 'groupId', key: 'groupId', width: 100 },
    { title: 'Variant (to replace)', dataIndex: 'fromId', key: 'fromId', render: id => <code>{id}</code>, width: 220 },
    { title: 'Replace with', dataIndex: 'toId', key: 'toId', render: id => <code>{id}</code>, width: 220 },
    { title: 'Cost (original)', dataIndex: 'costFrom', key: 'costFrom', render: v => (overallSavings.currency || '') + (Number(v || 0).toFixed(2)) },
    { title: 'Cost (replacement)', dataIndex: 'costTo', key: 'costTo', render: v => (overallSavings.currency || '') + (Number(v || 0).toFixed(2)) },
    { title: 'Saving (abs)', dataIndex: 'savingAbs', key: 'savingAbs', render: v => (overallSavings.currency || '') + (Number(v || 0).toFixed(2)) },
    { title: 'Saving %', dataIndex: 'savingPct', key: 'savingPct', render: v => (Number(v || 0).toFixed(4) + '%') }
  ];

  return (
    <div>
      <h1>Replacement Suggestions — Exact Matches (100%)</h1>

      {/* --- Dashboard: BOM summary (with replaced BOMs) --- */}
      <Card style={{ marginBottom: 16 }}>
        {(() => {
          const totalFromStats = analysis?.bom_analysis?.bom_statistics?.total_assemblies;
          const matrixKeys = analysis?.bom_analysis?.similarity_matrix
            ? Object.keys(analysis.bom_analysis.similarity_matrix || {})
            : [];
          const totalBOMs = Number(totalFromStats || matrixKeys.length || 0);

          const similarCount = groups.reduce(
            (sum, g) => sum + (Array.isArray(g.members) ? g.members.length : 0),
            0
          );

          const uniqueBoms = Math.max(0, totalBOMs - similarCount);

          const totalReduction = groups.reduce(
            (r, g) => r + Math.max(0, g.members.length - 1),
            0
          );

          const afterReplacement = Math.max(0, totalBOMs - totalReduction);

          // New metric
          const replacedBOMs = totalBOMs - afterReplacement;

          const currencySym = currencySymbol(overallSavings.currency || '');

          return (
            <div style={{
              display: 'flex',
              gap: 24,
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap'
            }}>
              
              <div style={{ minWidth: 160 }}>
                <div style={{ color: '#6b7280', fontSize: 13 }}>Total BOMs</div>
                <div style={{ fontSize: 28, fontWeight: 700 }}>{totalBOMs}</div>
              </div>

              <div style={{ minWidth: 160 }}>
                <div style={{ color: '#6b7280', fontSize: 13 }}>Similar BOMs</div>
                <div style={{ fontSize: 28, fontWeight: 700 }}>{similarCount}</div>
              </div>

              <div style={{ minWidth: 160 }}>
                <div style={{ color: '#6b7280', fontSize: 13 }}>Unique BOMs</div>
                <div style={{ fontSize: 28, fontWeight: 700 }}>{uniqueBoms}</div>
              </div>

              <div style={{ minWidth: 180 }}>
                <div style={{ color: '#6b7280', fontSize: 13 }}>Replaced BOMs</div>
                <div style={{ fontSize: 28, fontWeight: 700 }}>{replacedBOMs}</div>
              </div>

              <div style={{ minWidth: 200 }}>
                <div style={{ color: '#6b7280', fontSize: 13 }}>BOMs After Replacement</div>
                <div style={{ fontSize: 28, fontWeight: 700 }}>{afterReplacement}</div>
              </div>

              <div style={{ marginLeft: 'auto', textAlign: 'right', minWidth: 220 }}>
                <div style={{ fontSize: 12, color: '#6b7280' }}>Total Savings (Abs)</div>
                <div style={{ fontSize: 20, fontWeight: 700 }}>
                  {fmtMoney(overallSavings.totalSavings, overallSavings.currency)}
                </div>

                <div style={{ marginTop: 8, fontSize: 12, color: '#6b7280' }}>Avg Savings %</div>
                <div style={{ fontSize: 18, fontWeight: 700 }}>
                  {(overallSavings.savingsPct || 0).toFixed(2)}%
                </div>
              </div>
            </div>
          );
        })()}
      </Card>
      {/* --- end dashboard --- */}

      <Card style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-start', alignItems: 'center' }}>
          <Button
            type="primary"
            icon={<DownloadOutlined />}
            onClick={handleExportCSV}
            disabled={perVariantRows.length === 0}
          >
            Export CSV (per-variant)
          </Button>

          <Button onClick={() => navigate(-1)}>Back</Button>
        </div>
      </Card>

      <Card>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40 }}>
            <Spin size="large" />
            <div>Loading...</div>
          </div>
        ) : groups.length === 0 ? (
          <Alert
            message="No exact-match groups found"
            description="There are no BOM assemblies that are exactly identical (100% match)."
            type="info"
            showIcon
          />
        ) : (
          <>
            {/* Small table listing groups */}
            <Table
              columns={[
                { title: 'GroupID', dataIndex: 'groupId', key: 'groupId', width: 100 },
                { title: 'Members', dataIndex: 'members', key: 'members', render: (m) => <span style={{fontFamily:'monospace'}}>{m.join(',')}</span> }
              ]}
              dataSource={groups}
              pagination={false}
              rowKey="groupId"
              size="small"
              style={{ marginBottom: 16 }}
            />

            {/* Per-variant replacement savings - visual accordion */}
            <Card title="Per-variant replacement savings" style={{ marginBottom: 12 }}>
              {groups.length === 0 ? (
                <Text type="secondary">No per-variant replacement savings to show.</Text>
              ) : (
                <Collapse accordion>
                  {groups.map((g, idx) => {
                    const members = Array.isArray(g.members) ? g.members : [];
                    // group rows for this group
                    const rowsForGroup = perVariantRows.filter(r => r.groupId === g.groupId);
                    // compute group total savings from rowsForGroup
                    const groupTotalSavings = rowsForGroup.reduce((s, r) => s + Number(r.savingAbs || 0), 0);
                    // cheapest assembly inferred from replacement target if available, else members[0]
                    const cheapest = rowsForGroup.length ? rowsForGroup[0].toId : (members[0] || 'N/A');
                    const currCode = (rowsForGroup[0] && rowsForGroup[0].currency) || overallSavings.currency || '';

                    return (
                      <Panel
                        header={
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                            <div>
                              <Text strong>Group {idx + 1}:</Text>
                              <Text style={{ marginLeft: 8 }}>{members.length} similar assemblies</Text>
                            </div>

                            <div style={{ color: '#389e0d' }}>
                              <Text>Cheapest: </Text>
                              <Text strong>{getAssemblyCostLabel(cheapest, currCode)}</Text>
                              <Text style={{ marginLeft: 12 }}>| Total Savings: {fmtMoney(groupTotalSavings, currCode)}</Text>
                            </div>
                          </div>
                        }
                        key={`pv-${g.groupId}`}
                      >
                        <div style={{ padding: '6px 8px' }}>
                          <div style={{ marginBottom: 8 }}>
                            <Text strong>Members:</Text>{' '}
                            <Text>
                              {members.map(id => getAssemblyCostLabel(id, currCode)).join(', ') || '—'}
                            </Text>
                          </div>

                          <div style={{ marginBottom: 8 }}>
                            <Text strong>Cheapest Assembly:</Text>{' '}
                            <Text>{getAssemblyCostLabel(cheapest, currCode)}</Text>
                          </div>

                          <div style={{ marginBottom: 8 }}>
                            <Text strong>Replacements:</Text>
                            <ul style={{ marginTop: 8 }}>
                              {rowsForGroup.length ? rowsForGroup.map((r, i) => (
                                <li key={`r-${i}`} style={{ marginBottom: 6 }}>
                                  <Text>
                                    {getAssemblyCostLabel(r.fromId, r.currency)} → {getAssemblyCostLabel(r.toId, r.currency)}:{' '}
                                    <Text strong>{fmtMoney(r.savingAbs, r.currency)}</Text>{' '}
                                    <Text type="secondary">({Number(r.savingPct || 0).toFixed(2)}%)</Text>
                                  </Text>
                                </li>
                              )) : (
                                // fallback: list members (except cheapest) as suggested
                                members.filter(m => m !== cheapest).map((m, i) => (
                                  <li key={`inf-${i}`} style={{ marginBottom: 6 }}>
                                    <Text>
                                      {getAssemblyCostLabel(m, currCode)} → {getAssemblyCostLabel(cheapest, currCode)}{' '}
                                      <Text type="secondary">(suggested)</Text>
                                    </Text>
                                  </li>
                                ))
                              )}
                            </ul>
                          </div>
                        </div>
                      </Panel>
                    );
                  })}
                </Collapse>
              )}

              {/* Overall summary at bottom of per-variant card */}
              <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 12, color: '#6b7280' }}>Total original cost (considered)</div>
                  <div style={{ fontSize: 18, fontWeight: 700 }}>{fmtMoney(overallSavings.totalOriginal, overallSavings.currency)}</div>
                </div>

                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 12, color: '#6b7280' }}>Total savings (abs)</div>
                  <div style={{ fontSize: 18, fontWeight: 700 }}>{fmtMoney(overallSavings.totalSavings, overallSavings.currency)}</div>
                </div>

                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 12, color: '#6b7280' }}>Total Savings %</div>
                  <div style={{ fontSize: 20, fontWeight: 700 }}>{(overallSavings.savingsPct || 0).toFixed(4)}%</div>
                </div>
              </div>
            </Card>
          </>
        )}
      </Card>
    </div>
  );
};

export default BOMReplacementSuggestion;
