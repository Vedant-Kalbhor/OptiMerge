import React, { useState, useEffect } from 'react';
import { Card, Form, Input, Select, Button, Row, Col, message, Slider, Table } from 'antd';
import { PlayCircleOutlined } from '@ant-design/icons';
import { getWeldmentFiles, getBOMFiles, analyzeDimensionalClustering, analyzeBOMSimilarity } from '../services/api';
import { useNavigate } from 'react-router-dom';

const { Option } = Select;

const AnalysisPage = () => {
  const [form] = Form.useForm();
  const [bomForm] = Form.useForm();
  const [weldmentFiles, setWeldmentFiles] = useState([]);
  const [bomFiles, setBomFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [analysisResults, setAnalysisResults] = useState(null);

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

  // const onDimensionalAnalysis = async (values) => {
  //   try {
  //     setLoading(true);
  //     const response = await analyzeDimensionalClustering(values);
  //     setAnalysisResults(response.data);
  //     message.success('Dimensional analysis completed successfully');
  //   } catch (error) {
  //     message.error(`Analysis failed: ${error.response?.data?.detail || error.message}`);
  //   } finally {
  //     setLoading(false);
  //   }
  // };

  // const onBOMAnalysis = async (values) => {
  //   try {
  //     setLoading(true);
  //     const response = await analyzeBOMSimilarity(values);
  //     setAnalysisResults(response.data);
  //     message.success('BOM analysis completed successfully');
  //   } catch (error) {
  //     message.error(`Analysis failed: ${error.response?.data?.detail || error.message}`);
  //   } finally {
  //     setLoading(false);
  //   }
  // };
  
  
  // Add this import
// import { useNavigate } from 'react-router-dom';

// Inside the AnalysisPage component:
  const navigate = useNavigate();

  // Update the analysis functions:
  const onDimensionalAnalysis = async (values) => {
    try {
      setLoading(true);
      const response = await analyzeDimensionalClustering(values);
      setAnalysisResults(response.data);
      message.success('Dimensional analysis completed successfully');
      
      // Navigate to results page with the analysis ID
      navigate(`/results/${response.data.analysis_id}`);
    } catch (error) {
      message.error(`Analysis failed: ${error.response?.data?.detail || error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const onBOMAnalysis = async (values) => {
    try {
      setLoading(true);
      const response = await analyzeBOMSimilarity(values);
      setAnalysisResults(response.data);
      message.success('BOM analysis completed successfully');
      
      // Navigate to results page with the analysis ID
      navigate(`/results/${response.data.analysis_id}`);
    } catch (error) {
      message.error(`Analysis failed: ${error.response?.data?.detail || error.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h1>Analysis</h1>
      
      <Row gutter={16}>
        <Col span={12}>
          <Card 
            title="Dimensional Clustering Analysis" 
            loading={loading}
            extra={
              <Button 
                type="primary" 
                icon={<PlayCircleOutlined />}
                onClick={() => form.submit()}
              >
                Run Analysis
              </Button>
            }
          >
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
              
              <Form.Item
                name="clustering_method"
                label="Clustering Method"
              >
                <Select>
                  <Option value="kmeans">K-Means</Option>
                  <Option value="hierarchical">Hierarchical</Option>
                  <Option value="dbscan">DBSCAN</Option>
                </Select>
              </Form.Item>
              
              <Form.Item
                name="n_clusters"
                label="Number of Clusters (optional)"
              >
                <Input type="number" min={2} max={20} />
              </Form.Item>
              
              <Form.Item
                name="tolerance"
                label="Tolerance"
              >
                <Slider
                  min={0.01}
                  max={1}
                  step={0.01}
                  marks={{
                    0.01: '0.01',
                    0.5: '0.5',
                    1: '1'
                  }}
                />
              </Form.Item>
            </Form>
          </Card>
        </Col>
        
        <Col span={12}>
          <Card 
            title="BOM Similarity Analysis"
            loading={loading}
            extra={
              <Button 
                type="primary" 
                icon={<PlayCircleOutlined />}
                onClick={() => bomForm.submit()}
              >
                Run Analysis
              </Button>
            }
          >
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
              
              <Form.Item
                name="similarity_method"
                label="Similarity Method"
              >
                <Select>
                  <Option value="jaccard">Jaccard Similarity</Option>
                  <Option value="cosine">Cosine Similarity</Option>
                  <Option value="weighted">Weighted Similarity</Option>
                </Select>
              </Form.Item>
              
              <Form.Item
                name="threshold"
                label="Similarity Threshold"
              >
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
            </Form>
          </Card>
        </Col>
      </Row>
      
      {analysisResults && (
        <Card title="Analysis Results" style={{ marginTop: 20 }}>
          <pre>{JSON.stringify(analysisResults, null, 2)}</pre>
        </Card>
      )}
    </div>
  );
};

export default AnalysisPage;