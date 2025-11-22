import React, { useState, useEffect } from 'react';
import { Card, Form, Input, Select, Button, Row, Col, message, Slider } from 'antd';
import { PlayCircleOutlined } from '@ant-design/icons';
import { getWeldmentFiles, getBOMFiles, analyzeDimensionalClustering, analyzeBOMSimilarity } from '../services/api';
import { useNavigate } from 'react-router-dom';

const { Option } = Select;

const AnalysisPage = () => {
  const [form] = Form.useForm();
  const [bomForm] = Form.useForm();
  const [weldmentFiles, setWeldmentFiles] = useState([]);
  const [bomFiles, setBomFiles] = useState([]);
  const [clusteringLoading, setClusteringLoading] = useState(false);
  const [bomLoading, setBomLoading] = useState(false);
  const [analysisResults, setAnalysisResults] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    loadFiles();
  }, []);

  const loadFiles = async () => {
    try {
      const [weldmentResponse, bomResponse] = await Promise.all([
        getWeldmentFiles(),
        getBOMFiles()
      ]);
      setWeldmentFiles(weldmentResponse.data || []);
      setBomFiles(bomResponse.data || []);
    } catch (error) {
      console.error('Failed to load files:', error);
      message.error('Failed to load files');
    }
  };

  const onDimensionalAnalysis = async (values) => {
    try {
      setClusteringLoading(true);
      console.log('Starting dimensional clustering with values:', values);

      const response = await analyzeDimensionalClustering(values);
      console.log('Dimensional clustering response:', response.data);

      setAnalysisResults(response.data);
      message.success('Dimensional analysis completed successfully');

      // Navigate to clustering-only results page
      navigate(`/results/clustering/${response.data.analysis_id}`, {
        state: {
          analysisResults: {
            clustering: response.data.clustering_result
          }
        }
      });
    } catch (error) {
      console.error('Dimensional analysis error:', error);
      const errorMessage = error.response?.data?.detail || error.message || 'Analysis failed';
      message.error(`Dimensional analysis failed: ${errorMessage}`);
    } finally {
      setClusteringLoading(false);
    }
  };

  const onBOMAnalysis = async (values) => {
    try {
      setBomLoading(true);
      console.log('Starting BOM analysis with values:', values);

      const response = await analyzeBOMSimilarity(values);
      console.log('BOM analysis response:', response.data);

      setAnalysisResults(response.data);
      message.success('BOM analysis completed successfully');

      // Navigate to BOM-only results page
      navigate(`/results/bom/${response.data.analysis_id}`, {
        state: {
          analysisResults: {
            bom_analysis: response.data.bom_analysis_result
          }
        }
      });
    } catch (error) {
      console.error('BOM analysis error:', error);
      const errorMessage = error.response?.data?.detail || error.message || 'Analysis failed';
      message.error(`BOM analysis failed: ${errorMessage}`);
    } finally {
      setBomLoading(false);
    }
  };

  const hasWeldmentFiles = weldmentFiles.length > 0;
  const hasBomFiles = bomFiles.length > 0;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h1>Analysis</h1>
      </div>

      {!hasWeldmentFiles && !hasBomFiles && (
        <Card style={{ marginBottom: 20 }}>
          <div style={{ textAlign: 'center', padding: '20px' }}>
            <h3>No Files Uploaded</h3>
            <p>Please upload weldment and BOM files first to run analysis.</p>
            <Button type="primary" onClick={() => navigate('/upload')}>
              Go to Upload
            </Button>
          </div>
        </Card>
      )}

      <Row gutter={16}>
        <Col span={12}>
          <Card title="Dimensional Clustering Analysis" loading={clusteringLoading}>
            {!hasWeldmentFiles ? (
              <div style={{ textAlign: 'center', padding: '20px' }}>
                <p>No weldment files uploaded.</p>
                <Button type="primary" onClick={() => navigate('/upload')}>
                  Upload Weldment Files
                </Button>
              </div>
            ) : (
              <Form
                form={form}
                layout="vertical"
                onFinish={onDimensionalAnalysis}
                initialValues={{
                  clustering_method: "kmeans",
                  tolerance: 0.1
                }}
              >
                <Form.Item
                  name="weldment_file_id"
                  label="Weldment File"
                  rules={[{ required: true, message: 'Please select a weldment file' }]}
                >
                  <Select placeholder="Select weldment file">
                    {weldmentFiles.map(file => (
                      <Option key={file.file_id} value={file.file_id}>
                        {file.filename} ({file.record_count} records)
                      </Option>
                    ))}
                  </Select>
                </Form.Item>

                <Form.Item name="clustering_method" label="Clustering Method">
                  <Select>
                    <Option value="kmeans">K-Means</Option>
                    <Option value="hierarchical">Hierarchical</Option>
                    <Option value="dbscan">DBSCAN</Option>
                  </Select>
                </Form.Item>

                <Form.Item
                  name="n_clusters"
                  label="Number of Clusters (optional)"
                  help="Leave empty for automatic cluster detection (2 ≤ k ≤ number of data points)"
                >
                  <Input
                    type="number"
                    min={2}
                    placeholder="Auto-detect if empty"
                  />
                </Form.Item>

                <Form.Item>
                  <Button
                    type="primary"
                    htmlType="submit"
                    icon={<PlayCircleOutlined />}
                    block
                    size="large"
                    loading={clusteringLoading}
                  >
                    Run Dimensional Clustering
                  </Button>
                </Form.Item>
              </Form>
            )}
          </Card>
        </Col>

        <Col span={12}>
          <Card title="BOM Similarity Analysis" loading={bomLoading}>
            {!hasBomFiles ? (
              <div style={{ textAlign: 'center', padding: '20px' }}>
                <p>No BOM files uploaded.</p>
                <Button type="primary" onClick={() => navigate('/upload')}>
                  Upload BOM Files
                </Button>
              </div>
            ) : (
              <Form
                form={bomForm}
                layout="vertical"
                onFinish={onBOMAnalysis}
                initialValues={{
                  similarity_method: "jaccard",
                  threshold: 0.8
                }}
              >
                <Form.Item
                  name="bom_file_id"
                  label="BOM File"
                  rules={[{ required: true, message: 'Please select a BOM file' }]}
                >
                  <Select placeholder="Select BOM file">
                    {bomFiles.map(file => (
                      <Option key={file.file_id} value={file.file_id}>
                        {file.filename} ({file.record_count} records)
                      </Option>
                    ))}
                  </Select>
                </Form.Item>

                <Form.Item name="similarity_method" label="Similarity Method">
                  <Select>
                    <Option value="jaccard">Jaccard Similarity</Option>
                    <Option value="cosine">Cosine Similarity</Option>
                    <Option value="weighted">Weighted Similarity</Option>
                  </Select>
                </Form.Item>

                <Form.Item name="threshold" label="Similarity Threshold" help="Higher threshold shows only very similar BOMs">
                  <Slider
                    min={0.1}
                    max={1}
                    step={0.1}
                    marks={{
                      0.1: '0.1',
                      0.5: '0.5',
                      1: '1'
                    }}
                  />
                </Form.Item>

                <Form.Item>
                  <Button
                    type="primary"
                    htmlType="submit"
                    icon={<PlayCircleOutlined />}
                    block
                    size="large"
                    loading={bomLoading}
                  >
                    Run BOM Similarity Analysis
                  </Button>
                </Form.Item>
              </Form>
            )}
          </Card>
        </Col>
      </Row>

      {/* Debug: Show raw results if available */}
      {analysisResults && process.env.NODE_ENV === 'development' && (
        <Card title="Raw Analysis Results (Debug)" style={{ marginTop: 20 }}>
          <details>
            <summary>Click to view raw API response</summary>
            <pre style={{ fontSize: '10px', maxHeight: '300px', overflow: 'auto' }}>
              {JSON.stringify(analysisResults, null, 2)}
            </pre>
          </details>
        </Card>
      )}
    </div>
  );
};

export default AnalysisPage;
