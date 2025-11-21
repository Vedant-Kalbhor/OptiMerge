// import React, { useEffect, useState } from 'react';
// import { Card, Table, Tag, Progress, Row, Col, Alert, Button, Spin, Modal, message } from 'antd';
// import { DownloadOutlined, EyeOutlined, ClusterOutlined, BarChartOutlined } from '@ant-design/icons';
// import { saveAs } from 'file-saver';
// import ClusterChart from '../components/ClusterChart';
// import { getAnalysisResults } from '../services/api';
// import { useParams } from 'react-router-dom';

// /** Updated PreviousAnalysisPage for new DB structure */
// const PreviousAnalysisPage = () => {
//   const { analysisId } = useParams();

//   const [analysisResults, setAnalysisResults] = useState(null);
//   const [loading, setLoading] = useState(true);
//   const [clusterModalVisible, setClusterModalVisible] = useState(false);
//   const [selectedCluster, setSelectedCluster] = useState(null);

//   useEffect(() => {
//     loadPastAnalysis();
//   }, [analysisId]);

//   const loadPastAnalysis = async () => {
//     try {
//       setLoading(true);
//       const response = await getAnalysisResults(analysisId);
//       const doc = response.data;
//       setAnalysisResults(doc);
//     } catch (err) {
//       console.error(err);
//       message.error('Could not load previous analysis');
//     } finally {
//       setLoading(false);
//     }
//   };

//   if (loading) {
//     return (
//       <div style={{ textAlign: 'center', padding: 60 }}>
//         <Spin size="large" />
//         <p>Loading saved analysis...</p>
//       </div>
//     );
//   }

//   if (!analysisResults) {
//     return (
//       <div style={{ padding: 24 }}>
//         <Alert
//           message="Analysis not found"
//           description="We couldn't find that saved analysis. Make sure the ID is correct."
//           type="error"
//           showIcon
//         />
//       </div>
//     );
//   }

//   const raw = analysisResults.raw || {};

//   // *** NEW CLUSTER FORMAT (Array of arrays) ****
//   const clusterGroups = raw.clustering?.clusters || [];

//   const normalizedClusterObjects = clusterGroups.map((members, idx) => ({
//     cluster_id: idx + 1,
//     members,
//     member_count: members.length,
//     representative: members[0] || '-',
//     reduction_potential: 0
//   }));

//   const bom = raw.bom_analysis || {};

//   const stats = {
//     totalClusters: raw.clustering?.metrics?.n_clusters || normalizedClusterObjects.length,
//     similarPairs: bom.similar_pairs?.length || 0,
//     reductionPotential: 0
//   };

//   const clusterColumns = [
//     { title: 'Cluster ID', dataIndex: 'cluster_id', key: 'cluster_id' },
//     { title: 'Member Count', dataIndex: 'member_count', key: 'member_count' },
//     { title: 'Representative', dataIndex: 'representative', key: 'representative', render: (r) => <Tag color="blue">{r}</Tag> },
//     { title: 'Actions', key: 'actions', render: (_, rec) => <Button type="link" icon={<EyeOutlined />} onClick={() => { setSelectedCluster(rec); setClusterModalVisible(true); }}>View</Button> }
//   ];

//   const similarityColumns = [
//     { title: 'BOM A', dataIndex: 'bom_a', key: 'bom_a' },
//     { title: 'BOM B', dataIndex: 'bom_b', key: 'bom_b' },
//     { title: 'Similarity', dataIndex: 'similarity_score', key: 'similarity_score', render: s => <Progress percent={Math.round((s||0) * 100)} size="small" /> },
//     { title: 'Common Components', dataIndex: 'common_components', key: 'common_components', render: list => (list||[]).map((c,i) => <Tag key={i}>{c.component}</Tag>) }
//   ];

//   return (
//     <div style={{ padding: 20 }}>
//       <h2>Analysis Results (Updated)</h2>

//       <Row gutter={16} style={{ marginBottom: 18 }}>
//         <Col span={8}><Card><div style={{ fontSize: 18 }}>Clusters: {stats.totalClusters}</div></Card></Col>
//         <Col span={8}><Card><div style={{ fontSize: 18 }}>Similar BOM Pairs: {stats.similarPairs}</div></Card></Col>
//         <Col span={8}><Card><div style={{ fontSize: 18 }}>Reduction Potential: {stats.reductionPotential}%</div></Card></Col>
//       </Row>

//       <Card title="Clusters (New Format)">
//         <Table
//           columns={clusterColumns}
//           dataSource={normalizedClusterObjects}
//           rowKey="cluster_id"
//           pagination={false}
//         />
//       </Card>

//       <Card title="BOM Similarity" style={{ marginTop: 18 }}>
//         <Table
//           columns={similarityColumns}
//           dataSource={bom.similar_pairs || []}
//           rowKey={(r) => `${r.bom_a}-${r.bom_b}`}
//           pagination={false}
//         />
//       </Card>

//       <Modal
//         open={clusterModalVisible}
//         title={selectedCluster ? `Cluster ${selectedCluster.cluster_id}` : ''}
//         onCancel={() => setClusterModalVisible(false)}
//         footer={<Button onClick={() => setClusterModalVisible(false)}>Close</Button>}
//         width={700}
//       >
//         {selectedCluster && (
//           <>
//             <p><strong>Representative:</strong> {selectedCluster.representative}</p>
//             <p><strong>Member Count:</strong> {selectedCluster.member_count}</p>
//             <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
//               {selectedCluster.members.map((m, idx) => <Tag key={idx}>{m}</Tag>)}
//             </div>
//           </>
//         )}
//       </Modal>
//     </div>
//   );
// };

// export default PreviousAnalysisPage;


// PreviousAnalysisPage.jsx
import React, { useEffect, useState } from 'react';
import { Card, Table, Tag, Progress, Row, Col, Alert, Button, Spin, Modal, message } from 'antd';
import { DownloadOutlined, EyeOutlined, ClusterOutlined, BarChartOutlined } from '@ant-design/icons';
import { saveAs } from 'file-saver';
import ClusterChart from '../components/ClusterChart';
import { getAnalysisResults } from '../services/api';
import { useParams, useNavigate } from 'react-router-dom';

/**
 * PreviousAnalysisPage
 * - Loads saved analysis by ID and displays it using the same layout/controls as ResultsPage
 * - Normalizes different cluster formats (array-of-arrays or array-of-objects)
 * - Uses PCA PC1/PC2 if available for visualization, otherwise falls back to numeric columns
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
      // backend returns document with `raw` field - normalize to top-level shape
      const raw = doc?.raw ? doc.raw : doc;
      setAnalysisResults(raw);
    } catch (err) {
      console.error('Could not load previous analysis', err);
      message.error('Could not load previous analysis');
    } finally {
      setLoading(false);
    }
  };

  // ---------- Normalization helpers ----------
  const normalizeClusters = (clustersRaw) => {
    if (!clustersRaw) return [];
    // If clustersRaw is array-of-objects already, assume correct
    if (clustersRaw.length > 0 && typeof clustersRaw[0] === 'object' && !Array.isArray(clustersRaw[0])) {
      // ensure numeric cluster_id and member_count are present
      return clustersRaw.map((c, i) => ({
        cluster_id: c.cluster_id ?? (i + 1),
        members: c.members ?? (c.member_list ?? []),
        member_count: c.member_count ?? (c.members ? c.members.length : 0),
        representative: c.representative ?? (c.members && c.members[0]) ?? '-',
        reduction_potential: c.reduction_potential ?? 0
      }));
    }
    // If array-of-arrays: [[m1,m2], [m3,m4], ...]
    if (clustersRaw.length > 0 && Array.isArray(clustersRaw[0])) {
      return clustersRaw.map((members, i) => ({
        cluster_id: i + 1,
        members,
        member_count: members.length,
        representative: members[0] || '-',
        reduction_potential: 0
      }));
    }
    // fallback empty
    return [];
  };

  const calculateStatistics = (results) => {
    if (!results) return { totalClusters: 0, similarPairs: 0, reductionPotential: 0 };
    const clustersRaw = results?.clustering?.clusters || [];
    const clusters = normalizeClusters(clustersRaw);
    const totalClusters = results?.clustering?.metrics?.n_clusters ?? clusters.length;
    const similarPairs = results?.bom_analysis?.similar_pairs?.length ?? 0;

    let reductionPotential = 0;
    if (clusters.length > 0) {
      const totalReduction = clusters.reduce((sum, c) => sum + (c.reduction_potential || 0), 0);
      reductionPotential = Math.round((totalReduction / clusters.length) * 100);
    }

    return { totalClusters, similarPairs, reductionPotential };
  };

  const prepareVisualizationConfig = (results) => {
    // prefer visualization_data with PC1/PC2 if present
    const vizData = results?.clustering?.visualization_data ?? [];
    const numericColumns = results?.clustering?.numeric_columns ?? [];

    if (vizData.length > 0 && ('PC1' in vizData[0] && 'PC2' in vizData[0])) {
      return { data: vizData, xKey: 'PC1', yKey: 'PC2' };
    }

    // fallback to numeric columns if they exist in vizData items
    if (vizData.length > 0 && numericColumns.length >= 2) {
      return { data: vizData, xKey: numericColumns[0], yKey: numericColumns[1] };
    }

    return { data: [], xKey: '', yKey: '' };
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
      const clusters = normalizeClusters(analysisResults?.clustering?.clusters || []);
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

      // Quote and escape CSV values
      const csvContent = rows.map(row => row.map(cell => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      saveAs(blob, `clusters-${analysisId || 'latest'}.csv`);
      message.success('Clusters exported successfully');
    } catch (error) {
      console.error(error);
      message.error('Failed to export clusters');
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

  // ---------- render logic ----------
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

  // Use normalized clusters and stats
  const clustersNormalized = normalizeClusters(analysisResults?.clustering?.clusters || []);
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

      <Card title="BOM Similarity" style={{ marginTop: 18 }}>
        <Table
          columns={similarityColumns}
          dataSource={analysisResults?.bom_analysis?.similar_pairs || []}
          pagination={false}
          rowKey={(r, i) => `${r.bom_a || 'a'}-${r.bom_b || 'b'}-${i}`}
        />
      </Card>

      {/* Replacement suggestions */}
      {analysisResults?.bom_analysis?.replacement_suggestions?.length > 0 && (
        <Card title="Replacement Suggestions" style={{ marginTop: 18 }}>
          {analysisResults.bom_analysis.replacement_suggestions.map((sugg, idx) => (
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
