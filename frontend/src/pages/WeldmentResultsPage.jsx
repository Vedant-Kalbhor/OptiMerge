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
  Collapse
} from 'antd';
import { DownloadOutlined, BarChartOutlined } from '@ant-design/icons';
import { saveAs } from 'file-saver';
import { getAnalysisResults } from '../services/api';
import { useParams, useLocation, useNavigate } from 'react-router-dom';

const { Panel } = Collapse;

const WeldmentResultsPage = () => {
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(true);
  const [totalAssemblies, setTotalAssemblies] = useState(0);
  const { analysisId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();

  const hasCostSavings =
    !!results &&
    !!results.cost_savings &&
    results.cost_savings.has_cost_data &&
    Array.isArray(results.cost_savings.rows) &&
    results.cost_savings.rows.length > 0;

  useEffect(() => {
    if (location.state?.analysisResults?.weldment_pairwise) {
      setResults(location.state.analysisResults.weldment_pairwise);
      // Get total assemblies from location state if passed
      if (location.state.totalAssemblies) {
        setTotalAssemblies(location.state.totalAssemblies);
      } else if (location.state.analysisResults?.weldment_pairwise?.parameters?.total_assemblies) {
        setTotalAssemblies(location.state.analysisResults.weldment_pairwise.parameters.total_assemblies);
      }
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
      const weld =
        raw?.weldment_pairwise ||
        raw?.weldment_pairwise_result ||
        data.weldment_pairwise_result;
      setResults(weld || null);
      
      // Get total assemblies from the analysis results
      if (weld?.parameters?.total_assemblies) {
        setTotalAssemblies(weld.parameters.total_assemblies);
      } else if (raw?.clustering?.metrics?.n_samples) {
        setTotalAssemblies(raw.clustering.metrics.n_samples);
      } else {
        // Fallback: estimate from pairwise table
        const assembliesSet = new Set();
        if (weld?.pairwise_table) {
          weld.pairwise_table.forEach(row => {
            if (row.bom_a) assembliesSet.add(row.bom_a);
            if (row.bom_b) assembliesSet.add(row.bom_b);
          });
        }
        setTotalAssemblies(assembliesSet.size);
      }
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

      if (hasCostSavings) {
        const savingsRows = results.cost_savings.rows || [];
        
        // Group savings by assembly groups (for summary)
        const groups = {};
        savingsRows.forEach(row => {
          const groupKey = row.group_members?.sort().join(',') || row.bom_a;
          if (!groups[groupKey]) {
            groups[groupKey] = {
              members: row.group_members || [row.bom_a, row.bom_b],
              cheapest: row.recommended_assembly,
              rows: []
            };
          }
          groups[groupKey].rows.push(row);
        });

        // Export with group information
        const header = [
          'Group ID',
          'Group Members',
          'Cheapest Assembly',
          'Assembly A (Old)',
          'Assembly B (New)',
          'Match %',
          'Cost A',
          'EAU A',
          'Cost B',
          'Old-New Price',
          'EAU (Replaced)',
          'Total Cost Before',
          'Total Cost After',
          'Cost Savings',
          'Savings %'
        ];

        const csvRows = [header.join(',')];
        
        // Add group summary first
        Object.entries(groups).forEach(([groupKey, group], idx) => {
          const groupTotalSavings = group.rows.reduce((sum, r) => sum + (r.cost_savings || 0), 0);
          csvRows.push([
            `Group ${idx + 1}`,
            `"${group.members.join(', ')}"`,
            group.cheapest,
            '', '', '', '', '', '', '', '', '', '', '',
            groupTotalSavings.toFixed(2)
          ].join(','));
          
          // Then add individual rows
          group.rows.forEach(row => {
            csvRows.push([
              `Group ${idx + 1}`,
              `"${row.group_members?.join(', ') || [row.bom_a, row.bom_b].join(', ')}"`,
              row.recommended_assembly,
              row.bom_a,
              row.bom_b,
              row.match_percentage?.toFixed(1) || '100.0',
              row.cost_a?.toFixed(2) || '',
              row.eau_a || '',
              row.cost_b?.toFixed(2) || '',
              row.old_new_price?.toFixed(2) || '',
              row.effective_eau || '',
              row.total_cost_before?.toFixed(2) || '',
              row.total_cost_after?.toFixed(2) || '',
              row.cost_savings?.toFixed(2) || '',
              row.savings_percent?.toFixed(2) || ''
            ].join(','));
          });
        });

        const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
        saveAs(blob, `weldment-pairwise-groups-${analysisId || 'latest'}.csv`);
        message.success('Exported CSV with grouped savings');
        return;
      }

      // Legacy export (no cost data)
      const header = [
        'Assembly A',
        'Assembly B',
        'Match %',
        'Matching Columns'
      ];
      const csvRows = [
        header.join(','),
        ...rows.map(r =>
          [
            `"${(r.bom_a || '').replace(/"/g, '""')}"`,
            `"${(r.bom_b || '').replace(/"/g, '""')}"`,
            `${r.match_percentage ?? 0}`,
            `"${(r.matching_columns || []).join('; ').replace(/"/g, '""')}"`,
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

  const columns = [
    {
      title: 'Assembly A',
      dataIndex: 'bom_a',
      key: 'bom_a',
      render: t => <span style={{ fontFamily: 'monospace' }}>{t}</span>
    },
    {
      title: 'Assembly B',
      dataIndex: 'bom_b',
      key: 'bom_b',
      render: t => <span style={{ fontFamily: 'monospace' }}>{t}</span>
    },
    {
      title: 'Match %',
      dataIndex: 'match_percentage',
      key: 'match_percentage',
      render: val => {
        const pct = Number(val) || 0;
        return (
          <Progress
            percent={Math.round(pct)}
            size="small"
            format={p => `${p.toFixed(1)}%`}
          />
        );
      }
    },
    {
      title: 'Matching (columns)',
      dataIndex: 'matching_columns',
      key: 'matching_columns',
      render: arr =>
        Array.isArray(arr)
          ? arr.map((c, i) => <Tag key={i}>{c}</Tag>)
          : null
    }
  ];

  const costColumns = hasCostSavings
    ? [
        {
          title: 'Group',
          dataIndex: 'group_members',
          key: 'group',
          render: (members, record) => {
            if (!members || !Array.isArray(members)) {
              return '-';
            }
            const groupId = record.group_members?.sort().join(',') || 'single';
            return (
              <Tag color="blue">
                Group of {members.length}
              </Tag>
            );
          }
        },
        {
          title: 'Assembly A (Old)',
          dataIndex: 'bom_a',
          key: 'bom_a',
          render: (t, record) => (
            <div>
              <span style={{ fontFamily: 'monospace' }}>{t}</span>
              {record.group_members && record.group_members.length > 2 && (
                <div style={{ fontSize: '0.8em', color: '#666' }}>
                  From group of {record.group_members.length}
                </div>
              )}
            </div>
          )
        },
        {
          title: 'Assembly B (New)',
          dataIndex: 'bom_b',
          key: 'bom_b',
          render: (t, record) => (
            <div>
              <span style={{ fontFamily: 'monospace', color: '#52c41a', fontWeight: 'bold' }}>
                {t}
              </span>
              <div style={{ fontSize: '0.8em', color: '#52c41a' }}>
                (Cheapest)
              </div>
            </div>
          )
        },
        {
          title: 'Match %',
          dataIndex: 'match_percentage',
          key: 'match_percentage',
          render: val => {
            const pct = Number(val) || 0;
            return (
              <span style={{ color: '#52c41a', fontWeight: 'bold' }}>
                {pct.toFixed(1)}%
              </span>
            );
          }
        },
        {
          title: 'Old-New Price',
          dataIndex: 'old_new_price',
          key: 'old_new_price',
          render: v =>
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
          render: v => (v != null ? Number(v).toLocaleString() : '-')
        },
        {
          title: 'Total Cost Before',
          dataIndex: 'total_cost_before',
          key: 'total_cost_before',
          render: v =>
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
          render: v =>
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
          render: v =>
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
          render: v =>
            v != null ? `${Number(v).toFixed(2)}%` : '-'
        }
      ]
    : [];

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
          action={
            <Button type="primary" onClick={() => navigate('/analysis')}>
              Run Analysis
            </Button>
          }
        />
      </div>
    );
  }

  if (hasCostSavings) {
    const statsBlock = results.cost_savings.statistics || {};
    const totalPairs = results.pairwise_table?.length || 0;
    const totalReplacements = statsBlock.pair_count_100 || 0;
    const totalSavings = statsBlock.total_cost_savings || 0;
    const avgSavingsPercent = statsBlock.avg_savings_percent || 0;
    const numGroups = statsBlock.num_groups || 0;
    
    // Calculate assemblies after replacement
    const assembliesAfterReplacement = Math.max(0, totalAssemblies - totalReplacements);
    
    // Group savings rows by their group
    const groupsMap = {};
    if (results.cost_savings.rows) {
      results.cost_savings.rows.forEach(row => {
        const groupKey = row.group_members?.sort().join(',') || row.bom_a;
        if (!groupsMap[groupKey]) {
          groupsMap[groupKey] = {
            members: row.group_members || [row.bom_a, row.bom_b],
            cheapest: row.recommended_assembly,
            rows: [],
            totalSavings: 0
          };
        }
        groupsMap[groupKey].rows.push(row);
        groupsMap[groupKey].totalSavings += row.cost_savings || 0;
      });
    }

    return (
      <div>
        <h1>Weldment One-to-One Comparison (with Cost & EAU)</h1>

        {/* Added row with threshold and pairs info */}
        <Row gutter={16} style={{ marginBottom: 18 }}>
          <Col span={8}>
            <Card>
              <div style={{ fontSize: 18 }}>
                <BarChartOutlined style={{ marginRight: 6 }} />
                Threshold: {results?.parameters?.threshold_percent ?? '-'} %
              </div>
            </Card>
          </Col>
          <Col span={8}>
            <Card>
              <div style={{ fontSize: 18 }}>
                Pairs Above Threshold: {results?.statistics?.pair_count ?? (results?.pairwise_table?.length || 0)}
              </div>
            </Card>
          </Col>
        </Row>

        <Card style={{ marginBottom: 20 }}>
          <Row gutter={16} align="middle">
            <Col xs={24} sm={12} md={4}>
              <Statistic 
                title="Total Weldments" 
                value={totalAssemblies}
                valueStyle={{ color: '#1890ff', fontSize: '24px' }}
              />
            </Col>
            <Col xs={24} sm={12} md={4}>
              <Statistic 
                title="Replacement Opportunities" 
                value={totalReplacements}
                valueStyle={{ color: '#faad14', fontSize: '24px' }}
              />
            </Col>
            <Col xs={24} sm={12} md={4}>
              <Statistic
                title="Weldments After Replacement"
                value={assembliesAfterReplacement}
                valueStyle={{ color: '#52c41a', fontSize: '24px', fontWeight: 'bold' }}
              />
            </Col>
            <Col xs={24} sm={12} md={4}>
              <Statistic
                title="Total Savings"
                value={totalSavings}
                precision={2}
                prefix="£"
                valueStyle={{ color: '#52c41a', fontSize: '24px' }}
              />
            </Col>
            <Col xs={24} sm={12} md={4}>
              <Statistic
                title="Avg Savings %"
                value={avgSavingsPercent}
                precision={2}
                suffix="%"
                valueStyle={{ color: '#722ed1', fontSize: '24px' }}
              />
            </Col>
            <Col xs={24} sm={12} md={4}>
              <Statistic
                title="Similar Groups"
                value={numGroups}
                valueStyle={{ color: '#13c2c2', fontSize: '24px' }}
              />
            </Col>
          </Row>
          
          <div style={{ marginTop: 10, textAlign: 'center', color: '#666', fontSize: '14px' }}>
            {totalAssemblies > 0 && totalReplacements > 0 && (
              <div>
                Optimization reduces {totalReplacements} assemblies → {assembliesAfterReplacement} unique assemblies remain
                <span style={{ marginLeft: 10, color: '#52c41a', fontWeight: 'bold' }}>
                  ({Math.round((totalReplacements / totalAssemblies) * 100)}% consolidation)
                </span>
              </div>
            )}
          </div>

          <div style={{ marginTop: 16, textAlign: 'right' }}>
            <Button icon={<DownloadOutlined />} onClick={handleExportCSV}>
              Export CSV (with groups)
            </Button>
          </div>
        </Card>

        {/* Display groups */}
        {numGroups > 0 && (
          <Card title="Similar Assembly Groups" style={{ marginBottom: 20 }}>
            <Collapse>
              {Object.entries(groupsMap).map(([key, group], idx) => (
                <Panel 
                  header={
                    <div>
                      <strong>Group {idx + 1}</strong>: {group.members.length} similar assemblies
                      <span style={{ marginLeft: 20, color: '#52c41a' }}>
                        Cheapest: {group.cheapest} | Total Savings: £{group.totalSavings.toFixed(2)}
                      </span>
                    </div>
                  } 
                  key={idx}
                >
                  <div style={{ padding: '10px 0' }}>
                    <strong>Members:</strong> {group.members.join(', ')}
                  </div>
                  <div style={{ padding: '10px 0' }}>
                    <strong>Cheapest Assembly:</strong> {group.cheapest}
                  </div>
                  <div style={{ padding: '10px 0' }}>
                    <strong>Replacements:</strong>
                    <ul>
                      {group.rows.map((row, rowIdx) => (
                        <li key={rowIdx}>
                          {row.bom_a} → {row.bom_b}: Save £{row.cost_savings?.toFixed(2)} ({row.savings_percent?.toFixed(2)}%)
                        </li>
                      ))}
                    </ul>
                  </div>
                </Panel>
              ))}
            </Collapse>
          </Card>
        )}

        <Card title="Pairwise Dimension Comparison" style={{ marginBottom: 20 }}>
          <Table
            columns={columns}
            dataSource={results.pairwise_table || []}
            pagination={false}
            rowKey={(r, i) => `${r.bom_a}-${r.bom_b}-${i}`}
          />
        </Card>

        <Card title="Cost Savings from Replacements">
          <Table
            columns={costColumns}
            dataSource={results.cost_savings.rows || []}
            pagination={false}
            rowKey={(r, i) => `cost-${r.bom_a}-${r.bom_b}-${i}`}
          />
        </Card>
      </div>
    );
  }

  // Legacy layout (no cost/EAU columns)
  return (
    <div>
      <h1>Weldment One-to-One Comparison</h1>

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
              {results.pairwise_table?.length || 0} pairs
            </div>
            <div style={{ color: '#666' }}>Pairs above threshold</div>
          </div>

          <Button icon={<DownloadOutlined />} onClick={handleExportCSV}>
            Export CSV
          </Button>
        </div>
      </Card>

      <Card title="Pairwise Table">
        <Table
          columns={columns}
          dataSource={results.pairwise_table || []}
          pagination={false}
          rowKey={(r, i) => `${r.bom_a}-${r.bom_b}-${i}`}
        />
      </Card>
    </div>
  );
};

export default WeldmentResultsPage;