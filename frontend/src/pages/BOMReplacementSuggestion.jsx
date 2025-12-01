// BOMReplacementSuggestion.jsx (updated to show per-variant replacement rows)
import React, { useEffect, useState } from 'react';
import { Card, Table, Button, Alert, Spin, message, Row, Col } from 'antd';
import { DownloadOutlined, ReloadOutlined } from '@ant-design/icons';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { getAnalysisResults } from '../services/api';
import { saveAs } from 'file-saver';

const BOMReplacementSuggestion = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { analysisId } = useParams();

  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState(null);
  const [groups, setGroups] = useState([]);
  const [perVariantRows, setPerVariantRows] = useState([]); // rows like: { groupId, fromId, toId, costFrom, costTo, savingAbs, savingPct, currency }
  const [overallSavings, setOverallSavings] = useState({ totalOriginal: 0, totalSavings: 0, savingsPct: 0, currency: '' });

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
   * buildGroups
   * - finds connected components where similarity === 100
   * - computes per-variant replacement rows (replace every non-cheapest in group with cheapest)
   */
  const buildGroups = (bomAnalysis) => {
    if (!bomAnalysis || !bomAnalysis.similarity_matrix) {
      setGroups([]);
      setPerVariantRows([]);
      setOverallSavings({ totalOriginal: 0, totalSavings: 0, savingsPct: 0, currency: '' });
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

    // Compute per-variant replacement rows
    const assembly_costs = bomAnalysis.assembly_costs || bomAnalysis?.assemblyCosts || {};
    const currency_map = bomAnalysis.currency_map || bomAnalysis.currencyMap || {};

    const rows = [];
    let totalOriginal = 0;
    let totalSavings = 0;
    let currency = '';

    formatted.forEach(g => {
      // gather members with costs
      const membersWithCost = g.members.map(m => ({
        id: m,
        cost: round2(Number(assembly_costs?.[m] || 0))
      }));

      // If no cost data available, set costs to 0 (no savings)
      if (membersWithCost.length === 0) return;

      // find cheapest variant in the group
      const cheapest = membersWithCost.reduce((best, cur) => (cur.cost < best.cost ? cur : best), membersWithCost[0]);
      currency = currency_map[g.members[0]] || currency || '';

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

    // Add overall summary as the last row (similar to excel bottom row)
    rows.push([]);
    rows.push(['Total Savings in percentage', '', '', '', '', '', (overallSavings.savingsPct || 0).toFixed(4) + '%', overallSavings.currency || '']);

    const csv = [header, ...rows].map(r => (r.length ? r.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',') : '')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    saveAs(blob, `bom-replacement-rows-${new Date().toISOString().slice(0,19).replace(/[:T]/g,'-')}.csv`);
    message.success('CSV exported');
  };

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

          {/* <Button
            icon={<ReloadOutlined />}
            onClick={() => {
              if (analysisId) loadAnalysis(analysisId);
              else if (analysis && analysis.bom_analysis) buildGroups(analysis.bom_analysis);
              else message.info('No analysis to refresh');
            }}
          >
            Refresh
          </Button> */}

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

            <Card title="Per-variant replacement savings" style={{ marginBottom: 12 }}>
              <Table
                columns={columns}
                dataSource={perVariantRows}
                pagination={false}
                rowKey={(r) => `${r.groupId}-${r.fromId}-${r.toId}`}
                size="small"
              />

              <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 12, color: '#6b7280' }}>Total original cost (considered)</div>
                  <div style={{ fontSize: 18, fontWeight: 700 }}>{overallSavings.currency}{(overallSavings.totalOriginal || 0).toFixed(2)}</div>
                </div>

                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 12, color: '#6b7280' }}>Total savings (abs)</div>
                  <div style={{ fontSize: 18, fontWeight: 700 }}>{overallSavings.currency}{(overallSavings.totalSavings || 0).toFixed(2)}</div>
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
