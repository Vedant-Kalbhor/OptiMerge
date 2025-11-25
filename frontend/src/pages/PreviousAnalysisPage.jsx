import React, { useEffect, useState } from 'react';
import { Card, Table, Tag, Progress, Row, Col, Alert, Button, Spin, Modal, message } from 'antd';
import { DownloadOutlined, EyeOutlined, ClusterOutlined, BarChartOutlined } from '@ant-design/icons';
import { saveAs } from 'file-saver';
import ClusterChart from '../components/ClusterChart';
import { getAnalysisResults } from '../services/api';
import { useParams, useNavigate } from 'react-router-dom';

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
      const header = ['Assembly A', 'Assembly B', 'Match %', 'Matching Letters', 'Matching Columns', 'Unmatching Letters'];
      const csvRows = [
        header.join(','),
        ...rows.map(r => [
          `"${(r.bom_a || '').replace(/"/g, '""')}"`,
          `"${(r.bom_b || '').replace(/"/g, '""')}"`,
          `${(r.match_percentage || 0)}`,
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

  // ----------------- column defs -----------------
  const clusterColumns = [
    { title: 'Cluster ID', dataIndex: 'cluster_id', key: 'cluster_id' },
    { title: 'Member Count', dataIndex: 'member_count', key: 'member_count' },
    { title: 'Representative', dataIndex: 'representative', key: 'representative', render: r => <Tag color="blue">{r}</Tag> },
    { title: 'Reduction Potential', dataIndex: 'reduction_potential', key: 'reduction_potential', render: p => <Progress percent={Math.round((p || 0) * 100)} size="small" /> },
    { title: 'Actions', key: 'actions', render: (_, rec) => <Button type="link" icon={<EyeOutlined />} onClick={() => { setSelectedCluster(rec); setClusterModalVisible(true); }}>View</Button> }
  ];

  const similarityColumns = [
    { title: 'BOM A', dataIndex: 'bom_a', key: 'bom_a' },
    { title: 'BOM B', dataIndex: 'bom_b', key: 'bom_b' },
    { title: 'Similarity', dataIndex: 'similarity_score', key: 'similarity_score', render: s => <Progress percent={Math.round((s || 0) * 100)} size="small" /> },
    { title: 'Common Components', dataIndex: 'common_components', key: 'common_components', render: list => (list || []).map((c,i) => <Tag key={i}>{c.component || c}</Tag>) }
  ];

  const weldmentColumns = [
    { title: 'Assembly A', dataIndex: 'bom_a', key: 'bom_a', render: t => <span style={{ fontFamily: 'monospace' }}>{t}</span> },
    { title: 'Assembly B', dataIndex: 'bom_b', key: 'bom_b', render: t => <span style={{ fontFamily: 'monospace' }}>{t}</span> },
    {
      title: 'Match %', dataIndex: 'match_percentage', key: 'match_percentage', render: val => {
        // value in DB is already percent (e.g. 100, 90). Progress expects 0-100.
        const pct = Number(val) || 0;
        return <Progress percent={Math.round(pct)} size="small" format={p => `${p.toFixed(1)}%`} />;
      }
    },
    // { title: 'Matching (letters)', dataIndex: 'matching_columns_letters', key: 'matching_columns_letters', render: v => <div style={{ fontFamily: 'monospace' }}>{v}</div> },
    { title: 'Matching (columns)', dataIndex: 'matching_columns', key: 'matching_columns', render: arr => (Array.isArray(arr) ? arr.map((c,i) => <Tag key={i}>{c}</Tag>) : null) }
  ];

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

  // Determine type
  const analysisType = raw.type || doc?.type || (raw.weldment_pairwise ? 'weldment_pairwise' : (raw.bom_analysis ? 'bom_analysis' : (raw.clustering ? 'clustering' : 'unknown')));
  const stats = calculateStatistics(raw);
  const vizConfig = prepareVisualizationConfig(raw);

  // If this is weldment pairwise, render weldment UI
  if (analysisType === 'weldment_pairwise' || raw.weldment_pairwise) {
    const weld = raw.weldment_pairwise || raw.weldment_pairwise_result || raw;
    return (
      <div style={{ padding: 20 }}>
        <h2>Previous Analysis Result (Weldment Pairwise)</h2>

        <Row gutter={16} style={{ marginBottom: 18 }}>
          <Col span={8}>
            <Card>
              <div style={{ fontSize: 18 }}><ClusterOutlined style={{ marginRight: 6 }} />Pairs: {weld?.pairwise_table?.length || 0}</div>
            </Card>
          </Col>
          <Col span={8}>
            <Card>
              <div style={{ fontSize: 18 }}><BarChartOutlined style={{ marginRight: 6 }} />Threshold: {weld?.parameters?.threshold_percent ?? '-'}</div>
            </Card>
          </Col>
          <Col span={8}>
            <Card>
              <div style={{ fontSize: 18 }}>Pair Count: {weld?.statistics?.pair_count ?? (weld?.pairwise_table?.length || 0)}</div>
            </Card>
          </Col>
        </Row>

        <Card style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 22, fontWeight: 'bold', color: '#1890ff' }}>{weld?.pairwise_table?.length || 0} pairs</div>
              <div style={{ color: '#666' }}>Pairs above threshold</div>
            </div>

            <div>
              <Button icon={<DownloadOutlined />} style={{ marginRight: 8 }} onClick={() => handleExportWeldmentCSV(weld)}>Export CSV</Button>
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
        <Col span={8}><Card><div style={{ fontSize: 18 }}>Clusters: {stats.totalClusters}</div></Card></Col>
        <Col span={8}><Card><div style={{ fontSize: 18 }}>Similar BOM Pairs: {stats.similarPairs}</div></Card></Col>
        <Col span={8}><Card><div style={{ fontSize: 18 }}>Reduction Potential: {stats.reductionPotential}%</div></Card></Col>
      </Row>

      <Row gutter={16}>
        <Col span={14}>
          <Card
            title="Weldment Clusters"
            extra={
              <div>
                <Button icon={<DownloadOutlined />} onClick={() => { const blob = new Blob([JSON.stringify(raw, null, 2)], { type: 'application/json' }); saveAs(blob, `analysis-${analysisId || 'prev'}.json`); }} style={{ marginRight: 8 }}>Export Report</Button>
              </div>
            }
          >
            {hasClusteringResults ? (
              <Table columns={clusterColumns} dataSource={clustersNormalized} pagination={false} size="small" rowKey="cluster_id" />
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

      <Card title="BOM Similarity" style={{ marginTop: 18 }}>
        {hasBOMResults ? (
          <Table columns={similarityColumns} dataSource={raw?.bom_analysis?.similar_pairs || []} pagination={false} rowKey={(r, i) => `${r.bom_a || 'a'}-${r.bom_b || 'b'}-${i}`} />
        ) : (
          <div style={{ textAlign: 'center', padding: 20 }}>
            <p>No BOM similarity results available.</p>
          </div>
        )}
      </Card>

      <Modal title={`Cluster ${selectedCluster?.cluster_id} Details`} open={clusterModalVisible} onCancel={() => setClusterModalVisible(false)} footer={[<Button key="close" onClick={() => setClusterModalVisible(false)}>Close</Button>]} width={600}>
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
