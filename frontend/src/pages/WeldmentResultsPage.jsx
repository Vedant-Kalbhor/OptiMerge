// src/pages/WeldmentResultsPage.jsx
import React, { useState, useEffect } from 'react';
import { Card, Table, Tag, Progress, Alert, Button, Spin, message } from 'antd';
import { DownloadOutlined } from '@ant-design/icons';
import { saveAs } from 'file-saver';
import { getAnalysisResults } from '../services/api';
import { useParams, useLocation, useNavigate } from 'react-router-dom';

const WeldmentResultsPage = () => {
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(true);
  const { analysisId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (location.state?.analysisResults?.weldment_pairwise) {
      setResults(location.state.analysisResults.weldment_pairwise);
      setLoading(false);
    } else if (analysisId) {
      loadAnalysisResults();
    } else {
      setLoading(false);
    }
    // eslint-disable-next-line
  }, [analysisId, location.state]);

  const loadAnalysisResults = async () => {
    try {
      setLoading(true);
      const response = await getAnalysisResults(analysisId);
      const data = response.data;
      const raw = data.raw || data;
      const weld = raw?.weldment_pairwise || raw?.weldment_pairwise_result || data.weldment_pairwise_result;
      setResults(weld || null);
    } catch (err) {
      console.error('Error loading weldment results:', err);
      message.error('Failed to load results');
    } finally {
      setLoading(false);
    }
  };

  const handleExportCSV = () => {
    try {
      const rows = results?.pairwise_table || [];
      if (!rows.length) {
        message.warning('No results to export');
        return;
      }
      const header = ['Assembly A', 'Assembly B', 'Match %', 'Matching Letters', 'Matching Columns', 'Unmatching Letters'];
      const csvRows = [
        header.join(','),
        ...rows.map(r => [
          `"${(r.bom_a || '').replace(/"/g, '""')}"`,
          `"${(r.bom_b || '').replace(/"/g, '""')}"`,
          `${(r.match_percentage || 0).toFixed(2)}`,
          `"${(r.matching_columns_letters || '').replace(/"/g, '""')}"`,
          `"${(r.matching_columns || []).join('; ').replace(/"/g, '""')}"`,
          `"${(r.unmatching_columns_letters || '').replace(/"/g, '""')}"`
        ].join(','))
      ].join('\n');

      const blob = new Blob([csvRows], { type: 'text/csv;charset=utf-8;' });
      saveAs(blob, `weldment-pairwise-${analysisId || 'latest'}.csv`);
      message.success('Exported CSV');
    } catch (err) {
      console.error(err);
      message.error('Export failed');
    }
  };

  const columns = [
    { title: 'Assembly A', dataIndex: 'bom_a', key: 'bom_a', render: t => <span style={{ fontFamily: 'monospace' }}>{t}</span> },
    { title: 'Assembly B', dataIndex: 'bom_b', key: 'bom_b', render: t => <span style={{ fontFamily: 'monospace' }}>{t}</span> },
    {
      title: 'Match %', dataIndex: 'match_percentage', key: 'match_percentage', render: val => (
        <Progress percent={Math.round((val || 0) * 100) / 100} size="small" format={(p) => `${p.toFixed(1)}%`} />
      )
    },
    { title: 'Matching (letters)', dataIndex: 'matching_columns_letters', key: 'matching_columns_letters', render: v => <div style={{ fontFamily: 'monospace' }}>{v}</div> },
    { title: 'Matching (columns)', dataIndex: 'matching_columns', key: 'matching_columns', render: arr => (Array.isArray(arr) ? arr.map((c,i) => <Tag key={i}>{c}</Tag>) : null) }
  ];

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 50 }}>
        <Spin size="large" />
        <p>Loading weldment comparison results...</p>
      </div>
    );
  }

  if (!results) {
    return (
      <div style={{ textAlign: 'center', padding: 40 }}>
        <Alert
          message="No Weldment Pairwise Results"
          description="Run a weldment one-to-one comparison to see results here."
          type="info"
          showIcon
          action={<Button type="primary" onClick={() => navigate('/analysis')}>Run Analysis</Button>}
        />
      </div>
    );
  }

  return (
    <div>
      <h1>Weldment One-to-One Comparison</h1>

      <Card style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 'bold', color: '#1890ff' }}>
              {results.pairwise_table?.length || 0} pairs
            </div>
            <div style={{ color: '#666' }}>Pairs above threshold</div>
          </div>

          <Button icon={<DownloadOutlined />} onClick={handleExportCSV}>Export CSV</Button>
        </div>
      </Card>

      <Card title="Pairwise Table">
        <Table columns={columns} dataSource={results.pairwise_table || []} pagination={false} rowKey={(r, i) => `${r.bom_a}-${r.bom_b}-${i}`} />
      </Card>
    </div>
  );
};

export default WeldmentResultsPage;
