// src/pages/AnalysisPage.jsx
import React, { useEffect, useRef, useState } from 'react';
import {
  Card, Form, Input, Select, Button, Row, Col, message, Slider
} from 'antd';
import { PlayCircleOutlined } from '@ant-design/icons';
import {
  getWeldmentFiles, getBOMFiles, getPipeFiles,
  analyzeDimensionalClustering, analyzeBOMSimilarity, analyzeWeldmentPairwise, analyzePipePairwise,
  getBendFiles, analyzeBendPairwise,
  getCustomFiles, getCustomAnalyses, analyzeCustomPairwise
} from '../services/api';
import { useNavigate, useLocation } from 'react-router-dom';

const { Option } = Select;

const AnalysisPage = () => {
  const [form] = Form.useForm(); // clustering form
  const [bomForm] = Form.useForm(); // bom similarity form
  const [weldmentForm] = Form.useForm(); // weldment pairwise form
  const [pipeForm] = Form.useForm(); // pipe pairwise form
  const [bendForm] = Form.useForm(); // bend pairwise form
  const [customForm] = Form.useForm(); // custom pairwise form

  const [weldmentFiles, setWeldmentFiles] = useState([]);
  const [bomFiles, setBomFiles] = useState([]);
  const [pipeFiles, setPipeFiles] = useState([]);
  const [bendFiles, setBendFiles] = useState([]);
  const [customFiles, setCustomFiles] = useState([]);
  const [customTemplates, setCustomTemplates] = useState([]);

  const [clusteringLoading, setClusteringLoading] = useState(false);
  const [bomLoading, setBomLoading] = useState(false);
  const [weldmentLoading, setWeldmentLoading] = useState(false);
  const [pipeLoading, setPipeLoading] = useState(false);
  const [bendLoading, setBendLoading] = useState(false);
  const [customLoading, setCustomLoading] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const autoRunRef = useRef(false);
  const smartUpload = location.state?.smartUpload;

  useEffect(() => {
    loadFiles();
  }, []);

  useEffect(() => {
    if (!smartUpload || autoRunRef.current) {
      return;
    }

    const runSmartAnalysis = async () => {
      autoRunRef.current = true;

      try {
        if (smartUpload.type === 'pipe') {
          const values = {
            pipe_file_id: smartUpload.fileId,
            mode: 'xyz_only',
            threshold: 0
          };
          pipeForm.setFieldsValue(values);
          await onPipeComparison(values);
          return;
        }

        if (smartUpload.type === 'bom') {
          const values = {
            bom_file_id: smartUpload.fileId,
            similarity_method: 'jaccard',
            threshold: 0.8
          };
          bomForm.setFieldsValue(values);
          await onBOMAnalysis(values);
          return;
        }

        if (smartUpload.type === 'weldment') {
          const values = {
            weldment_file_id: smartUpload.fileId,
            threshold: 0.3,
            tolerance: 1e-6,
            include_self: false
          };
          weldmentForm.setFieldsValue(values);
          await onWeldmentComparison(values);
        }

        if (smartUpload.type === 'bend') {
          const values = {
            bend_file_id: smartUpload.fileId
          };

          bendForm.setFieldsValue(values);
          await onBendComparison(values);
          return;
        }

        if (smartUpload.type === 'custom') {
          const values = {
            custom_file_id: smartUpload.fileId,
            template_id: smartUpload.templateId,
            threshold: smartUpload.threshold ?? 75
          };
          customForm.setFieldsValue(values);
          await onCustomAnalysis(values);
          return;
        }
      } catch (error) {
        console.error('Smart auto-run failed:', error);
        message.error('Automatic analysis could not be completed. You can still run it manually.');
      }
    };

    runSmartAnalysis();
  }, [smartUpload]);

  const loadFiles = async () => {
    try {
      const [weldmentResponse, bomResponse, pipeResponse, bendResponse, customFilesResponse, customTemplatesResponse] = await Promise.all([
        getWeldmentFiles(),
        getBOMFiles(),
        getPipeFiles(),
        getBendFiles(),
        getCustomFiles(),
        getCustomAnalyses()
      ]);
      setWeldmentFiles(weldmentResponse.data || []);
      setBomFiles(bomResponse.data || []);
      setPipeFiles(pipeResponse.data || []);
      setBendFiles(bendResponse?.data || []);
      setCustomFiles(customFilesResponse?.data || []);
      setCustomTemplates(customTemplatesResponse?.data || []);
    } catch (error) {
      console.error('Failed to load files:', error);
      message.error('Failed to load files');
    }
  };

  // ----- Clustering handler (unchanged other than names) -----
  const onDimensionalAnalysis = async (values) => {
    try {
      setClusteringLoading(true);
      console.log('Starting dimensional clustering with values:', values);

      const response = await analyzeDimensionalClustering(values);
      console.log('Dimensional clustering response:', response.data);

      message.success('Dimensional analysis completed successfully');

      // Navigate to clustering results page
      navigate(`/results/clustering/${response.data.analysis_id}`, {
        state: {
          analysisResults: {
            clustering: response.data.clustering_result,
            bom_analysis: response.data.bom_analysis_result
          },
          source_file: response.data.source_file
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

  // ----- BOM similarity handler (unchanged) -----
  const onBOMAnalysis = async (values) => {
    try {
      setBomLoading(true);
      console.log('Starting BOM analysis with values:', values);

      const response = await analyzeBOMSimilarity(values);
      console.log('BOM analysis response:', response.data);

      message.success('BOM analysis completed successfully');

      // Navigate to BOM results page
      navigate(`/results/bom/${response.data.analysis_id}`, {
        state: {
          analysisResults: {
            clustering: response.data.clustering_result,
            bom_analysis: response.data.bom_analysis_result
          },
          source_file: response.data.source_file
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

  // ----- NEW: Weldment Pairwise (one-to-one) handler -----
  const onWeldmentComparison = async (values) => {
    try {
      setWeldmentLoading(true);
      console.log('Starting weldment pairwise comparison with values:', values);

      // Build payload expected by backend
      const payload = {
        weldment_file_id: values.weldment_file_id,
        threshold: values.threshold ?? 0.3, // frontend slider is 0.1 - 1.0, backend accepts 0-1 or 0-100
        tolerance: values.tolerance ?? 0.000001,
        include_self: !!values.include_self
      };

      const response = await analyzeWeldmentPairwise(payload);
      console.log('Weldment pairwise response:', response.data);

      message.success('Weldment pairwise comparison completed successfully');

      // Navigate to weldment results page
      navigate(`/results/weldment/${response.data.analysis_id}`, {
        state: {
          analysisResults: {
            weldment_pairwise: response.data.weldment_pairwise_result,
            clustering: response.data.clustering_result,
            bom_analysis: response.data.bom_analysis_result
          },
          source_file: response.data.source_file
        }
      });
    } catch (error) {
      console.error('Weldment pairwise error:', error);
      const errorMessage = error.response?.data?.detail || error.message || 'Weldment comparison failed';
      message.error(`Weldment comparison failed: ${errorMessage}`);
    } finally {
      setWeldmentLoading(false);
    }
  };

  // ----- NEW: Pipe Pairwise handler -----
  const onPipeComparison = async (values) => {
    try {
      setPipeLoading(true);
      console.log('Starting pipe pairwise comparison with values:', values);

      const payload = {
        pipe_file_id: values.pipe_file_id,
        mode: values.mode || 'xyz_only',
        threshold: values.threshold ?? 0
      };

      const response = await analyzePipePairwise(payload);
      console.log('Pipe pairwise response:', response.data);

      message.success('Pipe pairwise comparison completed successfully');

      // Navigate to pipe results page
      navigate(`/results/pipes/${response.data.analysis_id}`, {
        state: {
          analysisResults: {
            pipe_pairwise: response.data.pipe_pairwise_result
          },
          source_file: response.data.source_file
        }
      });
    } catch (error) {
      console.error('Pipe pairwise error:', error);
      const errorMessage = error.response?.data?.detail || error.message || 'Pipe comparison failed';
      message.error(`Pipe comparison failed: ${errorMessage}`);
    } finally {
      setPipeLoading(false);
    }
  };

  const onBendComparison = async (values) => {
  try {
    setBendLoading(true);

    console.log(
      'Starting bend pairwise analysis:',
      values
    );

    const payload = {
      bend_file_id: values.bend_file_id
    };

    const response = await analyzeBendPairwise(
      payload
    );

    console.log(
      'Bend analysis response:',
      response.data
    );

    message.success(
      'Bend/Snap analysis completed successfully'
    );

    navigate(
      `/results/bends/${response.data.analysis_id}`,
      {
        state: {
          analysisResults: {
            bend_pairwise:
              response.data.bend_pairwise_result
          },
          source_file:
            response.data.source_file
        }
      }
    );

  } catch (error) {
    console.error(
      'Bend analysis error:',
      error
    );

    const errorMessage =
      error.response?.data?.detail ||
      error.message ||
      'Bend analysis failed';

    message.error(
      `Bend analysis failed: ${errorMessage}`
    );

  } finally {
    setBendLoading(false);
  }
};

  const onCustomAnalysis = async (values) => {
    try {
      setCustomLoading(true);
      const response = await analyzeCustomPairwise(values);
      message.success('Custom pairwise analysis completed successfully');
      navigate(`/results/custom/${response.data.analysis_id}`, {
        state: {
          analysisResults: {
            custom_analysis: response.data.custom_analysis_result,
            template: response.data.template
          },
          source_file: response.data.source_file
        }
      });
    } catch (error) {
      console.error('Custom analysis error:', error);
      const errorMessage =
        error.response?.data?.detail ||
        error.message ||
        'Custom analysis failed';
      message.error(`Custom analysis failed: ${errorMessage}`);
    } finally {
      setCustomLoading(false);
    }
  };
  const hasWeldmentFiles = weldmentFiles.length > 0;
  const hasBomFiles = bomFiles.length > 0;
  const hasPipeFiles = pipeFiles.length > 0;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h1>Analysis</h1>
      </div>

      {!hasWeldmentFiles && !hasBomFiles && !hasPipeFiles && (
        <Card style={{ marginBottom: 20 }}>
          <div style={{ textAlign: 'center', padding: '20px' }}>
            <h3>No Files Uploaded</h3>
            <p>Please upload weldment, BOM, or Pipe files first to run analysis.</p>
            <Button type="primary" onClick={() => navigate('/upload')}>
              Go to Upload
            </Button>
          </div>
        </Card>
      )}

      <Row gutter={16}>
        {/* Dimensional Clustering */}
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

                <Form.Item name="n_clusters" label="Number of Clusters (optional)" help="Leave empty for automatic detection">
                  <Input type="number" min={2} placeholder="Auto-detect if empty" />
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

        {/* BOM Similarity */}
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
                  </Select>
                </Form.Item>

                <Form.Item name="threshold" label="Similarity Threshold" help="Higher threshold shows only very similar BOMs">
                  <Slider
                    min={0.1}
                    max={1}
                    step={0.1}
                    marks={{ 0.1: '0.1', 0.5: '0.5', 1: '1' }}
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

      <Row gutter={16} style={{ marginTop: 16 }}>
        {/* Weldment One-to-One Comparison */}
        <Col span={12}>
          <Card title="Weldment File One to One Comparison" loading={weldmentLoading}>
            {!hasWeldmentFiles ? (
              <div style={{ textAlign: 'center', padding: '20px' }}>
                <p>No weldment files uploaded.</p>
                <Button type="primary" onClick={() => navigate('/upload')}>
                  Upload Weldment Files
                </Button>
              </div>
            ) : (
              <Form
                form={weldmentForm}
                layout="vertical"
                onFinish={onWeldmentComparison}
                initialValues={{
                  threshold: 0.3,
                  tolerance: 1e-6,
                  include_self: false
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

                <Form.Item name="threshold" label="Match Threshold (0.1 - 1.0)">
                  <Slider
                    min={0.1}
                    max={1}
                    step={0.1}
                    marks={{ 0.1: '0.1', 0.5: '0.5', 1: '1' }}
                  />
                </Form.Item>

                <Form.Item>
                  <Button
                    type="primary"
                    htmlType="submit"
                    icon={<PlayCircleOutlined />}
                    block
                    size="large"
                    loading={weldmentLoading}
                  >
                    Run Weldment One-to-One Comparison
                  </Button>
                </Form.Item>
              </Form>
            )}
          </Card>
        </Col>

        {/* NEW: Pipe Pairwise Similarity Analysis Card */}
        <Col span={12}>
          <Card title="Pipe Pairwise Similarity Analysis" loading={pipeLoading}>
            {!hasPipeFiles ? (
              <div style={{ textAlign: 'center', padding: '20px' }}>
                <p>No pipe files uploaded.</p>
                <Button type="primary" onClick={() => navigate('/upload')}>
                  Upload Pipe Files
                </Button>
              </div>
            ) : (
              <Form
                form={pipeForm}
                layout="vertical"
                onFinish={onPipeComparison}
                initialValues={{
                  mode: "xyz_only",
                  threshold: 0
                }}
              >
                <Form.Item
                  name="pipe_file_id"
                  label="Pipe Dimensions File"
                  rules={[{ required: true, message: 'Please select a pipe file' }]}
                >
                  <Select placeholder="Select pipe file">
                    {pipeFiles.map(file => (
                      <Option key={file.file_id} value={file.file_id}>
                        {file.filename} ({file.record_count} records)
                      </Option>
                    ))}
                  </Select>
                </Form.Item>

                <Form.Item
                  name="mode"
                  label="Comparison Mode"
                  help="XYZ Only = average of X,Y,Z. XYZ + Bends = average of Bends,X,Y,Z."
                >
                  <Select>
                    <Option value="xyz_only">XYZ Only Comparison</Option>
                    <Option value="xyz_bends">XYZ + Bends Comparison</Option>
                  </Select>
                </Form.Item>

                <Form.Item
                  name="threshold"
                  label="Match Threshold (0% - 100%)"
                  help="Filters output pairs to only show match % >= threshold"
                >
                  <Slider
                    min={0}
                    max={100}
                    step={5}
                    marks={{ 0: '0%', 25: '25%', 50: '50%', 75: '75%', 100: '100%' }}
                  />
                </Form.Item>

                <Form.Item>
                  <Button
                    type="primary"
                    htmlType="submit"
                    icon={<PlayCircleOutlined />}
                    block
                    size="large"
                    loading={pipeLoading}
                  >
                    Run Pipe Pairwise Analysis
                  </Button>
                </Form.Item>
              </Form>
            )}
          </Card>
        </Col>

        {/* Custom Pairwise Similarity Analysis */}
        <Col span={12} style={{ marginTop: 16 }}>
          <Card title="Custom Pairwise Similarity Analysis" loading={customLoading}>
            {customTemplates.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '20px' }}>
                <p>No custom analysis templates configured yet.</p>
                <Button type="primary" onClick={() => navigate('/custom-analysis')}>
                  Create Custom Template
                </Button>
              </div>
            ) : customFiles.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '20px' }}>
                <p>No custom data files uploaded.</p>
                <Button type="primary" onClick={() => navigate('/upload')}>
                  Upload Files
                </Button>
              </div>
            ) : (
              <Form
                form={customForm}
                layout="vertical"
                onFinish={onCustomAnalysis}
                initialValues={{
                  threshold: 75
                }}
              >
                <Form.Item
                  name="template_id"
                  label="Select Custom Template"
                  rules={[{ required: true, message: 'Please select a custom analysis template' }]}
                >
                  <Select placeholder="Choose template">
                    {customTemplates.map((t) => (
                      <Option key={t.id} value={t.id}>
                        {t.name} (Threshold: {t.default_threshold ?? 75}%)
                      </Option>
                    ))}
                  </Select>
                </Form.Item>

                <Form.Item
                  name="custom_file_id"
                  label="Select Uploaded File"
                  rules={[{ required: true, message: 'Please select an uploaded file' }]}
                >
                  <Select placeholder="Choose uploaded file">
                    {customFiles.map((file) => (
                      <Option key={file.file_id} value={file.file_id}>
                        {file.filename} ({file.record_count} records)
                      </Option>
                    ))}
                  </Select>
                </Form.Item>

                <Form.Item
                  name="threshold"
                  label="Match Threshold (0% - 100%)"
                  help="Filters output pairs to only show match % >= threshold"
                >
                  <Slider
                    min={0}
                    max={100}
                    step={5}
                    marks={{ 0: '0%', 25: '25%', 50: '50%', 75: '75%', 100: '100%' }}
                  />
                </Form.Item>

                <Form.Item>
                  <Button
                    type="primary"
                    htmlType="submit"
                    icon={<PlayCircleOutlined />}
                    block
                    size="large"
                    loading={customLoading}
                  >
                    Run Custom Pairwise Analysis
                  </Button>
                </Form.Item>
              </Form>
            )}
          </Card>
        </Col>

      </Row>
    </div>
  );
};

export default AnalysisPage;
