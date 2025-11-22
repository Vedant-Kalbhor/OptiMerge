import React, { useState, useEffect } from 'react';
import { Card, Row, Col, Statistic, Table, Progress, Alert, Button, Spin } from 'antd';
import { UploadOutlined, ClusterOutlined, BarChartOutlined, RocketOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { getWeldmentFiles, getBOMFiles, getAnalysisResults, getRecentAnalyses } from '../services/api';

const Dashboard = () => {
  const [stats, setStats] = useState({
    weldmentFiles: 0,
    bomFiles: 0,
    analyses: 0,
    potentialSavings: 0
  });
  const [recentAnalyses, setRecentAnalyses] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      const [weldmentResponse, bomResponse] = await Promise.all([
        getWeldmentFiles(),
        getBOMFiles()
      ]);

      // Calculate real statistics
      const weldmentFiles = weldmentResponse.data?.length || 0;
      const bomFiles = bomResponse.data?.length || 0;
      
      // Calculate potential savings based on actual data
      let potentialSavings = 0;
      if (weldmentFiles > 0) {
        // Simple calculation: more files = more potential for optimization
        potentialSavings = Math.min(50, weldmentFiles * 5 + bomFiles * 3);
      }

      setStats({
        weldmentFiles,
        bomFiles,
        analyses: recentAnalyses.length,
        potentialSavings
      });

      // Load recent analyses (in a real app, you'd have an endpoint for this)
      loadRecentAnalyses();
    } catch (error) {
      console.error('Error loading dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadRecentAnalyses = async () => {
    try {
      const response = await getRecentAnalyses();
      const data = response.data || [];

      const formatted = data.map(item => ({
        id: item.id,
        type: item.type,
        date: item.date,
        status: item.status
      }));

      setRecentAnalyses(formatted);
      setStats(prev => ({ ...prev, analyses: formatted.length }));
    } catch (err) {
      console.error("Error loading previous analyses:", err);
    }
  };

  const handleQuickAction = (action) => {
    switch (action) {
      case 'upload':
        navigate('/upload');
        break;
      case 'analysis':
        navigate('/analysis');
        break;
      case 'results':
        navigate('/results');
        break;
      default:
        break;
    }
  };

  const columns = [
    {
      title: 'Analysis ID',
      dataIndex: 'id',
      key: 'id',
      render: (id) => <span style={{ fontFamily: 'monospace' }}>{id}</span>
    },
    {
      title: 'Type',
      dataIndex: 'type',
      key: 'type',
    },
    {
      title: 'Date',
      dataIndex: 'date',
      key: 'date',
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (status) => (
        <span style={{ color: status === 'completed' ? '#52c41a' : '#faad14' }}>
          {status}
        </span>
      ),
    },
    {
      title: 'Action',
      key: 'action',
      render: (_, record) => (
        <Button 
          type="link" 
          size="small"
          // onClick={() => navigate(`/results/${record.id}`)}
          onClick={() => navigate(`/previous/${record.id}`)}
        >
          View Results
        </Button>
      ),
    },
  ];

  return (
    <div>
      <h1>Dashboard</h1>
      
      <Row gutter={16} style={{ marginBottom: 20 }}>
        <Col span={7}>
          <Card loading={loading}>
            <Statistic
              title="Weldment Files"
              value={stats.weldmentFiles}
              prefix={<UploadOutlined />}
            />
          </Card>
        </Col>
        <Col span={7}>
          <Card loading={loading}>
            <Statistic
              title="BOM Files"
              value={stats.bomFiles}
              prefix={<UploadOutlined />}
            />
          </Card>
        </Col>
        <Col span={7}>
          <Card>
            <Statistic
              title="Analyses"
              value={stats.analyses}
              prefix={<BarChartOutlined />}
            />
          </Card>
        </Col>
        {/* <Col span={6}>
          <Card>
            <Statistic
              title="Potential Savings"
              value={stats.potentialSavings}
              suffix="%"
              prefix={<ClusterOutlined />}
            />
          </Card>
        </Col> */}
      </Row>

      {stats.weldmentFiles === 0 && stats.bomFiles === 0 ? (
        <Alert
          message="Get Started with BOM Optimization"
          description="Upload your weldment dimensions and BOM files to start analyzing variant reduction opportunities."
          type="info"
          showIcon
          style={{ marginBottom: 20 }}
          action={
            <Button type="primary" onClick={() => handleQuickAction('upload')}>
              Upload Files
            </Button>
          }
        />
      ) : (
        <Alert
          message="Ready for Analysis"
          description={`You have ${stats.weldmentFiles} weldment files and ${stats.bomFiles} BOM files ready for analysis.`}
          type="success"
          showIcon
          style={{ marginBottom: 20 }}
          action={
            <Button type="primary" onClick={() => handleQuickAction('analysis')}>
              Run Analysis
            </Button>
          }
        />
      )}

      <Card title="Quick Actions" style={{ marginBottom: 20 }}>
        <Row gutter={16}>
          <Col span={8}>
            <Card
              size="small"
              title="Upload Files"
              actions={[
                <Button 
                  type="link" 
                  onClick={() => handleQuickAction('upload')}
                  icon={<UploadOutlined />}
                >
                  Go to Upload
                </Button>
              ]}
            >
              Upload weldment dimensions and BOM files for analysis
              {stats.weldmentFiles > 0 && (
                <div style={{ marginTop: 8 }}>
                  <Progress 
                    percent={100} 
                    size="small" 
                    status="success" 
                    format={() => `${stats.weldmentFiles} files`}
                  />
                </div>
              )}
            </Card>
          </Col>
          <Col span={8}>
            <Card
              size="small"
              title="Run Analysis"
              actions={[
                <Button 
                  type="link" 
                  onClick={() => handleQuickAction('analysis')}
                  icon={<RocketOutlined />}
                >
                  Run Analysis
                </Button>
              ]}
            >
              Perform dimensional clustering and BOM similarity analysis
              {stats.analyses > 0 && (
                <div style={{ marginTop: 8 }}>
                  <Progress 
                    percent={100} 
                    size="small" 
                    status="active" 
                    format={() => `${stats.analyses} completed`}
                  />
                </div>
              )}
            </Card>
          </Col>
          <Col span={8}>
            <Card
              size="small"
              title="View Results"
              actions={[
                <Button 
                  type="link" 
                  onClick={() => handleQuickAction('results')}
                  icon={<BarChartOutlined />}
                >
                  View Results
                </Button>
              ]}
            >
              Explore analysis results and optimization suggestions
              {stats.analyses > 0 && (
                <div style={{ marginTop: 8 }}>
                  <Progress 
                    percent={stats.potentialSavings} 
                    size="small" 
                    status="active" 
                    format={(percent) => `${percent}% savings`}
                  />
                </div>
              )}
            </Card>
          </Col>
        </Row>
      </Card>

      <Card title="Recent Analyses" loading={loading}>
        {recentAnalyses.length > 0 ? (
          <Table
            columns={columns}
            dataSource={recentAnalyses}
            pagination={false}
            size="small"
            rowKey="id"
          />
        ) : (
          <div style={{ textAlign: 'center', padding: '20px' }}>
            <p>No analyses run yet. Start by uploading files and running an analysis.</p>
            <Button type="primary" onClick={() => handleQuickAction('upload')}>
              Get Started
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
};

export default Dashboard;