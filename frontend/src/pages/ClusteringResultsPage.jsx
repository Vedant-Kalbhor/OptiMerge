import React, { useState, useEffect } from 'react';
import { Card, Table, Tag, Progress, Row, Col, Alert, Button, Spin, Modal, message } from 'antd';
import { DownloadOutlined, EyeOutlined, ClusterOutlined } from '@ant-design/icons';
import { saveAs } from 'file-saver';
import ClusterChart from '../components/ClusterChart';
import { getAnalysisResults } from '../services/api';
import { useParams, useNavigate, useLocation } from 'react-router-dom';

const ClusteringResultsPage = () => {
  const [clusteringResults, setClusteringResults] = useState(null);
  const [loading, setLoading] = useState(true);
  const [clusterModalVisible, setClusterModalVisible] = useState(false);
  const [selectedCluster, setSelectedCluster] = useState(null);
  const { analysisId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (location.state?.analysisResults?.clustering) {
      setClusteringResults(location.state.analysisResults.clustering);
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
      // backend may return an object with clustering under clustering_result or clustering
      const data = response.data;
      const clustering = data.clustering_result || data.clustering || data;
      setClusteringResults(clustering);
    } catch (error) {
      console.error('Error loading clustering results:', error);
      message.error('Failed to load clustering results');
    } finally {
      setLoading(false);
    }
  };

  const handleExportClusters = () => {
    try {
      const clusters = clusteringResults?.clusters || [];
      if (clusters.length === 0) {
        message.warning('No cluster data to export');
        return;
      }

      const csvContent = [
        ['Cluster ID', 'Member Count', 'Representative', 'Reduction Potential', 'Members'],
        ...clusters.map(cluster => [
          cluster.cluster_id,
          cluster.member_count,
          cluster.representative,
          (cluster.reduction_potential * 100).toFixed(1) + '%',
          (cluster.members || []).join('; ')
        ])
      ].map(row => row.join(',')).join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      saveAs(blob, `clusters-${analysisId || 'latest'}.csv`);
      message.success('Clusters exported successfully');
    } catch (error) {
      message.error('Failed to export clusters');
    }
  };

  const handleViewCluster = (cluster) => {
    setSelectedCluster(cluster);
    setClusterModalVisible(true);
  };

  const clusterColumns = [
    {
      title: 'Cluster ID',
      dataIndex: 'cluster_id',
      key: 'cluster_id',
    },
    {
      title: 'Member Count',
      dataIndex: 'member_count',
      key: 'member_count',
    },
    {
      title: 'Representative',
      dataIndex: 'representative',
      key: 'representative',
      render: (rep) => <Tag color="blue">{rep}</Tag>,
    },
    {
      title: 'Reduction Potential',
      dataIndex: 'reduction_potential',
      key: 'reduction_potential',
      render: (potential) => (
        <Progress
          percent={Math.round((potential || 0) * 100)}
          size="small"
          status="active"
        />
      ),
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_, record) => (
        <Button
          type="link"
          icon={<EyeOutlined />}
          onClick={() => handleViewCluster(record)}
        >
          View
        </Button>
      ),
    },
  ];

  const calculateStatistics = () => {
    if (!clusteringResults) return { totalClusters: 0, reductionPotential: 0 };

    const totalClusters = clusteringResults?.metrics?.n_clusters || (clusteringResults.clusters?.length || 0);

    let reductionPotential = 0;
    const clusters = clusteringResults.clusters || [];
    if (clusters.length > 0) {
      const totalReduction = clusters.reduce(
        (sum, cluster) => sum + (cluster.reduction_potential || 0), 0
      );
      reductionPotential = Math.round((totalReduction / clusters.length) * 100);
    }

    return {
      totalClusters,
      reductionPotential
    };
  };

  const stats = calculateStatistics();

  const getVisualizationData = () => {
    if (!clusteringResults?.visualization_data) return [];

    const vizData = clusteringResults.visualization_data;
    const numericColumns = clusteringResults.numeric_columns || [];

    if (numericColumns.length >= 2) {
      const xKey = numericColumns[0];
      const yKey = numericColumns[1];
      return {
        data: vizData,
        xKey,
        yKey
      };
    }

    return {
      data: [],
      xKey: '',
      yKey: ''
    };
  };

  const vizConfig = getVisualizationData();

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '50px' }}>
        <Spin size="large" />
        <p>Loading clustering results...</p>
      </div>
    );
  }

  if (!clusteringResults) {
    return (
      <div style={{ textAlign: 'center', padding: '50px' }}>
        <Alert
          message="No Clustering Results Found"
          description="Please run a dimensional clustering analysis first to see clustering results here."
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
      <h1>Clustering Results</h1>

      <Row gutter={16} style={{ marginBottom: 20 }}>
        <Col span={12}>
          <Card>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#1890ff' }}>
                <ClusterOutlined style={{ marginRight: 8 }} /> {stats.totalClusters}
              </div>
              <div style={{ color: '#666', marginTop: 8 }}>Total Clusters</div>
            </div>
          </Card>
        </Col>
        <Col span={12}>
          <Card>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#1890ff' }}>
                {stats.reductionPotential}%
              </div>
              <div style={{ color: '#666', marginTop: 8 }}>Overall Reduction Potential</div>
            </div>
          </Card>
        </Col>
      </Row>

      <Row gutter={16}>
        <Col span={16}>
          <Card
            title="Weldment Clusters"
            extra={
              <Button icon={<DownloadOutlined />} onClick={handleExportClusters}>
                Export Clusters
              </Button>
            }
          >
            <Table
              columns={clusterColumns}
              dataSource={clusteringResults.clusters || []}
              pagination={false}
              size="small"
              rowKey="cluster_id"
            />
          </Card>
        </Col>

        <Col span={8}>
          <Card title="Cluster Visualization">
            <div className="cluster-visualization" style={{ minHeight: 240 }}>
              {vizConfig.data && vizConfig.data.length > 0 ? (
                <ClusterChart
                  data={vizConfig.data}
                  xKey={vizConfig.xKey}
                  yKey={vizConfig.yKey}
                />
              ) : (
                <div style={{ textAlign: 'center', padding: '20px' }}>
                  <p>No visualization data available</p>
                  <p><small>Need at least 2 numeric dimensions for clustering visualization</small></p>
                </div>
              )}
            </div>
          </Card>
        </Col>
      </Row>

      {/* Cluster Details Modal */}
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
            <p><strong>Cluster ID:</strong> {selectedCluster.cluster_id}</p>
            <p><strong>Member Count:</strong> {selectedCluster.member_count}</p>
            <p><strong>Representative:</strong> <Tag color="blue">{selectedCluster.representative}</Tag></p>
            <p><strong>Reduction Potential:</strong> {Math.round((selectedCluster.reduction_potential || 0) * 100)}%</p>
            <p><strong>Members:</strong></p>
            <div style={{ maxHeight: '200px', overflowY: 'auto', border: '1px solid #d9d9d9', padding: '8px' }}>
              {(selectedCluster.members || []).map((member, index) => (
                <Tag key={index} style={{ margin: '2px' }}>{member}</Tag>
              ))}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default ClusteringResultsPage;
