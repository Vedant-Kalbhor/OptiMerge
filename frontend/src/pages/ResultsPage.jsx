import React, { useState, useEffect } from 'react';
import { Card, Table, Tag, Progress, Row, Col, Alert, Button, Spin, Modal, message } from 'antd';
import { DownloadOutlined, EyeOutlined, ClusterOutlined } from '@ant-design/icons';
import { saveAs } from 'file-saver';
import ClusterChart from '../components/ClusterChart';
import { getAnalysisResults, getWeldmentFiles, getBOMFiles } from '../services/api';
import { useParams, useNavigate } from 'react-router-dom';

const ResultsPage = () => {
  const [analysisResults, setAnalysisResults] = useState(null);
  const [loading, setLoading] = useState(true);
  const [clusterModalVisible, setClusterModalVisible] = useState(false);
  const [selectedCluster, setSelectedCluster] = useState(null);
  const [weldmentData, setWeldmentData] = useState([]);
  const { analysisId } = useParams();
  const navigate = useNavigate();

  useEffect(() => {
    loadAnalysisResults();
    loadWeldmentData();
  }, [analysisId]);

  const loadAnalysisResults = async () => {
    try {
      setLoading(true);
      if (analysisId) {
        // Fetch specific analysis results
        const response = await getAnalysisResults(analysisId);
        setAnalysisResults(response.data);
      } else {
        // For demo, try to load the latest analysis or show message
        message.info('No analysis selected. Run an analysis first.');
        navigate('/analysis');
      }
    } catch (error) {
      console.error('Error loading analysis results:', error);
      message.error('Failed to load analysis results');
    } finally {
      setLoading(false);
    }
  };

  const loadWeldmentData = async () => {
    try {
      const response = await getWeldmentFiles();
      if (response.data && response.data.length > 0) {
        // Get the actual weldment data for visualization
        // In a real app, you'd fetch the actual data points
        setWeldmentData([
          { assy_pn: 'A35631060', total_height_mm: 210.4, outer_dia_mm: 54.6 },
          { assy_pn: 'A35651785', total_height_mm: 210.4, outer_dia_mm: 50 },
          { assy_pn: 'A45611660', total_height_mm: 202, outer_dia_mm: 50 },
          { assy_pn: 'A35671107', total_height_mm: 202, outer_dia_mm: 50 },
          { assy_pn: 'A49611199', total_height_mm: 192.2, outer_dia_mm: 56 },
        ]);
      }
    } catch (error) {
      console.error('Error loading weldment data:', error);
    }
  };

  const handleExportReport = () => {
    try {
      const reportData = {
        analysis_id: analysisId,
        timestamp: new Date().toISOString(),
        results: analysisResults
      };
      
      const blob = new Blob([JSON.stringify(reportData, null, 2)], {
        type: 'application/json'
      });
      saveAs(blob, `bom-analysis-report-${analysisId || 'latest'}.json`);
      message.success('Report exported successfully');
    } catch (error) {
      message.error('Failed to export report');
    }
  };

  const handleExportClusters = () => {
    try {
      if (!analysisResults?.clustering?.clusters) {
        message.warning('No cluster data to export');
        return;
      }

      const csvContent = [
        ['Cluster ID', 'Member Count', 'Representative', 'Reduction Potential', 'Members'],
        ...analysisResults.clustering.clusters.map(cluster => [
          cluster.cluster_id,
          cluster.member_count,
          cluster.representative,
          (cluster.reduction_potential * 100).toFixed(1) + '%',
          cluster.members.join('; ')
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
          percent={Math.round(potential * 100)} 
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

  const similarityColumns = [
    {
      title: 'BOM A',
      dataIndex: 'bom_a',
      key: 'bom_a',
    },
    {
      title: 'BOM B',
      dataIndex: 'bom_b',
      key: 'bom_b',
    },
    {
      title: 'Similarity Score',
      dataIndex: 'similarity_score',
      key: 'similarity_score',
      render: (score) => (
        <Progress 
          percent={Math.round(score * 100)} 
          size="small" 
          status={score > 0.9 ? 'success' : score > 0.7 ? 'active' : 'exception'}
        />
      ),
    },
    {
      title: 'Common Components',
      dataIndex: 'common_components',
      key: 'common_components',
    },
  ];

  // Calculate overall statistics
  const calculateStatistics = () => {
    if (!analysisResults) return { totalClusters: 0, similarPairs: 0, reductionPotential: 0 };
    
    const totalClusters = analysisResults.clustering?.metrics?.n_clusters || 0;
    const similarPairs = analysisResults.bom_analysis?.similar_pairs?.length || 0;
    
    // Calculate overall reduction potential
    let reductionPotential = 0;
    if (analysisResults.clustering?.clusters) {
      const totalReduction = analysisResults.clustering.clusters.reduce(
        (sum, cluster) => sum + cluster.reduction_potential, 0
      );
      reductionPotential = totalReduction / analysisResults.clustering.clusters.length;
    }
    
    return {
      totalClusters,
      similarPairs,
      reductionPotential: Math.round(reductionPotential * 100)
    };
  };

  const stats = calculateStatistics();

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '50px' }}>
        <Spin size="large" />
        <p>Loading analysis results...</p>
      </div>
    );
  }

  if (!analysisResults) {
    return (
      <div style={{ textAlign: 'center', padding: '50px' }}>
        <Alert
          message="No Analysis Results Found"
          description="Please run an analysis first to see results here."
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
      <h1>Analysis Results</h1>
      
      <Alert
        message="Analysis Complete"
        description="The dimensional clustering and BOM similarity analysis have been completed successfully."
        type="success"
        showIcon
        style={{ marginBottom: 20 }}
        action={
          <Button size="small" icon={<DownloadOutlined />} onClick={handleExportReport}>
            Export Report
          </Button>
        }
      />

      <Row gutter={16} style={{ marginBottom: 20 }}>
        <Col span={8}>
          <Card>
            <Statistic
              title="Total Clusters"
              value={stats.totalClusters}
              prefix={<ClusterOutlined />}
            />
          </Card>
        </Col>
        <Col span={8}>
          <Card>
            <Statistic
              title="Similar BOM Pairs"
              value={stats.similarPairs}
            />
          </Card>
        </Col>
        <Col span={8}>
          <Card>
            <Statistic
              title="Overall Reduction Potential"
              value={stats.reductionPotential}
              suffix="%"
            />
          </Card>
        </Col>
      </Row>

      <Row gutter={16}>
        <Col span={12}>
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
              dataSource={analysisResults.clustering?.clusters || []}
              pagination={false}
              size="small"
              rowKey="cluster_id"
              locale={{ emptyText: 'No clustering results available' }}
            />
          </Card>
        </Col>
        
        <Col span={12}>
          <Card title="Cluster Visualization">
            <div className="cluster-visualization">
              {weldmentData.length > 0 ? (
                <ClusterChart 
                  data={weldmentData}
                  xKey="total_height_mm"
                  yKey="outer_dia_mm"
                />
              ) : (
                <div style={{ textAlign: 'center', padding: '50px' }}>
                  <p>No weldment data available for visualization</p>
                </div>
              )}
            </div>
          </Card>
        </Col>
      </Row>

      {analysisResults.bom_analysis?.similar_pairs && analysisResults.bom_analysis.similar_pairs.length > 0 && (
        <Card title="BOM Similarity Analysis" style={{ marginTop: 20 }}>
          <Table
            columns={similarityColumns}
            dataSource={analysisResults.bom_analysis.similar_pairs}
            pagination={false}
            rowKey={(record) => `${record.bom_a}-${record.bom_b}`}
          />
        </Card>
      )}

      {analysisResults.bom_analysis?.replacement_suggestions && 
       analysisResults.bom_analysis.replacement_suggestions.length > 0 && (
        <Card title="Replacement Suggestions" style={{ marginTop: 20 }}>
          {analysisResults.bom_analysis.replacement_suggestions.map((suggestion, index) => (
            <Alert
              key={index}
              message={suggestion.suggestion}
              description={`Confidence: ${Math.round(suggestion.confidence * 100)}% | Potential Savings: ${suggestion.potential_savings} components`}
              type="info"
              showIcon
              style={{ marginBottom: 10 }}
            />
          ))}
        </Card>
      )}

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
            <p><strong>Reduction Potential:</strong> {Math.round(selectedCluster.reduction_potential * 100)}%</p>
            <p><strong>Members:</strong></p>
            <div style={{ maxHeight: '200px', overflowY: 'auto', border: '1px solid #d9d9d9', padding: '8px' }}>
              {selectedCluster.members.map((member, index) => (
                <Tag key={index} style={{ margin: '2px' }}>{member}</Tag>
              ))}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

// Helper Statistic component
const Statistic = ({ title, value, suffix, prefix }) => (
  <div style={{ textAlign: 'center' }}>
    <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#1890ff' }}>
      {prefix && <span style={{ marginRight: '8px' }}>{prefix}</span>}
      {value}{suffix}
    </div>
    <div style={{ color: '#666', marginTop: '8px' }}>{title}</div>
  </div>
);

export default ResultsPage;