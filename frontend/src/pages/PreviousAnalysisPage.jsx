import React, { useEffect, useState , useMemo} from 'react';
import {
  Card,
  Table,
  Tag,
  Progress,
  Row,
  Col,
  Alert,
  Button,
  Spin,
  Modal,
  message,
  Statistic
} from 'antd';
import {
  DownloadOutlined,
  EyeOutlined,
  ClusterOutlined,
  BarChartOutlined
} from '@ant-design/icons';
import { saveAs } from 'file-saver';
import ClusterChart from '../components/ClusterChart';
import { getAnalysisResults } from '../services/api';
import { useParams, useNavigate } from 'react-router-dom';
import { useLocation } from 'react-router-dom';
import { Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js/auto';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

/**
 * PreviousAnalysisPage
 * - Loads saved analysis by ID (from backend /analysis/:id)
 * - Detects analysis type (clustering, bom_analysis, weldment_pairwise)
 * - Renders matching UI (clusters + viz + BOM table OR weldment pairwise table)
 */

const PreviousAnalysisPage = () => {
  const { analysisId } = useParams();
  const navigate = useNavigate();

  const [doc, setDoc] = useState(null);
  const [raw, setRaw] = useState(null);
  const [loading, setLoading] = useState(true);
  const [clusterModalVisible, setClusterModalVisible] = useState(false);
  const [selectedCluster, setSelectedCluster] = useState(null);

  useEffect(() => {
    if (analysisId) loadPastAnalysis();
    else setLoading(false);
    // eslint-disable-next-line
  }, [analysisId]);

  const loadPastAnalysis = async () => {
    try {
      setLoading(true);
      const res = await getAnalysisResults(analysisId);
      const doc = res.data;
      setDoc(doc);
      // backend stores payload under doc.raw; if not present, assume doc is already raw
      const rawPayload = doc?.raw ? doc.raw : doc;
      setRaw(rawPayload);
    } catch (err) {
      console.error('Could not load previous analysis', err);
      message.error('Could not load previous analysis');
    } finally {
      setLoading(false);
    }
  };

  // ----------------- helpers -----------------
  const normalizeClusters = (clustersRaw) => {
    if (!clustersRaw || !Array.isArray(clustersRaw)) return [];
    if (clustersRaw.length === 0) return [];
    // array-of-objects
    if (typeof clustersRaw[0] === 'object' && !Array.isArray(clustersRaw[0])) {
      return clustersRaw.map((c, i) => ({
        cluster_id: c.cluster_id ?? (i + 1),
        members: c.members ?? c.member_list ?? [],
        member_count: c.member_count ?? (c.members ? c.members.length : 0),
        representative: c.representative ?? (c.members && c.members[0]) ?? '-',
        reduction_potential: c.reduction_potential ?? 0
      }));
    }
    // array-of-arrays
    if (Array.isArray(clustersRaw[0])) {
      return clustersRaw.map((members, i) => ({
        cluster_id: i + 1,
        members,
        member_count: members.length,
        representative: members[0] || '-',
        reduction_potential: 0
      }));
    }
    return [];
  };

  const calculateStatistics = (rawPayload) => {
    if (!rawPayload) return { totalClusters: 0, similarPairs: 0, reductionPotential: 0 };
    const clustersRaw = rawPayload?.clustering?.clusters || [];
    const clusters = normalizeClusters(clustersRaw);
    const totalClusters = rawPayload?.clustering?.metrics?.n_clusters ?? clusters.length;
    const similarPairs = rawPayload?.bom_analysis?.similar_pairs?.length ?? 0;
    let reductionPotential = 0;
    if (clusters.length > 0) {
      const totalReduction = clusters.reduce((sum, c) => sum + (c.reduction_potential || 0), 0);
      reductionPotential = Math.round((totalReduction / clusters.length) * 100);
    }
    return { totalClusters, similarPairs, reductionPotential };
  };

  const prepareVisualizationConfig = (rawPayload) => {
    const vizData = rawPayload?.clustering?.visualization_data ?? [];
    const numericColumns = rawPayload?.clustering?.numeric_columns ?? [];
    if (vizData.length > 0 && 'PC1' in vizData[0] && 'PC2' in vizData[0]) {
      return { data: vizData, xKey: 'PC1', yKey: 'PC2' };
    }
    if (vizData.length > 0 && numericColumns.length >= 2) {
      return { data: vizData, xKey: numericColumns[0], yKey: numericColumns[1] };
    }
    return { data: [], xKey: '', yKey: '' };
  };

  // ---------- Weldment pairwise helpers ----------
  const handleExportWeldmentCSV = (weld) => {
    try {
      const rows = weld?.pairwise_table || [];
      if (!rows.length) {
        message.warning('No weldment pairwise data to export');
        return;
      }

      const hasCostSavings =
        !!weld &&
        !!weld.cost_savings &&
        weld.cost_savings.has_cost_data &&
        Array.isArray(weld.cost_savings.rows) &&
        weld.cost_savings.rows.length > 0;

      // If cost savings present, export enriched CSV (same structure as WeldmentResultsPage)
      if (hasCostSavings) {
        const savingsRows = weld.cost_savings.rows || [];
        const header = [
          'Assembly A',
          'Assembly B',
          'Match %',
          // 'Matching Letters',
          'Matching Columns',
          // 'Unmatching Letters',
          'Cost A',
          'EAU A',
          'Cost B',
          'EAU B',
          'Old Price',
          'New Price',
          'Old-New Price',
          'Effective EAU',
          'Recommended Assembly',
          'Recommended Cost',
          'Total Cost Before',
          'Total Cost After',
          'Cost Savings',
          'Savings %'
        ];

        const keyFn = (a, b) => `${a}__${b}`;
        const costMap = {};
        savingsRows.forEach((r) => {
          const k1 = keyFn(r.bom_a, r.bom_b);
          const k2 = keyFn(r.bom_b, r.bom_a);
          costMap[k1] = r;
          costMap[k2] = r;
        });

        const csvRows = [
          header.join(','),
          ...rows.map((r) => {
            const pairKey = keyFn(r.bom_a, r.bom_b);
            const c = costMap[pairKey] || {};
            return [
              `"${(r.bom_a || '').replace(/"/g, '""')}"`,
              `"${(r.bom_b || '').replace(/"/g, '""')}"`,
              `${r.match_percentage ?? 0}`,
              // `"${(r.matching_columns_letters || '').replace(/"/g, '""')}"`,
              `"${(r.matching_columns || []).join('; ').replace(/"/g, '""')}"`,
              // `"${(r.unmatching_columns_letters || '').replace(/"/g, '""')}"`,
              c.cost_a ?? '',
              c.eau_a ?? '',
              c.cost_b ?? '',
              c.eau_b ?? '',
              c.old_price ?? '',
              c.new_price ?? '',
              c.old_new_price ?? '',
              c.effective_eau ?? '',
              c.recommended_assembly
                ? `"${String(c.recommended_assembly).replace(/"/g, '""')}"`
                : '',
              c.recommended_cost ?? '',
              c.total_cost_before ?? '',
              c.total_cost_after ?? '',
              c.cost_savings ?? '',
              c.savings_percent ?? ''
            ].join(',');
          })
        ].join('\n');

        const blob = new Blob([csvRows], { type: 'text/csv;charset=utf-8;' });
        saveAs(blob, `weldment-pairwise-cost-${analysisId || 'latest'}.csv`);
        message.success('Exported CSV with cost savings');
        return;
      }

      // Legacy export (no cost data) – original behavior
      const header = [
        'Assembly A',
        'Assembly B',
        'Match %',
        'Matching Letters',
        'Matching Columns',
        'Unmatching Letters'
      ];
      const csvRows = [
        header.join(','),
        ...rows.map((r) =>
          [
            `"${(r.bom_a || '').replace(/"/g, '""')}"`,
            `"${(r.bom_b || '').replace(/"/g, '""')}"`,
            `${r.match_percentage || 0}`,
            `"${(r.matching_columns_letters || '').replace(/"/g, '""')}"`,
            `"${(r.matching_columns || []).join('; ').replace(/"/g, '""')}"`,
            `"${(r.unmatching_columns_letters || '').replace(/"/g, '""')}"`,
          ].join(',')
        )
      ].join('\n');

      const blob = new Blob([csvRows], { type: 'text/csv;charset=utf-8;' });
      saveAs(blob, `weldment-pairwise-${analysisId || 'latest'}.csv`);
      message.success('Exported CSV');
    } catch (err) {
      console.error(err);
      message.error('Export failed');
    }
  };
// --- BOM helpers (paste near other helpers) ---
const handleExportSimilarPairs = (bomResultsLocal) => {
  try {
    const pairs = bomResultsLocal?.similar_pairs || [];
    if (pairs.length === 0) {
      message.warning('No BOM similarity data to export');
      return;
    }

    const csvContent = [
      ['BOM A', 'BOM B', 'Similarity Score', 'Common Components Count'],
      ...pairs.map(p => [
        p.bom_a,
        p.bom_b,
        (p.similarity_score * 100).toFixed(1) + '%',
        Array.isArray(p.common_components) ? p.common_components.length : (p.common_components ? 1 : 0)
      ])
    ].map(row => row.join(',')).join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    saveAs(blob, `bom-similarity-${analysisId || 'latest'}.csv`);
    message.success('BOM similarity exported successfully');
  } catch (error) {
    console.error(error);
    message.error('Failed to export BOM similarity');
  }
};

  // ----------------- column defs -----------------
  const clusterColumns = [
    { title: 'Cluster ID', dataIndex: 'cluster_id', key: 'cluster_id' },
    { title: 'Member Count', dataIndex: 'member_count', key: 'member_count' },
    {
      title: 'Representative',
      dataIndex: 'representative',
      key: 'representative',
      render: (r) => <Tag color="blue">{r}</Tag>
    },
    {
      title: 'Reduction Potential',
      dataIndex: 'reduction_potential',
      key: 'reduction_potential',
      render: (p) => <Progress percent={Math.round((p || 0) * 100)} size="small" />
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_, rec) => (
        <Button
          type="link"
          icon={<EyeOutlined />}
          onClick={() => {
            setSelectedCluster(rec);
            setClusterModalVisible(true);
          }}
        >
          View
        </Button>
      )
    }
  ];

  const similarityColumns = [
  {
    title: 'BOM A',
    dataIndex: 'bom_a',
    key: 'bom_a',
    width: 120,
  },
  {
    title: 'BOM B',
    dataIndex: 'bom_b',
    key: 'bom_b',
    width: 120,
  },
  {
    title: 'Similarity Score',
    dataIndex: 'similarity_score',
    key: 'similarity_score',
    width: 150,
    render: (score) => (
      <Progress
        percent={Math.round((score || 0) * 100)}
        size="small"
        status={(score || 0) > 0.9 ? 'success' : (score || 0) > 0.5 ? 'active' : 'exception'}
      />
    ),
  },
  {
    title: 'Common Components',
    dataIndex: 'common_components',
    key: 'common_components',
    render: (components, record) => {
      let componentList = [];

      if (Array.isArray(components)) {
        componentList = components;
      } else if (typeof components === 'string') {
        componentList = components.split(/\s+/).filter(Boolean);
      } else if (!components && record && record.common_components) {
        componentList = record.common_components;
      }

      return (
        <div style={{ maxWidth: '500px', maxHeight: '150px', overflow: 'auto' }}>
          <div style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '6px',
            padding: '6px',
            border: '1px solid #f0f0f0',
            borderRadius: '4px',
            backgroundColor: '#fafafa'
          }}>
            {componentList.map((c, i) => {
              // `c` may be string or object { component, qty_a, qty_b, common_qty }
              if (typeof c === 'object' && c !== null) {
                const name = c.component || 'unknown';
                const qa = c.qty_a != null ? c.qty_a : '-';
                const qb = c.qty_b != null ? c.qty_b : '-';
                const common = c.common_qty != null ? c.common_qty : null;
                return (
                  <div key={i} style={{
                    padding: '4px 8px',
                    backgroundColor: '#fff',
                    border: '1px solid #e9e9e9',
                    borderRadius: '6px',
                    fontSize: '12px',
                    whiteSpace: 'nowrap',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'flex-start'
                  }}>
                    <div style={{ fontFamily: 'monospace', fontWeight: 600 }}>{name}</div>
                    <div style={{ fontSize: 11, color: '#666', marginTop: 4 }}>
                      <span style={{ marginRight: 8 }}>A:{qa}</span>
                      <span>B:{qb}</span>
                      {common !== null && <Tag style={{ marginLeft: 6 }} color="green">{common}</Tag>}
                    </div>
                  </div>
                );
              }

              return (
                <div key={i} style={{
                  padding: '2px 6px',
                  backgroundColor: '#e6f7ff',
                  border: '1px solid #91d5ff',
                  borderRadius: '12px',
                  fontSize: '11px',
                  fontFamily: 'monospace',
                  fontWeight: '500',
                  color: '#0050b3',
                  whiteSpace: 'nowrap'
                }}>
                  {String(c)}
                </div>
              );
            })}
          </div>
          {componentList.length > 0 && (
            <div style={{ fontSize: '11px', color: '#666', marginTop: '6px' }}>
              {componentList.length} common component{componentList.length > 1 ? 's' : ''}
            </div>
          )}
        </div>
      );
    }
  },
  {
    title: 'Details',
    key: 'details',
    width: 120,
    render: (record) => (
      <Button
        size="small"
        style={{
          borderRadius: '6px',
          padding: '0 10px',
          fontSize: '12px',
          background: '#f0f7ff',
          border: '1px solid #91caff',
          color: '#1677ff',
          boxShadow: 'none'
        }}
        onClick={() =>
          navigate(
            `/results/bom/compare/${encodeURIComponent(record.bom_a)}/${encodeURIComponent(record.bom_b)}`,
            { state: { pair: record } }
          )
        }
      >
        View Details
      </Button>
    )
  },
];


  const weldmentColumns = [
    {
      title: 'Assembly A',
      dataIndex: 'bom_a',
      key: 'bom_a',
      render: (t) => <span style={{ fontFamily: 'monospace' }}>{t}</span>
    },
    {
      title: 'Assembly B',
      dataIndex: 'bom_b',
      key: 'bom_b',
      render: (t) => <span style={{ fontFamily: 'monospace' }}>{t}</span>
    },
    {
      title: 'Match %',
      dataIndex: 'match_percentage',
      key: 'match_percentage',
      render: (val) => {
        // value in DB is already percent (e.g. 100, 90). Progress expects 0-100.
        const pct = Number(val) || 0;
        return (
          <Progress
            percent={Math.round(pct)}
            size="small"
            format={(p) => `${p.toFixed(1)}%`}
          />
        );
      }
    },
    // { title: 'Matching (letters)', dataIndex: 'matching_columns_letters', key: 'matching_columns_letters', render: v => <div style={{ fontFamily: 'monospace' }}>{v}</div> },
    {
      title: 'Matching (columns)',
      dataIndex: 'matching_columns',
      key: 'matching_columns',
      render: (arr) =>
        Array.isArray(arr) ? arr.map((c, i) => <Tag key={i}>{c}</Tag>) : null
    }
  ];
// If location.state carries a bom_analysis (like BOMResultsPage), prefer that
const location = useLocation();

const bomResultsLocal = raw?.bom_analysis || (doc?.bom_analysis) || (location.state?.analysisResults?.bom_analysis) || null;

// duplicate no-arg handleExportSimilarPairs removed — use the earlier defined function
// const handleExportSimilarPairs(bomResultsLocal) { ... } is defined above and should be used here

const histogram = useMemo(() => {
  const buckets = {
    '100%': 0,
    '90-99%': 0,
    '80-89%': 0,
    '70-79%': 0,
    '60-69%': 0,
    '50-59%': 0,
    '<50%': 0,
  };

  const pairs = bomResultsLocal?.similar_pairs || [];

  pairs.forEach(p => {
    const score = (typeof p.similarity_score === 'number') ? p.similarity_score * 100 : 0;
    if (score >= 100) buckets['100%'] += 1;
    else if (score >= 90) buckets['90-99%'] += 1;
    else if (score >= 80) buckets['80-89%'] += 1;
    else if (score >= 70) buckets['70-79%'] += 1;
    else if (score >= 60) buckets['60-69%'] += 1;
    else if (score >= 50) buckets['50-59%'] += 1;
    else buckets['<50%'] += 1;
  });

  const labels = Object.keys(buckets);
  const data = labels.map(l => buckets[l]);

  return { labels, data };
}, [bomResultsLocal]);

const chartData = {
  labels: histogram.labels,
  datasets: [
    {
      label: 'Number of BOM pairs',
      data: histogram.data,
      borderWidth: 1,
      backgroundColor: histogram.data.map((_, i) => {
        const palette = ['#d9f7be', '#b7eb8f', '#ffe58f', '#ffd6e7', '#ffd8bf', '#91d5ff', '#bae637'];
        const idx = Math.min(palette.length - 1, i);
        return palette[palette.length - 1 - idx];
      }),
    }
  ],
};

const chartOptions = {
  indexAxis: 'y',
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: false },
    title: {
      display: true,
      text: 'BOM Pair Similarity Distribution',
      font: { size: 14 }
    },
    tooltip: {
      callbacks: {
        label: function(context) {
          const value = context.raw || 0;
          return `${value} pair${value !== 1 ? 's' : ''}`;
        }
      }
    }
  },
  scales: {
    x: { ticks: { precision: 0 }, title: { display: true, text: 'Number of BOM pairs' } },
    y: { title: { display: false } }
  }
};



  // ----------------- render -----------------
  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 60 }}>
        <Spin size="large" />
        <p>Loading saved analysis...</p>
      </div>
    );
  }

  if (!raw) {
    return (
      <div style={{ padding: 24 }}>
        <Alert
          message="Analysis not found"
          description="We couldn't find that saved analysis. Make sure the ID is correct."
          type="error"
          showIcon
        />
      </div>
    );
  }

 // Replace your current `analysisType` computation with this:
// Replace your current `analysisType` computation with this:
const analysisType =
  raw?.type ||
  doc?.type ||
  (raw?.clustering ? 'clustering'
    : raw?.weldment_pairwise ? 'weldment_pairwise'
    : raw?.bom_analysis ? 'bom_analysis'
    : 'unknown');



  const stats = calculateStatistics(raw);
  const vizConfig = prepareVisualizationConfig(raw);

  // If this is BOM analysis, render BOM-only view and exit early
if (analysisType === 'bom_analysis') {
  const bom = bomResultsLocal;
  return (
    <div style={{ padding: 20 }}>
      <h2>Previous Analysis Result</h2>

      <Row gutter={16} style={{ marginBottom: 18 }}>
        <Col span={8}><Card><div style={{ fontSize: 18 }}>Similar BOM Pairs: {bom?.similar_pairs?.length || 0}</div></Card></Col>
        <Col span={8}><Card><div style={{ fontSize: 18 }}>Reduction Potential: {Math.round((bom?.bom_statistics?.reduction_potential || 0))}%</div></Card></Col>
        <Col span={8}><Card><div style={{ fontSize: 18 }}>Total Assemblies: {bom?.bom_statistics?.total_assemblies || '-'}</div></Card></Col>
      </Row>

      <Card style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 'bold', color: '#1890ff' }}>{bom?.similar_pairs?.length || 0}</div>
            <div style={{ color: '#666' }}>Similar BOM Pairs</div>
          </div>

          <div>
            <Button icon={<DownloadOutlined />} style={{ marginRight: 8 }} onClick={handleExportSimilarPairs}>Export Similar Pairs</Button>
          </div>
        </div>
      </Card>

      <Card style={{ marginBottom: 20, background: '#f6ffed', borderColor: '#b7eb8f' }}>
        <Button
          type="primary"
          size="large"
          style={{
            background: '#389e0d',
            borderColor: '#237804',
            borderRadius: '6px',
            fontWeight: '500'
          }}
          onClick={() =>
            navigate('/results/bom/replacements', {
              state: {
                analysisResults: { bom_analysis: bom },
                analysisId: analysisId
              }
            })
          }
        >
          View Replacement Suggestions
        </Button>
      </Card>

      <Card style={{ marginBottom: 20 }}>
        <div style={{ height: 320 }}>
          <Bar data={chartData} options={chartOptions} />
        </div>
      </Card>

      <Card title="BOM Similarity Analysis" style={{ marginTop: 10 }}>
        <Table
          columns={similarityColumns}
          dataSource={(bom?.similar_pairs || []).filter(pair => pair.similarity_score >= (bom?.threshold || 0))}
          pagination={false}
          rowKey={(record) => `${record.bom_a}-${record.bom_b}`}
        />
      </Card>
    </div>
  );
}


  // If this is weldment pairwise, render weldment UI
  if (analysisType === 'weldment_pairwise' || raw.weldment_pairwise) {
    const weld = raw.weldment_pairwise || raw.weldment_pairwise_result || raw;

    const hasCostSavings =
      !!weld &&
      !!weld.cost_savings &&
      weld.cost_savings.has_cost_data &&
      Array.isArray(weld.cost_savings.rows) &&
      weld.cost_savings.rows.length > 0;

    const costColumns = hasCostSavings
      ? [
          {
            title: 'Assembly A',
            dataIndex: 'bom_a',
            key: 'bom_a',
            render: (t) => <span style={{ fontFamily: 'monospace' }}>{t}</span>
          },
          {
            title: 'Assembly B',
            dataIndex: 'bom_b',
            key: 'bom_b',
            render: (t) => <span style={{ fontFamily: 'monospace' }}>{t}</span>
          },
          {
            title: 'Match %',
            dataIndex: 'match_percentage',
            key: 'match_percentage',
            render: (val) => {
              const pct = Number(val) || 0;
              return <span style={{ color: '#52c41a' }}>{pct.toFixed(1)}%</span>;
            }
          },
          {
            title: 'Cost A',
            dataIndex: 'cost_a',
            key: 'cost_a',
            render: (v) => (v != null ? Number(v).toLocaleString() : '-')
          },
          {
            title: 'EAU A',
            dataIndex: 'eau_a',
            key: 'eau_a',
            render: (v) => (v != null ? Number(v).toLocaleString() : '-')
          },
          {
            title: 'Cost B',
            dataIndex: 'cost_b',
            key: 'cost_b',
            render: (v) => (v != null ? Number(v).toLocaleString() : '-')
          },
          {
            title: 'EAU B',
            dataIndex: 'eau_b',
            key: 'eau_b',
            render: (v) => (v != null ? Number(v).toLocaleString() : '-')
          },
          {
            title: 'Old-New Price',
            dataIndex: 'old_new_price',
            key: 'old_new_price',
            render: (v) =>
              v != null
                ? Number(v).toLocaleString(undefined, {
                    maximumFractionDigits: 2
                  })
                : '-'
          },
          {
            title: 'EAU (Replaced)',
            dataIndex: 'effective_eau',
            key: 'effective_eau',
            render: (v) => (v != null ? Number(v).toLocaleString() : '-')
          },
          {
            title: 'Recommended Assembly',
            dataIndex: 'recommended_assembly',
            key: 'recommended_assembly',
            render: (t) => <span style={{ fontFamily: 'monospace' }}>{t}</span>
          },
          {
            title: 'Total Cost Before',
            dataIndex: 'total_cost_before',
            key: 'total_cost_before',
            render: (v) =>
              v != null
                ? Number(v).toLocaleString(undefined, {
                    maximumFractionDigits: 2
                  })
                : '-'
          },
          {
            title: 'Total Cost After',
            dataIndex: 'total_cost_after',
            key: 'total_cost_after',
            render: (v) =>
              v != null
                ? Number(v).toLocaleString(undefined, {
                    maximumFractionDigits: 2
                  })
                : '-'
          },
          {
            title: 'Cost Savings',
            dataIndex: 'cost_savings',
            key: 'cost_savings',
            render: (v) =>
              v != null
                ? Number(v).toLocaleString(undefined, {
                    maximumFractionDigits: 2
                  })
                : '-'
          },
          {
            title: 'Savings %',
            dataIndex: 'savings_percent',
            key: 'savings_percent',
            render: (v) => (v != null ? `${Number(v).toFixed(2)}%` : '-')
          }
        ]
      : [];

    // Advanced layout when cost/EAU info is present (mirrors WeldmentResultsPage)
    if (hasCostSavings) {
      const statsBlock = weld.cost_savings.statistics || {};
      const totalPairs = weld.pairwise_table?.length || 0;
      const totalPerfect = statsBlock.pair_count_100 || 0;
      const totalSavings = statsBlock.total_cost_savings || 0;
      const avgSavingsPercent = statsBlock.avg_savings_percent || 0;

      return (
        <div style={{ padding: 20 }}>
          <h2>Previous Analysis Result (Weldment Pairwise)</h2>

          {/* original top metrics row (unchanged) */}
          <Row gutter={16} style={{ marginBottom: 18 }}>
            <Col span={8}>
              <Card>
                <div style={{ fontSize: 18 }}>
                  <ClusterOutlined style={{ marginRight: 6 }} />
                  Pairs: {weld?.pairwise_table?.length || 0}
                </div>
              </Card>
            </Col>
            <Col span={8}>
              <Card>
                <div style={{ fontSize: 18 }}>
                  <BarChartOutlined style={{ marginRight: 6 }} />
                  Threshold: {weld?.parameters?.threshold_percent ?? '-'}
                </div>
              </Card>
            </Col>
            <Col span={8}>
              <Card>
                <div style={{ fontSize: 18 }}>
                  Pair Count: {weld?.statistics?.pair_count ?? (weld?.pairwise_table?.length || 0)}
                </div>
              </Card>
            </Col>
          </Row>

          {/* NEW summary stats for savings */}
          <Card style={{ marginBottom: 20 }}>
            <Row gutter={16} align="middle">
              <Col xs={24} sm={12} md={6}>
                <Statistic title="Pairs Above Threshold" value={totalPairs} />
              </Col>
              <Col xs={24} sm={12} md={6}>
                <Statistic title="100% Matching Pairs" value={totalPerfect} />
              </Col>
              <Col xs={24} sm={12} md={6}>
                <Statistic
                  title="Total Savings (All Replacements)"
                  value={totalSavings}
                  precision={2}
                />
              </Col>
              <Col xs={24} sm={12} md={6}>
                <Statistic
                  title="Avg Savings %"
                  value={avgSavingsPercent}
                  precision={2}
                  suffix="%"
                />
              </Col>
            </Row>

            <div style={{ marginTop: 16, textAlign: 'right' }}>
              <Button
                icon={<DownloadOutlined />}
                onClick={() => handleExportWeldmentCSV(weld)}
              >
                Export CSV (with cost)
              </Button>
            </div>
          </Card>

          <Card
            title="Pairwise Dimension Comparison"
            style={{ marginBottom: 20 }}
          >
            <Table
              columns={weldmentColumns}
              dataSource={weld?.pairwise_table || []}
              pagination={false}
              rowKey={(r, i) => `${r.bom_a || 'a'}-${r.bom_b || 'b'}-${i}`}
            />
          </Card>

          <Card title="Cost & EAU Savings for 100% Matches">
            <Table
              columns={costColumns}
              dataSource={weld.cost_savings.rows || []}
              pagination={false}
              rowKey={(r, i) => `cost-${r.bom_a || 'a'}-${r.bom_b || 'b'}-${i}`}
            />
          </Card>
        </div>
      );
    }

    // Legacy layout (no cost/EAU columns) – original behavior
    return (
      <div style={{ padding: 20 }}>
        <h2>Previous Analysis Result (Weldment Pairwise)</h2>

        <Row gutter={16} style={{ marginBottom: 18 }}>
          <Col span={8}>
            <Card>
              <div style={{ fontSize: 18 }}>
                <ClusterOutlined style={{ marginRight: 6 }} />
                Pairs: {weld?.pairwise_table?.length || 0}
              </div>
            </Card>
          </Col>
          <Col span={8}>
            <Card>
              <div style={{ fontSize: 18 }}>
                <BarChartOutlined style={{ marginRight: 6 }} />
                Threshold: {weld?.parameters?.threshold_percent ?? '-'}
              </div>
            </Card>
          </Col>
          <Col span={8}>
            <Card>
              <div style={{ fontSize: 18 }}>
                Pair Count: {weld?.statistics?.pair_count ?? (weld?.pairwise_table?.length || 0)}
              </div>
            </Card>
          </Col>
        </Row>

        <Card style={{ marginBottom: 20 }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}
          >
            <div>
              <div
                style={{
                  fontSize: 22,
                  fontWeight: 'bold',
                  color: '#1890ff'
                }}
              >
                {weld?.pairwise_table?.length || 0} pairs
              </div>
              <div style={{ color: '#666' }}>Pairs above threshold</div>
            </div>

            <div>
              <Button
                icon={<DownloadOutlined />}
                style={{ marginRight: 8 }}
                onClick={() => handleExportWeldmentCSV(weld)}
              >
                Export CSV
              </Button>
            </div>
          </div>
        </Card>

        <Card title="Weldment One-to-One Comparison">
          <Table
            columns={weldmentColumns}
            dataSource={weld?.pairwise_table || []}
            pagination={false}
            rowKey={(r, i) => `${r.bom_a || 'a'}-${r.bom_b || 'b'}-${i}`}
          />
        </Card>
      </div>
    );
  }

  // Default: clustering / bom UI (same look as ResultsPage)
  const clustersNormalized = normalizeClusters(raw?.clustering?.clusters || []);
  const hasClusteringResults = clustersNormalized.length > 0;
  const hasBOMResults = (raw?.bom_analysis?.similar_pairs || []).length > 0;
  const hasViz = vizConfig.data && vizConfig.data.length > 0;

  return (
    <div style={{ padding: 20 }}>
      <h2>Previous Analysis Result</h2>

      <Row gutter={16} style={{ marginBottom: 18 }}>
        {/* Replace the existing left Col that currently always renders BOM cards
    with this conditional block so BOM UI only appears when results exist */}
      <Col span={8}>
        {hasBOMResults ? (
          <>
            <Card style={{ marginBottom: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#1890ff' }}>
                    <BarChartOutlined style={{ marginRight: 8 }} /> {bomResultsLocal?.similar_pairs?.length || 0}
                  </div>
                  <div style={{ color: '#666', marginTop: 8 }}>Similar BOM Pairs</div>
                </div>
                <Button icon={<DownloadOutlined />} onClick={() => handleExportSimilarPairs(bomResultsLocal)}>
                  Export Similar Pairs
                </Button>
              </div>
            </Card>

            <Card style={{ marginBottom: 20, background: '#f6ffed', borderColor: '#b7eb8f' }}>
              <Button
                type="primary"
                size="large"
                style={{
                  background: '#389e0d',
                  borderColor: '#237804',
                  borderRadius: '6px',
                  fontWeight: '500'
                }}
                onClick={() =>
                  navigate('/results/bom/replacements', {
                    state: {
                      analysisResults: {
                        bom_analysis: bomResultsLocal
                      },
                      analysisId: analysisId
                    }
                  })
                }
              >
                View Replacement Suggestions
              </Button>
            </Card>

            <Card style={{ marginBottom: 20 }}>
              <div style={{ height: 320 }}>
                <Bar data={chartData} options={chartOptions} />
              </div>
            </Card>

            <Card title="BOM Similarity Analysis" style={{ marginTop: 10 }}>
              <Table
                columns={similarityColumns}
                dataSource={(bomResultsLocal?.similar_pairs || []).filter(
                  pair => pair.similarity_score >= ((bomResultsLocal?.threshold ?? 0))
                )}
                pagination={false}
                rowKey={(record) => `${record.bom_a}-${record.bom_b}`}
              />
            </Card>
          </>
        ) : (
          /* Placeholder when there are no BOM results — keep small informative card */
          <Card style={{ marginBottom: 20, textAlign: 'center' }}>
            <div style={{ fontSize: 18, color: '#666' }}>
              No BOM similarity results for this analysis.
            </div>
            <div style={{ color: '#999', marginTop: 8 }}>This analysis contains clustering data only.</div>
          </Card>
        )}
      </Col>

        <Col span={8}>
          <Card>
            <div style={{ fontSize: 18 }}>
              Reduction Potential: {stats.reductionPotential}%
            </div>
          </Card>
        </Col>
      </Row>

      <Row gutter={16}>
        <Col span={14}>
          <Card
            title="Weldment Clusters"
            extra={
              <div>
                <Button
                  icon={<DownloadOutlined />}
                  onClick={() => {
                    const blob = new Blob([JSON.stringify(raw, null, 2)], {
                      type: 'application/json'
                    });
                    saveAs(blob, `analysis-${analysisId || 'prev'}.json`);
                  }}
                  style={{ marginRight: 8 }}
                >
                  Export Report
                </Button>
              </div>
            }
          >
            {hasClusteringResults ? (
              <Table
                columns={clusterColumns}
                dataSource={clustersNormalized}
                pagination={false}
                size="small"
                rowKey="cluster_id"
              />
            ) : (
              <div style={{ textAlign: 'center', padding: 20 }}>
                <p>No clustering results available.</p>
              </div>
            )}
          </Card>
        </Col>

        <Col span={10}>
          <Card title="Cluster Visualization">
            {hasViz ? (
              <ClusterChart
                data={vizConfig.data}
                xKey={vizConfig.xKey}
                yKey={vizConfig.yKey}
              />
            ) : (
              <div style={{ textAlign: 'center', padding: 40 }}>
                <p>No visualization data available</p>
                <p>
                  <small>
                    Need at least 2 numeric dimensions or PC1/PC2 for
                    visualization
                  </small>
                </p>
              </div>
            )}
          </Card>
        </Col>
      </Row>

      <Card title="BOM Similarity" style={{ marginTop: 18 }}>
        {hasBOMResults ? (
          <Table
            columns={similarityColumns}
            dataSource={raw?.bom_analysis?.similar_pairs || []}
            pagination={false}
            rowKey={(r, i) => `${r.bom_a || 'a'}-${r.bom_b || 'b'}-${i}`}
          />
        ) : (
          <div style={{ textAlign: 'center', padding: 20 }}>
            <p>No BOM similarity results available.</p>
          </div>
        )}
      </Card>

      <Modal
        title={`Cluster ${selectedCluster?.cluster_id} Details`}
        open={clusterModalVisible}
        onCancel={() => setClusterModalVisible(false)}
        footer={[
          <Button key="close" onClick={() => setClusterModalVisible(false)}>
            Close
          </Button>
        ]}
        width={600}
      >
        {selectedCluster && (
          <div>
            <p>
              <strong>Cluster ID:</strong> {selectedCluster.cluster_id}
            </p>
            <p>
              <strong>Member Count:</strong> {selectedCluster.member_count}
            </p>
            <p>
              <strong>Representative:</strong>{' '}
              <Tag color="blue">{selectedCluster.representative}</Tag>
            </p>
            <p>
              <strong>Reduction Potential:</strong>{' '}
              {Math.round((selectedCluster.reduction_potential || 0) * 100)}%
            </p>
            <p>
              <strong>Members:</strong>
            </p>
            <div
              style={{
                maxHeight: 200,
                overflowY: 'auto',
                border: '1px solid #d9d9d9',
                padding: 8
              }}
            >
              {selectedCluster.members.map((m, i) => (
                <Tag key={i} style={{ margin: 2 }}>
                  {m}
                </Tag>
              ))}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default PreviousAnalysisPage;
