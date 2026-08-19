import React, { useState, useEffect } from 'react';
import {
  Card,
  Table,
  Tag,
  Progress,
  Alert,
  Button,
  Spin,
  message,
  Statistic,
  Row,
  Col,
  Input,
  Space,
  Radio,
  Tooltip
} from 'antd';
import { DownloadOutlined, FileExcelOutlined, FileTextOutlined, SearchOutlined, ReloadOutlined } from '@ant-design/icons';
import { saveAs } from 'file-saver';
import { getAnalysisResults, exportPipeReport } from '../services/api';
import { useParams, useLocation, useNavigate } from 'react-router-dom';

const PipesResultsPage = () => {
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(true);
  const [exportLoading, setExportLoading] = useState(false);
  const [searchText, setSearchText] = useState('');
  const { analysisId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (location.state?.analysisResults?.pipe_pairwise) {
      setResults(location.state.analysisResults.pipe_pairwise);
      setLoading(false);
    } else if (analysisId) {
      loadAnalysisResults();
    } else {
      setLoading(false);
    }
  }, [analysisId, location.state]);

  const loadAnalysisResults = async () => {
    try {
      setLoading(true);
      const response = await getAnalysisResults(analysisId);
      const data = response.data;
      const raw = data.raw || data;
      const pipeRes = raw?.pipe_pairwise || raw?.pipe_pairwise_result || data.pipe_pairwise_result;
      setResults(pipeRes || null);
    } catch (err) {
      console.error('Error loading pipe results:', err);
      message.error('Failed to load pipe analysis results');
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async (format = 'excel') => {
    try {
      setExportLoading(true);
      const mode = results?.parameters?.mode || 'xyz_only';
      
      const response = await exportPipeReport(analysisId, mode, format);
      const filename = `Comparison_Report_${mode === 'xyz_bends' ? 'XYZ_Bends' : 'XYZOnly'}.${format === 'csv' ? 'csv' : 'xlsx'}`;
      const blob = new Blob([response.data], {
        type: format === 'csv' ? 'text/csv' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      });
      saveAs(blob, filename);
      message.success(`Exported ${filename} successfully`);
    } catch (err) {
      console.error('Export failed:', err);
      message.error('Export failed. Downloading fallback client CSV...');
      handleFallbackCSV();
    } finally {
      setExportLoading(false);
    }
  };

  const handleFallbackCSV = () => {
    const tableData = results?.pairwise_table || [];
    if (!tableData.length) {
      message.warning('No data to export');
      return;
    }
    const mode = results?.parameters?.mode || 'xyz_only';
    const isBends = mode === 'xyz_bends';
    
    const headers = isBends
      ? ['Part A', 'Part B', 'Bends %', 'X %', 'Y %', 'Z %', 'Match %']
      : ['Part A', 'Part B', 'X %', 'Y %', 'Z %', 'Match %'];

    const rows = tableData.map(r => {
      if (isBends) {
        return [r['Part A'], r['Part B'], r['Bends %'], r['X %'], r['Y %'], r['Z %'], r['Match %']];
      }
      return [r['Part A'], r['Part B'], r['X %'], r['Y %'], r['Z %'], r['Match %']];
    });

    const csvContent = [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    saveAs(blob, `Comparison_Report_${isBends ? 'XYZ_Bends' : 'XYZOnly'}.csv`);
  };

  const handleViewReplacementSuggestions = () => {
  navigate(`/results/pipes/replacements/${analysisId}`, {
    state: {
      pipeAnalysis: results
    }
  });
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 50 }}>
        <Spin size="large" />
        <p>Loading pipe pairwise similarity results...</p>
      </div>
    );
  }

  if (!results) {
    return (
      <div style={{ textAlign: 'center', padding: 40 }}>
        <Alert
          message="No Pipe Similarity Results Found"
          description="Please run a Pipe Pairwise Analysis to view results."
          type="info"
          showIcon
          action={
            <Button type="primary" onClick={() => navigate('/analysis')}>
              Run Pipe Analysis
            </Button>
          }
        />
      </div>
    );
  }

  const mode = results?.parameters?.mode || 'xyz_only';
  const isBends = mode === 'xyz_bends';
  const threshold = results?.parameters?.threshold ?? 0;
  const totalPipes = results?.parameters?.total_pipes || 0;
  const tableData = results?.pairwise_table || [];
  const priceAvailable = results?.price_available === true;
  const replacementData = results?.replacement_suggestions || null;
  const replacementRows = replacementData?.replacement_rows || [];

  const filteredData = tableData.filter(item => {
    if (!searchText) return true;
    const q = searchText.toLowerCase();
    return (
      String(item['Part A']).toLowerCase().includes(q) ||
      String(item['Part B']).toLowerCase().includes(q)
    );
  });

  const columns = [
    {
      title: 'Part A',
      dataIndex: 'Part A',
      key: 'Part A',
      sorter: (a, b) => String(a['Part A']).localeCompare(String(b['Part A'])),
      render: text => <strong style={{ fontFamily: 'monospace' }}>{text}</strong>
    },
    {
      title: 'Part B',
      dataIndex: 'Part B',
      key: 'Part B',
      sorter: (a, b) => String(a['Part B']).localeCompare(String(b['Part B'])),
      render: text => <strong style={{ fontFamily: 'monospace' }}>{text}</strong>
    },
    ...(isBends ? [{
      title: 'Bends %',
      dataIndex: 'Bends %',
      key: 'Bends %',
      sorter: (a, b) => (a['Bends %'] || 0) - (b['Bends %'] || 0),
      render: val => <Tag color={val === 100 ? 'green' : 'blue'}>{val}%</Tag>
    }] : []),
    {
      title: 'X %',
      dataIndex: 'X %',
      key: 'X %',
      sorter: (a, b) => (a['X %'] || 0) - (b['X %'] || 0),
      render: val => <Tag color={val === 100 ? 'green' : 'cyan'}>{val}%</Tag>
    },
    {
      title: 'Y %',
      dataIndex: 'Y %',
      key: 'Y %',
      sorter: (a, b) => (a['Y %'] || 0) - (b['Y %'] || 0),
      render: val => <Tag color={val === 100 ? 'green' : 'cyan'}>{val}%</Tag>
    },
    {
      title: 'Z %',
      dataIndex: 'Z %',
      key: 'Z %',
      sorter: (a, b) => (a['Z %'] || 0) - (b['Z %'] || 0),
      render: val => <Tag color={val === 100 ? 'green' : 'cyan'}>{val}%</Tag>
    },
    {
      title: 'Match %',
      dataIndex: 'Match %',
      key: 'Match %',
      sorter: (a, b) => (a['Match %'] || 0) - (b['Match %'] || 0),
      defaultSortOrder: 'descend',
      render: val => {
        const pct = Number(val) || 0;
        let strokeColor = '#1890ff';
        if (pct >= 95) strokeColor = '#52c41a';
        else if (pct >= 80) strokeColor = '#faad14';
        else if (pct < 50) strokeColor = '#ff4d4f';

        return (
          <div style={{ width: 140 }}>
            <Progress
              percent={Math.round(pct)}
              strokeColor={strokeColor}
              size="small"
              format={p => `${pct.toFixed(1)}%`}
            />
          </div>
        );
      }
    }
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h1>Pipe Pairwise Similarity Analysis</h1>
        <Space>
          <Button
            type="primary"
            icon={<FileExcelOutlined />}
            loading={exportLoading}
            onClick={() => handleExport('excel')}
          >
            Export Excel ({isBends ? 'XYZ + Bends' : 'XYZ Only'})
          </Button>
          <Button
            icon={<FileTextOutlined />}
            loading={exportLoading}
            onClick={() => handleExport('csv')}
          >
            Export CSV
          </Button>
        </Space>
      </div>

      {/* Stats row */}
      <Row gutter={16} style={{ marginBottom: 20 }}>
        <Col span={6}>
          <Card>
            <Statistic
              title="Total Pipe Items"
              value={totalPipes}
              valueStyle={{ color: '#1890ff', fontSize: '24px' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="Matched Pairs"
              value={filteredData.length}
              suffix={`/ ${tableData.length}`}
              valueStyle={{ color: '#52c41a', fontSize: '24px' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="Mode Selected"
              value={isBends ? 'XYZ + Bends' : 'XYZ Only'}
              valueStyle={{ color: '#722ed1', fontSize: '20px' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="Similarity Threshold"
              value={threshold}
              suffix="%"
              valueStyle={{ color: '#faad14', fontSize: '24px' }}
            />
          </Card>
        </Col>
      </Row>
          {priceAvailable ? (
          <Card
            style={{
              marginBottom: 20,
              background: '#f6ffed',
              borderColor: '#b7eb8f'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ marginBottom: 8 }}>Cost-Effective Replacement Suggestions</h3>
                <p style={{ marginBottom: 0 }}>
                  Exact-match pipes with lower-cost alternatives are available.
                  View the replacement opportunities and estimated savings.
                </p>
              </div>
              <Button
                type="primary"
                onClick={handleViewReplacementSuggestions}
                disabled={replacementRows.length === 0}
              >
                View Replacement Suggestions
              </Button>
            </div>
          </Card>
        ) : (
          <Card
            style={{
              marginBottom: 20,
              background: '#fffbe6',
              borderColor: '#ffe58f'
            }}
          >
            <Alert
              message="Price Data Not Available"
              description="The uploaded Pipe file does not contain a Price column. Cost-effective replacement suggestions cannot be generated without price information."
              type="warning"
              showIcon
            />
          </Card>
        )}

      {/* Main Table Card */}
      <Card
        title={
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>Comparison Matrix ({filteredData.length} pairs displayed)</span>
            <Input
              placeholder="Search Part A or Part B..."
              prefix={<SearchOutlined />}
              value={searchText}
              onChange={e => setSearchText(e.target.value)}
              style={{ width: 250 }}
              allowClear
            />
          </div>
        }
      >
        <Table
          columns={columns}
          dataSource={filteredData}
          pagination={{
            defaultPageSize: 20,
            pageSizeOptions: ['10', '20', '50', '100', '500'],
            showSizeChanger: true,
            showTotal: (total, range) => `${range[0]}-${range[1]} of ${total} pairs`
          }}
          rowKey={(r, i) => `${r['Part A']}-${r['Part B']}-${i}`}
          size="middle"
        />
      </Card>
    </div>
  );
};

export default PipesResultsPage;
