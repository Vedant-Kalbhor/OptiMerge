import React, { useState, useEffect, useMemo } from 'react';
import { Card, Table, Tag, Progress, Alert, Button, Spin, message } from 'antd';
import { DownloadOutlined, BarChartOutlined } from '@ant-design/icons';
import { saveAs } from 'file-saver';
import { getAnalysisResults } from '../services/api';
import { useParams, useNavigate, useLocation } from 'react-router-dom';

// Chart.js imports
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js/auto';
import { Bar } from 'react-chartjs-2';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

const BOMResultsPage = () => {
  const [bomResults, setBomResults] = useState(null);
  const [loading, setLoading] = useState(true);
  const { analysisId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (location.state?.analysisResults?.bom_analysis) {
      setBomResults(location.state.analysisResults.bom_analysis);
      setLoading(false);
    } else if (analysisId) {
      loadAnalysisResults();
    } else {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analysisId, location.state]);

  const loadAnalysisResults = async () => {
    try {
      setLoading(true);
      const response = await getAnalysisResults(analysisId);
      const data = response.data;
      const bom = data.bom_analysis_result || data.bom_analysis || data;
      setBomResults(bom);
    } catch (error) {
      console.error('Error loading BOM results:', error);
      message.error('Failed to load BOM results');
    } finally {
      setLoading(false);
    }
  };

  const handleExportSimilarPairs = () => {
    try {
      const pairs = bomResults?.similar_pairs || [];
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
      message.error('Failed to export BOM similarity');
    }
  };

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
                if (typeof c === 'object' && c !== null) {
                  const name = c.component || 'unknown';
                  const qa = c.qty_a != null ? c.qty_a : '-';
                  const qb = c.qty_b != null ? c.qty_b : '-';
                  const common = c.common_qty != null ? c.common_qty : null;
                  return (
                    <div key={i} style={{
                      padding: '4px 8px',
                      backgroundColor: '#e6f7ff',
                      border: '1px solid #91d5ff',
                      borderRadius: '12px',
                      fontSize: '11px',
                      fontFamily: 'monospace',
                      fontWeight: '500',
                      color: '#0050b3',
                      whiteSpace: 'nowrap',
                    }} title={`A: ${qa} | B: ${qb}`}>
                      <span style={{ marginRight: 6 }}>{name}</span>
                      <span style={{ fontSize: 11, color: '#333' }}>(A:{qa}, B:{qb})</span>
                      {common !== null && <Tag style={{ marginLeft: 6 }} color="green">{common}</Tag>}
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

// --- Place hooks here, before any early returns ---
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

  // USE ALL PAIRS, NOT THRESHOLD-FILTERED
  const pairs = bomResults?.similar_pairs || [];

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
}, [bomResults]);

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
    x: {
      ticks: { precision: 0 },
      title: { display: true, text: 'Number of BOM pairs' }
    },
    y: {
      title: { display: false }
    }
  }
};

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '50px' }}>
        <Spin size="large" />
        <p>Loading BOM similarity results...</p>
      </div>
    );
  }

  if (!bomResults) {
    return (
      <div style={{ textAlign: 'center', padding: '50px' }}>
        <Alert
          message="No BOM Results Found"
          description="Please run a BOM similarity analysis first to see results here."
          type="info"
          showIcon
          action={
            <Button type="primary" onClick={() => navigate('/analysis')}>
              Run Analysis
            </Button>
          }
        />
      </div>
    );
  }


  return (
    <div>
      <h1>BOM Similarity Results</h1>

      <Card style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#1890ff' }}>
              <BarChartOutlined style={{ marginRight: 8 }} /> {bomResults.similar_pairs?.length || 0}
            </div>
            <div style={{ color: '#666', marginTop: 8 }}>Similar BOM Pairs</div>
          </div>
          <Button icon={<DownloadOutlined />} onClick={handleExportSimilarPairs}>
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
                  bom_analysis: bomResults
                },
                analysisId: analysisId
              }
            })
          }
        >
          View Replacement Suggestions
       </Button>
      </Card>

      {/* --- Chart inserted below View Replacement Suggestions and above BOM Similarity Analysis --- */}
      <Card style={{ marginBottom: 20 }}>
        <div style={{ height: 320 }}>
          <Bar data={chartData} options={chartOptions} />
        </div>
      </Card>

      <Card title="BOM Similarity Analysis" style={{ marginTop: 10 }}>
        <Table
         columns={similarityColumns}
        dataSource={(bomResults.similar_pairs || []).filter(
          pair => pair.similarity_score >= (bomResults.threshold || 0)
        )}
         pagination={false}
        rowKey={(record) => `${record.bom_a}-${record.bom_b}`}
/>

      </Card>

    </div>
  );
};

export default BOMResultsPage;
