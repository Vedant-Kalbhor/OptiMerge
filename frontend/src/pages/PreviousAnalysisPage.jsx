// src/pages/PreviousAnalysisPage.jsx
import React, { useEffect, useState } from 'react';
import {
  Card, Table, Tag, Progress, Row, Col, Alert, Button, Spin, Modal, message
} from 'antd';
import {
  DownloadOutlined, EyeOutlined, ClusterOutlined, BarChartOutlined, FileTextOutlined
} from '@ant-design/icons';
import { saveAs } from 'file-saver';
import ClusterChart from '../components/ClusterChart';
import { getAnalysisResults } from '../services/api';
import { useParams, useNavigate } from 'react-router-dom';

/**
 * PreviousAnalysisPage
 * - Loads saved analysis by ID and displays only relevant sections depending on analysis type:
 *   - "clustering" => Weldment Clusters, Cluster Visualization
 *   - "bom"        => BOM Similarity, Replacement Suggestions
 *   - "weldment_pairwise" => Weldment One-to-One Comparison table (pairwise)
 *   - "combined"   => Shows both relevant sections
 *
 * Detection is robust to multiple backend field names and shapes.
 */

const PreviousAnalysisPage = () => {
  const { analysisId } = useParams();
  const navigate = useNavigate();

  const [analysisResults, setAnalysisResults] = useState(null);
  const [loading, setLoading] = useState(true);
  const [clusterModalVisible, setClusterModalVisible] = useState(false);
  const [selectedCluster, setSelectedCluster] = useState(null);

  useEffect(() => {
    if (analysisId) loadPastAnalysis();
    else setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analysisId]);

  const loadPastAnalysis = async () => {
    try {
      setLoading(true);
      const response = await getAnalysisResults(analysisId);
      const doc = response.data;
      // Some backends nest under `raw`, some return top-level. Normalize
      const raw = doc?.raw ? doc.raw : doc;
      setAnalysisResults(raw);
    } catch (err) {
      console.error('Could not load previous analysis', err);
      message.error('Could not load previous analysis');
    } finally {
      setLoading(false);
    }
  };

  // ---------- Helpers ----------

  const normalizeClusters = (clustersRaw) => {
    if (!clustersRaw) return [];
    // Already array-of-objects
    if (clustersRaw.length > 0 && typeof clustersRaw[0] === 'object' && !Array.isArray(clustersRaw[0])) {
      return clustersRaw.map((c, i) => ({
        cluster_id: c.cluster_id ?? (i + 1),
        members: c.members ?? c.member_list ?? [],
        member_count: c.member_count ?? (c.members ? c.members.length : (c.member_list ? c.member_list.length : 0)),
        representative: c.representative ?? (c.members && c.members[0]) ?? '-',
        reduction_potential: c.reduction_potential ?? 0
      }));
    }

    // array-of-arrays -> convert
    if (clustersRaw.length > 0 && Array.isArray(clustersRaw[0])) {
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

  const calculateStatistics = (results) => {
    if (!results) return { totalClusters: 0, similarPairs: 0, reductionPotential: 0 };

    const clustersRaw = results?.clustering?.clusters || results?.clustering_result?.clusters || [];
    const clusters = normalizeClusters(clustersRaw);
    const totalClusters = results?.clustering?.metrics?.n_clusters ?? clusters.length;
    const similarPairs = results?.bom_analysis?.similar_pairs?.length ?? results?.bom_analysis_result?.similar_pairs?.length ?? results?.weldment_pairwise?.pairs?.length ?? results?.pairwise_results?.length ?? 0;

    let reductionPotential = 0;
    if (clusters.length > 0) {
      const totalReduction = clusters.reduce((sum, c) => sum + (c.reduction_potential || 0), 0);
      reductionPotential = Math.round((totalReduction / clusters.length) * 100);
    }

    return { totalClusters, similarPairs, reductionPotential };
  };

  const prepareVisualizationConfig = (results) => {
    const vizData = results?.clustering?.visualization_data ?? results?.clustering_result?.visualization_data ?? [];
    const numericColumns = results?.clustering?.numeric_columns ?? results?.clustering_result?.numeric_columns ?? [];

    // prefer PC1/PC2
    if (vizData.length > 0 && ('PC1' in vizData[0] && 'PC2' in vizData[0])) {
      return { data: vizData, xKey: 'PC1', yKey: 'PC2' };
    }

    if (vizData.length > 0 && numericColumns.length >= 2) {
      return { data: vizData, xKey: numericColumns[0], yKey: numericColumns[1] };
    }

    return { data: [], xKey: '', yKey: '' };
  };

  const detectAnalysisType = (results) => {
    // Try explicit fields first
    const explicitType = results?.type || results?.analysis_type || results?.metadata?.type || results?.meta?.type;
    if (explicitType) {
      const t = explicitType.toString().toLowerCase();
      if (t.includes('bom') && (t.includes('cluster') || t.includes('clustering'))) return 'combined';
      if (t.includes('bom')) return 'bom';
      if (t.includes('cluster') || t.includes('clustering') || t.includes('dimensional')) return 'clustering';
      if (t.includes('pair') || t.includes('one-to-one') || t.includes('one_to_one') || t.includes('variant')) return 'weldment_pairwise';
      if (t.includes('weldment') && t.includes('comparison')) return 'weldment_pairwise';
    }

    // Fallback: inspect content
    const hasClustering = Boolean(
      (results?.clustering && (results.clustering.clusters || results.clustering.visualization_data)) ||
      (results?.clustering_result && (results.clustering_result.clusters || results.clustering_result.visualization_data))
    );
    const hasBOM = Boolean(
      (results?.bom_analysis && (results.bom_analysis.similar_pairs || results.bom_analysis.replacement_suggestions)) ||
      (results?.bom_analysis_result && (results.bom_analysis_result.similar_pairs || results.bom_analysis_result.replacement_suggestions))
    );
    const hasPairwise = Boolean(
      (results?.weldment_pairwise && (results.weldment_pairwise.pairs || results.weldment_pairwise.results)) ||
      results?.pairwise_results ||
      results?.pairwise ||
      results?.variant_comparison ||
      (Array.isArray(results?.pairwise_results) && results.pairwise_results.length > 0)
    );

    if (hasClustering && hasBOM) return 'combined';
    if (hasClustering) return 'clustering';
    if (hasPairwise) return 'weldment_pairwise';
    if (hasBOM) return 'bom';
    return 'unknown';
  };

  // ---------- Export handlers ----------

  const handleExportReport = () => {
    try {
      const reportData = {
        analysis_id: analysisId,
        timestamp: new Date().toISOString(),
        results: analysisResults
      };
      const blob = new Blob([JSON.stringify(reportData, null, 2)], { type: 'application/json' });
      saveAs(blob, `bom-analysis-report-${analysisId || 'latest'}.json`);
      message.success('Report exported successfully');
    } catch (error) {
      console.error(error);
      message.error('Failed to export report');
    }
  };

  const handleExportClusters = () => {
    try {
      const clusters = normalizeClusters(analysisResults?.clustering?.clusters || analysisResults?.clustering_result?.clusters || []);
      if (!clusters || clusters.length === 0) {
        message.warning('No cluster data to export');
        return;
      }

      const rows = [
        ['Cluster ID', 'Member Count', 'Representative', 'Reduction Potential', 'Members'],
        ...clusters.map(c => [
          c.cluster_id,
          c.member_count,
          c.representative,
          `${Math.round((c.reduction_potential || 0) * 100)}%`,
          (c.members || []).join('; ')
        ])
      ];

      const csvContent = rows.map(row => row.map(cell => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      saveAs(blob, `clusters-${analysisId || 'latest'}.csv`);
      message.success('Clusters exported successfully');
    } catch (error) {
      console.error(error);
      message.error('Failed to export clusters');
    }
  };

  const handleExportSimilarPairs = () => {
    try {
      const pairs = analysisResults?.bom_analysis?.similar_pairs || analysisResults?.bom_analysis_result?.similar_pairs || [];
      if (!pairs || pairs.length === 0) {
        message.warning('No BOM similarity data to export');
        return;
      }

      const rows = [
        ['BOM A', 'BOM B', 'Similarity Score', 'Common Components Count'],
        ...pairs.map(p => [
          p.bom_a,
          p.bom_b,
          `${Math.round((p.similarity_score || 0) * 100)}%`,
          Array.isArray(p.common_components) ? p.common_components.length : (p.common_components ? 1 : 0)
        ])
      ];

      const csvContent = rows.map(row => row.map(cell => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      saveAs(blob, `bom-similarity-${analysisId || 'latest'}.csv`);
      message.success('BOM similarity exported successfully');
    } catch (error) {
      console.error(error);
      message.error('Failed to export BOM similarity');
    }
  };

  const handleExportPairwise = () => {
    try {
      // Accept many shapes for pairwise list
      const pairs =
        analysisResults?.weldment_pairwise?.pairs ||
        analysisResults?.pairwise_results ||
        analysisResults?.pairwise ||
        analysisResults?.variant_comparison ||
        analysisResults?.pairwise_results?.pairs ||
        [];

      if (!pairs || pairs.length === 0) {
        message.warning('No weldment pairwise data to export');
        return;
      }

      const rows = [
        ['Assembly A', 'Assembly B', 'Match %', 'Matching Letters', 'Matching Columns']
      ];

      for (const p of pairs) {
        // Try multiple field names
        const a = p.assembly_a ?? p.assemblyA ?? p.bom_a ?? p.bomA ?? p.bom_a ?? p.A ?? p.a ?? '';
        const b = p.assembly_b ?? p.assemblyB ?? p.bom_b ?? p.bomB ?? p.b ?? '';
        const matchPct = (p.match_percentage ?? p.match_percent ?? p.match_percent ?? p.match ?? p['Match percentage'] ?? 0);
        const letters = p.matching_cols_letters ?? p.matching_letters ?? p.matching_cols ?? '';
        const cols = Array.isArray(p.matching_cols) ? p.matching_cols.join('; ') : p.matching_cols_letters ?? p.matching_columns ?? '';

        rows.push([a, b, `${matchPct}`, `"${letters}"`, `"${cols}"`]);
      }

      const csvContent = rows.map(r => r.join(',')).join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      saveAs(blob, `weldment-pairwise-${analysisId || 'latest'}.csv`);
      message.success('Weldment pairwise exported successfully');
    } catch (error) {
      console.error(error);
      message.error('Failed to export weldment pairwise');
    }
  };

  // ---------- Table column definitions ----------

  const clusterColumns = [
    { title: 'Cluster ID', dataIndex: 'cluster_id', key: 'cluster_id' },
    { title: 'Member Count', dataIndex: 'member_count', key: 'member_count' },
    { title: 'Representative', dataIndex: 'representative', key: 'representative', render: (r) => <Tag color="blue">{r}</Tag> },
    {
      title: 'Reduction Potential',
      dataIndex: 'reduction_potential',
      key: 'reduction_potential',
      render: (potential) => <Progress percent={Math.round((potential || 0) * 100)} size="small" />
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_, rec) => <Button type="link" icon={<EyeOutlined />} onClick={() => { setSelectedCluster(rec); setClusterModalVisible(true); }}>View</Button>
    }
  ];

  const similarityColumns = [
    {
      title: 'BOM A', dataIndex: 'bom_a', key: 'bom_a', width: 120
    },
    {
      title: 'BOM B', dataIndex: 'bom_b', key: 'bom_b', width: 120
    },
    {
      title: 'Similarity Score',
      dataIndex: 'similarity_score',
      key: 'similarity_score',
      width: 150,
      render: (score) => <Progress percent={Math.round((score || 0) * 100)} size="small" status={(score || 0) > 0.9 ? 'success' : (score || 0) > 0.5 ? 'active' : 'exception'} />
    },
    {
      title: 'Common Components',
      dataIndex: 'common_components',
      key: 'common_components',
      render: (components, record) => {
        let componentList = [];
        if (Array.isArray(components)) componentList = components;
        else if (typeof components === 'string') componentList = components.split(/\s+/).filter(Boolean);
        else if (!components && record && record.common_components) componentList = record.common_components;

        const isObjectList = componentList.length > 0 && typeof componentList[0] === 'object' && componentList[0] !== null;
        const totalCommonQty = isObjectList ? componentList.reduce((s, c) => s + (c.common_qty || 0), 0) : null;

        return (
          <div style={{ maxWidth: '500px', maxHeight: '150px', overflow: 'auto' }}>
            <div style={{
              display: 'flex', flexWrap: 'wrap', gap: 6, padding: 6,
              border: '1px solid #f0f0f0', borderRadius: 4, backgroundColor: '#fafafa'
            }}>
              {componentList.map((component, i) => {
                if (isObjectList) {
                  const name = component.component || 'unknown';
                  const qa = component.qty_a != null ? component.qty_a : '-';
                  const qb = component.qty_b != null ? component.qty_b : '-';
                  const common = component.common_qty != null ? component.common_qty : null;
                  return (
                    <div key={i} style={{
                      padding: '4px 8px', backgroundColor: '#e6f7ff', border: '1px solid #91d5ff',
                      borderRadius: 12, fontSize: 11, fontFamily: 'monospace', display: 'flex', gap: 8, alignItems: 'center'
                    }} title={`A:${qa} | B:${qb}`}>
                      <span>{name}</span>
                      <span style={{ fontSize: 11 }}>(A:{qa}, B:{qb})</span>
                      {common !== null && <Tag style={{ marginLeft: 6 }} color="green">{common}</Tag>}
                    </div>
                  );
                } else {
                  return (
                    <div key={i} style={{
                      padding: '2px 6px', backgroundColor: '#e6f7ff', border: '1px solid #91d5ff',
                      borderRadius: 12, fontSize: 11, fontFamily: 'monospace'
                    }}>{String(component)}</div>
                  );
                }
              })}
            </div>

            {componentList.length > 0 && (
              <div style={{ fontSize: 11, color: '#666', marginTop: 6, display: 'flex', justifyContent: 'space-between' }}>
                <div>{componentList.length} common component{componentList.length > 1 ? 's' : ''}</div>
                {totalCommonQty != null && <div>Total common quantity: <strong>{totalCommonQty}</strong></div>}
              </div>
            )}
          </div>
        );
      }
    }
  ];

  // New: Weldment pairwise columns (One-to-One)
  const weldmentPairwiseColumns = [
    {
      title: 'Assembly A',
      dataIndex: 'assembly_a',
      key: 'assembly_a',
      render: (val, rec) => val || rec.bom_a || rec.bomA || rec.a || '-'
    },
    {
      title: 'Assembly B',
      dataIndex: 'assembly_b',
      key: 'assembly_b',
      render: (val, rec) => val || rec.bom_b || rec.bomB || rec.b || '-'
    },
    {
      title: 'Match %',
      dataIndex: 'match_percentage',
      key: 'match_percentage',
      render: (val) => {
        const pct = (val == null ? (val === 0 ? 0 : '') : val);
        const percent = Number(pct) || 0;
        return <div style={{ minWidth: 80 }}><Progress percent={Math.round(percent)} size="small" status={percent > 90 ? 'success' : percent > 50 ? 'active' : 'exception'} /></div>;
      }
    },
    {
      title: 'Matching (letters)',
      dataIndex: 'matching_cols_letters',
      key: 'matching_cols_letters',
      render: (val) => <Tag color="blue">{val || '-'}</Tag>
    },
    {
      title: 'Matching (columns)',
      dataIndex: 'matching_cols',
      key: 'matching_cols',
      render: (val, rec) => {
        // Could be a long string or array
        let txt = '';
        if (Array.isArray(val)) txt = val.join(', ');
        else txt = val || rec.matching_columns || rec.matching_cols_letters || '';
        return <div style={{ maxWidth: 450, whiteSpace: 'pre-wrap', fontFamily: 'monospace', fontSize: 12 }}>{txt}</div>;
      }
    }
  ];

  // ---------- Render logic ----------

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 60 }}>
        <Spin size="large" />
        <p>Loading saved analysis...</p>
      </div>
    );
  }

  if (!analysisResults) {
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

  const type = detectAnalysisType(analysisResults); // 'clustering' | 'bom' | 'weldment_pairwise' | 'combined' | 'unknown'
  const clustersNormalized = normalizeClusters(analysisResults?.clustering?.clusters || analysisResults?.clustering_result?.clusters || []);
  const stats = calculateStatistics(analysisResults);
  const vizConfig = prepareVisualizationConfig(analysisResults);

  return (
    <div style={{ padding: 20 }}>
      <h2>Previous Analysis Result</h2>

      <Row gutter={16} style={{ marginBottom: 18 }}>
        <Col span={8}>
          <Card>
            <div style={{ fontSize: 18 }}><ClusterOutlined style={{ marginRight: 6 }} />Clusters: {stats.totalClusters}</div>
          </Card>
        </Col>
        <Col span={8}>
          <Card>
            <div style={{ fontSize: 18 }}><BarChartOutlined style={{ marginRight: 6 }} />Similar BOM Pairs: {stats.similarPairs}</div>
          </Card>
        </Col>
        <Col span={8}>
          <Card>
            <div style={{ fontSize: 18 }}>Reduction Potential: {stats.reductionPotential}%</div>
          </Card>
        </Col>
      </Row>

      {/* If analysis includes clustering (or combined) -> show clustering UI */}
      {(type === 'clustering' || type === 'combined') && (
        <Row gutter={16}>
          <Col span={14}>
            <Card
              title="Weldment Clusters"
              extra={
                <div>
                  <Button icon={<DownloadOutlined />} onClick={handleExportReport} style={{ marginRight: 8 }}>Export Report</Button>
                  <Button icon={<DownloadOutlined />} onClick={handleExportClusters}>Export Clusters</Button>
                </div>
              }
            >
              <Table
                columns={clusterColumns}
                dataSource={clustersNormalized}
                pagination={false}
                size="small"
                rowKey="cluster_id"
              />
            </Card>
          </Col>

          <Col span={10}>
            <Card title="Cluster Visualization">
              {vizConfig.data && vizConfig.data.length > 0 ? (
                <ClusterChart data={vizConfig.data} xKey={vizConfig.xKey} yKey={vizConfig.yKey} />
              ) : (
                <div style={{ textAlign: 'center', padding: 40 }}>
                  <p>No visualization data available</p>
                  <p><small>Need at least 2 numeric dimensions or PC1/PC2 for visualization</small></p>
                </div>
              )}
            </Card>
          </Col>
        </Row>
      )}

      {/* If analysis includes BOM similarity (or combined) -> show BOM UI */}
      {(type === 'bom' || type === 'combined') && (
        <>
          <Card title="BOM Similarity" style={{ marginTop: 18 }}>
            <Table
              columns={similarityColumns}
              dataSource={analysisResults?.bom_analysis?.similar_pairs || analysisResults?.bom_analysis_result?.similar_pairs || []}
              pagination={false}
              rowKey={(r, i) => `${r.bom_a || 'a'}-${r.bom_b || 'b'}-${i}`}
            />
          </Card>

          { (analysisResults?.bom_analysis?.replacement_suggestions || analysisResults?.bom_analysis_result?.replacement_suggestions || []).length > 0 && (
            <Card title="Replacement Suggestions" style={{ marginTop: 18 }}>
              {(analysisResults?.bom_analysis?.replacement_suggestions || analysisResults?.bom_analysis_result?.replacement_suggestions || []).map((sugg, idx) => (
                <Alert
                  key={idx}
                  message={sugg.suggestion}
                  description={`Confidence: ${Math.round((sugg.confidence || 0) * 100)}% | Redundant Components: ${sugg.potential_savings ?? 0}`}
                  type="info"
                  showIcon
                  style={{ marginBottom: 10 }}
                />
              ))}
            </Card>
          )}
        </>
      )}

      {/* If analysis includes weldment pairwise comparison -> show pairwise UI */}
      {(type === 'weldment_pairwise' || type === 'combined') && (
        <Card title="Weldment One-to-One Comparison" style={{ marginTop: 18 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <FileTextOutlined style={{ fontSize: 20, color: '#1890ff' }} />
              <div>
                <div style={{ fontSize: 18, fontWeight: '600' }}>{(analysisResults?.weldment_pairwise?.pairs || analysisResults?.pairwise_results || analysisResults?.pairwise || []).length || 0}</div>
                <div style={{ color: '#666' }}>Pairs above threshold</div>
              </div>
            </div>

            <div>
              <Button style={{ marginRight: 8 }} icon={<DownloadOutlined />} onClick={handleExportPairwise}>Export Pairwise CSV</Button>
              <Button onClick={() => message.info('Use the table to inspect pairwise comparison.')}>Help</Button>
            </div>
          </div>

          <Table
            columns={weldmentPairwiseColumns}
            dataSource={
              analysisResults?.weldment_pairwise?.pairs ||
              analysisResults?.pairwise_results ||
              analysisResults?.pairwise ||
              analysisResults?.variant_comparison ||
              []
            }
            pagination={false}
            rowKey={(r, i) => `${r.assembly_a || r.bom_a || r.a || 'a'}-${r.assembly_b || r.bom_b || r.b || 'b'}-${i}`}
          />
        </Card>
      )}

      {/* Unknown type fallback */}
      {type === 'unknown' && (
        <Card style={{ marginTop: 18 }}>
          <Alert
            message="Unknown analysis type"
            description="This analysis does not contain recognizable clustering or BOM similarity results. Displaying raw content may help debugging."
            type="warning"
            showIcon
          />
          <details style={{ marginTop: 12 }}>
            <summary>Show raw response</summary>
            <pre style={{ fontSize: 11, maxHeight: 300, overflow: 'auto' }}>
              {JSON.stringify(analysisResults, null, 2)}
            </pre>
          </details>
        </Card>
      )}

      {/* Cluster modal */}
      <Modal
        title={`Cluster ${selectedCluster?.cluster_id ?? ''} Details`}
        open={clusterModalVisible}
        onCancel={() => setClusterModalVisible(false)}
        footer={[<Button key="close" onClick={() => setClusterModalVisible(false)}>Close</Button>]}
        width={600}
      >
        {selectedCluster && (
          <div>
            <p><strong>Cluster ID:</strong> {selectedCluster.cluster_id}</p>
            <p><strong>Member Count:</strong> {selectedCluster.member_count}</p>
            <p><strong>Representative:</strong> <Tag color="blue">{selectedCluster.representative}</Tag></p>
            <p><strong>Reduction Potential:</strong> {Math.round((selectedCluster.reduction_potential || 0) * 100)}%</p>
            <p><strong>Members:</strong></p>
            <div style={{ maxHeight: 200, overflowY: 'auto', border: '1px solid #d9d9d9', padding: 8 }}>
              {selectedCluster.members.map((m, i) => <Tag key={i} style={{ margin: 2 }}>{m}</Tag>)}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default PreviousAnalysisPage;
