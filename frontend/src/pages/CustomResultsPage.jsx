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
  Tabs,
  Badge,
  Typography,
  Tooltip,
  Divider
} from 'antd';
import {
  DownloadOutlined,
  FileExcelOutlined,
  SearchOutlined,
  ArrowLeftOutlined,
  SlidersOutlined,
  CheckCircleOutlined,
  WarningOutlined
} from '@ant-design/icons';
import { saveAs } from 'file-saver';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import UploadedFileViewer from '../components/UploadedFileViewer';
import { getAnalysisResults, exportCustomReport } from '../services/api';

const { Title, Text, Paragraph } = Typography;

const CustomResultsPage = () => {
  const [results, setResults] = useState(null);
  const [sourceFile, setSourceFile] = useState(null);
  const [template, setTemplate] = useState(null);
  const [loading, setLoading] = useState(true);
  const [exportLoading, setExportLoading] = useState(false);
  const [searchText, setSearchText] = useState('');
  const { analysisId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (location.state?.analysisResults?.custom_analysis) {
      setResults(location.state.analysisResults.custom_analysis);
      setTemplate(location.state.analysisResults.template || null);
      setSourceFile(
        location.state.source_file ||
        location.state.analysisResults?.source_file ||
        null
      );
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

      const customRes =
        raw?.custom_analysis ||
        raw?.custom_analysis_result ||
        data.custom_analysis_result;

      setResults(customRes || null);
      setTemplate(raw?.template || data?.template || null);
      setSourceFile(data.source_file || raw?.source_file || null);
    } catch (err) {
      console.error('Error loading custom analysis results:', err);
      message.error('Failed to load custom analysis results.');
    } finally {
      setLoading(false);
    }
  };

  const handleExportExcel = async () => {
    try {
      setExportLoading(true);
      const response = await exportCustomReport(analysisId);
      const tplName = (template?.name || results?.template_name || 'Custom_Analysis')
        .replace(/[^A-Za-z0-9_]+/g, '_');
      const filename = `${tplName}_Comparison_Report.xlsx`;

      const blob = new Blob([response.data], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      saveAs(blob, filename);
      message.success('Report downloaded successfully.');
    } catch (err) {
      console.error('Export error:', err);
      message.error('Failed to export Excel report.');
    } finally {
      setExportLoading(false);
    }
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '80px 0' }}>
        <Spin size="large" />
        <p style={{ marginTop: 16 }}>Loading custom analysis results...</p>
      </div>
    );
  }

  if (!results) {
    return (
      <Card style={{ textAlign: 'center', padding: '60px 20px' }}>
        <Title level={4}>No Custom Analysis Results Found</Title>
        <Paragraph type="secondary">
          Could not find analysis data for ID: {analysisId}
        </Paragraph>
        <Button type="primary" onClick={() => navigate('/custom-analysis')}>
          Back to Custom Analysis
        </Button>
      </Card>
    );
  }

  const summary = results.summary || {};
  const pairwiseTable = results.pairwise_table || [];
  const exactMatchGroups = results.exact_match_groups || [];

  // Filter rows by search text
  const filteredRows = pairwiseTable.filter((row) => {
    if (!searchText) return true;
    const query = searchText.toLowerCase();
    return (
      String(row.item_a || '').toLowerCase().includes(query) ||
      String(row.item_b || '').toLowerCase().includes(query)
    );
  });

  // Table columns for Pairwise comparison
  const columns = [
    {
      title: 'Item A',
      dataIndex: 'item_a',
      key: 'item_a',
      sorter: (a, b) => String(a.item_a).localeCompare(String(b.item_a)),
      render: (val) => <Text strong>{val}</Text>,
    },
    {
      title: 'Item B',
      dataIndex: 'item_b',
      key: 'item_b',
      sorter: (a, b) => String(a.item_b).localeCompare(String(b.item_b)),
      render: (val) => <Text strong>{val}</Text>,
    },
    {
      title: 'Match %',
      dataIndex: 'match_percentage',
      key: 'match_percentage',
      width: 180,
      sorter: (a, b) => a.match_percentage - b.match_percentage,
      defaultSortOrder: 'descend',
      render: (pct) => {
        let strokeColor = '#faad14';
        if (pct >= 99.9) strokeColor = '#52c41a';
        else if (pct >= 85) strokeColor = '#1890ff';

        return (
          <div style={{ minWidth: 120 }}>
            <Progress
              percent={pct}
              size="small"
              strokeColor={strokeColor}
              format={(p) => `${p}%`}
            />
          </div>
        );
      },
    },
    {
      title: 'Matching Columns',
      dataIndex: 'matching_columns',
      key: 'matching_columns',
      render: (cols) => (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {cols && cols.length > 0 ? (
            cols.map((c, idx) => (
              <Tag key={idx} color="success">
                {c}
              </Tag>
            ))
          ) : (
            <Text type="secondary" italic>None</Text>
          )}
        </div>
      ),
    },
    {
      title: 'Differing Columns',
      dataIndex: 'unmatching_columns',
      key: 'unmatching_columns',
      render: (cols) => (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {cols && cols.length > 0 ? (
            cols.map((c, idx) => (
              <Tag key={idx} color="warning">
                {c}
              </Tag>
            ))
          ) : (
            <Tag color="green">All Columns Match</Tag>
          )}
        </div>
      ),
    },
  ];

  // Expandable row rendering detailed column-by-column breakdown
  const expandedRowRender = (record) => {
    const details = record.column_details || {};
    const detailRows = Object.entries(details).map(([colName, info], idx) => ({
      key: idx,
      column_name: colName,
      val_a: info.val_a ?? '-',
      val_b: info.val_b ?? '-',
      similarity: info.similarity,
      weight: info.weight,
      type: info.type,
      is_match: info.is_match,
    }));

    const detailColumns = [
      {
        title: 'Column',
        dataIndex: 'column_name',
        key: 'column_name',
        render: (text) => <Text strong>{text}</Text>,
      },
      {
        title: 'Rule Type',
        dataIndex: 'type',
        key: 'type',
        render: (type) => (
          <Tag color="geekblue">{String(type).replace('_', ' ')}</Tag>
        ),
      },
      {
        title: 'Weight',
        dataIndex: 'weight',
        key: 'weight',
        render: (w) => `${w}%`,
      },
      {
        title: `Value in ${record.item_a}`,
        dataIndex: 'val_a',
        key: 'val_a',
      },
      {
        title: `Value in ${record.item_b}`,
        dataIndex: 'val_b',
        key: 'val_b',
      },
      {
        title: 'Column Similarity',
        dataIndex: 'similarity',
        key: 'similarity',
        render: (sim, r) => (
          <span>
            <Badge
              status={r.is_match || sim >= 99.9 ? 'success' : 'warning'}
              text={`${sim}%`}
            />
          </span>
        ),
      },
    ];

    return (
      <div style={{ margin: '8px 0', background: '#fafafa', padding: 12, borderRadius: 6 }}>
        <Text strong style={{ display: 'block', marginBottom: 8 }}>
          Detailed Comparison for: {record.item_a} vs {record.item_b}
        </Text>
        <Table
          dataSource={detailRows}
          columns={detailColumns}
          pagination={false}
          size="small"
        />
      </div>
    );
  };

  return (
    <div style={{ maxWidth: 1300, margin: '0 auto', paddingBottom: 40 }}>
      {/* Top Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 20,
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <div>
          <Button
            icon={<ArrowLeftOutlined />}
            onClick={() => navigate('/custom-analysis')}
            style={{ marginBottom: 8 }}
          >
            Custom Analysis Templates
          </Button>
          <Title level={2} style={{ margin: 0 }}>
            {results.template_name || template?.name || 'Custom Similarity Analysis'}
          </Title>
          <Space style={{ marginTop: 4 }}>
            <Tag color="blue">Analysis ID: {analysisId}</Tag>
            <Tag color="cyan">
              Identifier: {summary.identifier_column || template?.identifier_column || 'Row Index'}
            </Tag>
            <Tag color="purple">Threshold: {summary.threshold ?? 75}%</Tag>
          </Space>
        </div>

        <Space>
          {sourceFile && (
            <UploadedFileViewer
              sourceFile={sourceFile}
              buttonText="View Uploaded File"
            />
          )}
          <Button
            type="primary"
            icon={<DownloadOutlined />}
            loading={exportLoading}
            onClick={handleExportExcel}
          >
            Export to Excel
          </Button>
        </Space>
      </div>

      {/* Summary KPI Cards */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic
              title="Total Records Analyzed"
              value={summary.total_records ?? 0}
              valueStyle={{ color: '#1890ff' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic
              title="Compared Columns"
              value={summary.total_compared_columns ?? 0}
              suffix={`/ ${(template?.columns || []).length || summary.total_compared_columns}`}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic
              title="Similar Pairs Found"
              value={summary.similar_pairs_count ?? pairwiseTable.length}
              valueStyle={{ color: '#52c41a' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic
              title="Exact Match Groups (100%)"
              value={summary.exact_match_groups_count ?? exactMatchGroups.length}
              valueStyle={{ color: '#722ed1' }}
            />
          </Card>
        </Col>
      </Row>

      {/* Tabs */}
      <Tabs
        defaultActiveKey="pairs"
        items={[
          {
            key: 'pairs',
            label: `Similar Pairs (${pairwiseTable.length})`,
            children: (
              <Card>
                {/* Search Bar */}
                <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Input
                    placeholder="Search by Item A or Item B..."
                    prefix={<SearchOutlined />}
                    value={searchText}
                    onChange={(e) => setSearchText(e.target.value)}
                    style={{ maxWidth: 360 }}
                    allowClear
                  />
                  <Text type="secondary">
                    Showing {filteredRows.length} of {pairwiseTable.length} pairs
                  </Text>
                </div>

                <Table
                  dataSource={filteredRows}
                  columns={columns}
                  rowKey={(r) => `${r.item_a}_${r.item_b}`}
                  expandable={{
                    expandedRowRender,
                    rowExpandable: () => true,
                  }}
                  pagination={{ pageSize: 15, showSizeChanger: true }}
                />
              </Card>
            ),
          },
          {
            key: 'exact',
            label: `Duplicate Groups (${exactMatchGroups.length})`,
            children: (
              <Card>
                {exactMatchGroups.length === 0 ? (
                  <Alert
                    type="info"
                    showIcon
                    message="No 100% exact duplicate groups found."
                    description="None of the pairs evaluated had identical values across all compared columns."
                  />
                ) : (
                  <div>
                    <Paragraph type="secondary">
                      The following groups of items share identical values across all compared columns and can potentially be consolidated.
                    </Paragraph>
                    <Row gutter={[16, 16]}>
                      {exactMatchGroups.map((group, idx) => (
                        <Col xs={24} md={12} key={idx}>
                          <Card
                            size="small"
                            title={`Duplicate Group ${idx + 1} (${group.length} items)`}
                            style={{ borderLeft: '4px solid #722ed1' }}
                          >
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                              {group.map((item, itemIdx) => (
                                <Tag key={itemIdx} color="purple">
                                  {item}
                                </Tag>
                              ))}
                            </div>
                          </Card>
                        </Col>
                      ))}
                    </Row>
                  </div>
                )}
              </Card>
            ),
          },
          {
            key: 'rules',
            label: 'Template Rules Applied',
            children: (
              <Card>
                <Title level={4}>Applied Rules Summary</Title>
                <div style={{ marginBottom: 16 }}>
                  <Text strong>Part Identifier Column: </Text>
                  <Tag color="cyan">
                    {summary.identifier_column || template?.identifier_column || 'Not specified'}
                  </Tag>
                  <Text type="secondary">
                    (Excluded from similarity calculations and used exclusively to identify items)
                  </Text>
                </div>

                <Divider style={{ margin: '16px 0' }} />

                <Title level={5}>Active Compared Columns ({results.active_columns?.length || 0})</Title>
                <Table
                  dataSource={(results.active_columns || []).map((col, idx) => ({
                    key: idx,
                    name: col.template_name,
                    df_col: col.df_col,
                    type: col.type,
                    tolerance: col.tolerance !== null ? `±${col.tolerance}` : 'N/A',
                    weight: `${col.weight}%`,
                    norm_weight: `${((col.normalized_weight || 0) * 100).toFixed(1)}%`,
                  }))}
                  columns={[
                    { title: 'Configured Column', dataIndex: 'name', key: 'name' },
                    { title: 'Matched File Column', dataIndex: 'df_col', key: 'df_col' },
                    { title: 'Comparison Rule', dataIndex: 'type', key: 'type', render: (t) => <Tag color="geekblue">{String(t).replace('_', ' ')}</Tag> },
                    { title: 'Tolerance', dataIndex: 'tolerance', key: 'tolerance' },
                    { title: 'Configured Weight', dataIndex: 'weight', key: 'weight' },
                    { title: 'Normalized Weight', dataIndex: 'norm_weight', key: 'norm_weight' },
                  ]}
                  pagination={false}
                  size="small"
                />
              </Card>
            ),
          },
        ]}
      />
    </div>
  );
};

export default CustomResultsPage;
