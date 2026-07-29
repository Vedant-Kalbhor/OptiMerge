import React, { useState, useEffect } from 'react';
import { Upload, Button, Card, Row, Col, message, Table, Tag, Spin, Alert, Form, Input, Divider, Modal } from 'antd';
import { UploadOutlined, InboxOutlined, CheckCircleOutlined, FilePdfOutlined, RobotOutlined, EditOutlined } from '@ant-design/icons';
import { uploadWeldments, uploadBOMs, uploadPipes, getWeldmentFiles, getBOMFiles, getPipeFiles, healthCheck, extractDimensions } from '../services/api';
import DrawingExtractorModal from '../components/DrawingExtractorModal';

const { Dragger } = Upload;

const UploadPage = () => {
  const [weldmentFiles, setWeldmentFiles] = useState([]);
  const [bomFiles, setBomFiles] = useState([]);
  const [pipeFiles, setPipeFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [fileLoading, setFileLoading] = useState(false);
  const [serverStatus, setServerStatus] = useState('checking');
  const [pdfExtracting, setPdfExtracting] = useState(false);
  const [extractedDims, setExtractedDims] = useState(null);   // raw API result
  const [editableDims, setEditableDims] = useState({});        // user-editable fields
  const [dimModalOpen, setDimModalOpen] = useState(false);
  const [extractorOpen, setExtractorOpen] = useState(false);

  const checkServerHealth = async () => {
    try {
      await healthCheck();
      setServerStatus('healthy');
    } catch (error) {
      console.error('Server health check failed:', error);
      setServerStatus('unhealthy');
    }
  };

  const weldmentProps = {
    name: 'file',
    multiple: false,
    accept: '.xlsx,.xls,.csv',
    showUploadList: false,
    customRequest: async (options) => {
      const { file, onSuccess, onError } = options;
      
      try {
        setLoading(true);
        const formData = new FormData();
        formData.append('file', file);
        
        console.log('Uploading weldment file:', file.name);
        const response = await uploadWeldments(formData);
        
        onSuccess(response, file);
        message.success(`${file.name} uploaded successfully`);
        
        // Reload the file list
        await loadWeldmentFiles();
      } catch (error) {
        console.error('Upload error:', error);
        onError(error);
        const errorMessage = error.response?.data?.detail || error.message || 'Upload failed';
        message.error(`${file.name} upload failed: ${errorMessage}`);
      } finally {
        setLoading(false);
      }
    },
  };

  const bomProps = {
    name: 'file',
    multiple: false,
    accept: '.xlsx,.xls,.csv',
    showUploadList: false,
    customRequest: async (options) => {
      const { file, onSuccess, onError } = options;
      
      try {
        setLoading(true);
        const formData = new FormData();
        formData.append('file', file);
        
        console.log('Uploading BOM file:', file.name);
        const response = await uploadBOMs(formData);
        
        onSuccess(response, file);
        message.success(`${file.name} uploaded successfully`);
        
        // Reload the file list
        await loadBOMFiles();
      } catch (error) {
        console.error('Upload error:', error);
        onError(error);
        const errorMessage = error.response?.data?.detail || error.message || 'Upload failed';
        message.error(`${file.name} upload failed: ${errorMessage}`);
      } finally {
        setLoading(false);
      }
    },
  };

  const pipeProps = {
    name: 'file',
    multiple: false,
    accept: '.xlsx,.xls,.csv',
    showUploadList: false,
    customRequest: async (options) => {
      const { file, onSuccess, onError } = options;
      
      try {
        setLoading(true);
        const formData = new FormData();
        formData.append('file', file);
        
        console.log('Uploading Pipe file:', file.name);
        const response = await uploadPipes(formData);
        
        onSuccess(response, file);
        message.success(`${file.name} uploaded successfully`);
        
        await loadPipeFiles();
      } catch (error) {
        console.error('Pipe upload error:', error);
        onError(error);
        const errorMessage = error.response?.data?.detail || error.message || 'Upload failed';
        message.error(`${file.name} upload failed: ${errorMessage}`);
      } finally {
        setLoading(false);
      }
    },
  };

  const loadWeldmentFiles = async () => {
    try {
      setFileLoading(true);
      const response = await getWeldmentFiles();
      setWeldmentFiles(response.data || []);
    } catch (error) {
      console.error('Failed to load weldment files:', error);
      message.error('Failed to load weldment files');
    } finally {
      setFileLoading(false);
    }
  };

  const loadBOMFiles = async () => {
    try {
      setFileLoading(true);
      const response = await getBOMFiles();
      setBomFiles(response.data || []);
    } catch (error) {
      console.error('Failed to load BOM files:', error);
      message.error('Failed to load BOM files');
    } finally {
      setFileLoading(false);
    }
  };

  const loadPipeFiles = async () => {
    try {
      setFileLoading(true);
      const response = await getPipeFiles();
      setPipeFiles(response.data || []);
    } catch (error) {
      console.error('Failed to load pipe files:', error);
      message.error('Failed to load pipe files');
    } finally {
      setFileLoading(false);
    }
  };

  // ── PDF dimension extraction ──────────────────────────────────────────────
  const handlePdfExtract = async (file) => {
    try {
      setPdfExtracting(true);
      const formData = new FormData();
      formData.append('file', file);
      const response = await extractDimensions(formData);
      const result = response.data;

      if (result.status === 'error') {
        message.error(`Extraction failed: ${result.error}`);
        return;
      }

      setExtractedDims(result);

      // Pre-populate editable fields from flat result
      setEditableDims(result.flat || {});
      setDimModalOpen(true);
      message.success(`Extracted ${Object.keys(result.flat || {}).length} dimensions from ${file.name}`);
    } catch (err) {
      message.error('Failed to extract dimensions from PDF');
      console.error(err);
    } finally {
      setPdfExtracting(false);
    }
  };

  const handleDimFieldChange = (key, value) => {
    setEditableDims(prev => ({ ...prev, [key]: value }));
  };

const handleAddDimRow = () => {
  const newKey = `dim_${Date.now()}`;
  setEditableDims(prev => ({ ...prev, [newKey]: '' }));
};

const handleRemoveDimRow = (key) => {
  setEditableDims(prev => {
    const copy = { ...prev };
    delete copy[key];
    return copy;
  });
};

const handleCopyToClipboard = () => {
  const text = Object.entries(editableDims)
    .map(([k, v]) => `${k}\t${v}`)
    .join('\n');
  navigator.clipboard.writeText(text);
  message.success('Copied to clipboard as tab-separated values');
};

const handleExtractConfirm = (flat) => {
  // flat = { "Total Height": "410", "Outer Dia": "133", ... }
  // do whatever you want — show it, pre-fill a form, download as CSV, etc.
  console.log('Extracted dims:', flat);
  message.success(`${Object.keys(flat).length} dimensions ready`);
};

  useEffect(() => {
    checkServerHealth();
    loadWeldmentFiles();
    loadBOMFiles();
  }, []);

  const weldmentColumns = [
    {
      title: 'Filename',
      dataIndex: 'filename',
      key: 'filename',
    },
    {
      title: 'Records',
      dataIndex: 'record_count',
      key: 'record_count',
    },
    {
      title: 'Columns',
      dataIndex: 'columns',
      key: 'columns',
      render: (columns) => (
        <span title={columns?.join(', ')}>
          {columns?.length || 0} columns
        </span>
      ),
    },
    {
      title: 'Status',
      key: 'status',
      render: () => <Tag color="green" icon={<CheckCircleOutlined />}>Ready</Tag>,
    },
  ];

  const bomColumns = [
    {
      title: 'Filename',
      dataIndex: 'filename',
      key: 'filename',
    },
    {
      title: 'Records',
      dataIndex: 'record_count',
      key: 'record_count',
    },
    {
      title: 'Columns',
      dataIndex: 'columns',
      key: 'columns',
      render: (columns) => (
        <span title={columns?.join(', ')}>
          {columns?.length || 0} columns
        </span>
      ),
    },
    {
      title: 'Status',
      key: 'status',
      render: () => <Tag color="green" icon={<CheckCircleOutlined />}>Ready</Tag>,
    },
  ];

  const pipeColumns = [
    {
      title: 'Filename',
      dataIndex: 'filename',
      key: 'filename',
    },
    {
      title: 'Records',
      dataIndex: 'record_count',
      key: 'record_count',
    },
    {
      title: 'Columns',
      dataIndex: 'columns',
      key: 'columns',
      render: (columns) => (
        <span title={columns?.join(', ')}>
          {columns?.length || 0} columns
        </span>
      ),
    },
    {
      title: 'Status',
      key: 'status',
      render: () => <Tag color="green" icon={<CheckCircleOutlined />}>Ready</Tag>,
    },
  ];

  return (
    <div>
      <h1>Upload Files</h1>
      
      {/* Server Status Alert */}
      {serverStatus === 'unhealthy' && (
        <Alert
          message="Backend Server Unavailable"
          description="Please make sure the FastAPI backend is running on http://localhost:8000. Check the console for details."
          type="error"
          showIcon
          style={{ marginBottom: 20 }}
          action={
            <Button size="small" onClick={checkServerHealth}>
              Retry
            </Button>
          }
        />
      )}
      
      <Row gutter={16} style={{ marginBottom: 20 }}>
        <Col span={8}>
          <Card 
            title="Upload Weldment Dimensions" 
            loading={loading}
          >
            <Dragger {...weldmentProps} id="weldment-upload">
              <p className="ant-upload-drag-icon">
                <InboxOutlined />
              </p>
              <p className="ant-upload-text">
                Click or drag weldment file
              </p>
              <p className="ant-upload-hint">
                Excel (.xlsx, .xls) & CSV
              </p>
            </Dragger>
            
            <div style={{ marginTop: 20 }}>
              <h4>Uploaded Weldment Files</h4>
              <Spin spinning={fileLoading}>
                <Table
                  columns={weldmentColumns}
                  dataSource={weldmentFiles}
                  pagination={false}
                  size="small"
                  rowKey="file_id"
                  locale={{ emptyText: 'No weldment files uploaded yet' }}
                />
              </Spin>
            </div>
          </Card>
        </Col>
        
        <Col span={8}>
          <Card 
            title="Upload BOM Files" 
            loading={loading}
          >
            <Dragger {...bomProps} id="bom-upload">
              <p className="ant-upload-drag-icon">
                <InboxOutlined />
              </p>
              <p className="ant-upload-text">
                Click or drag BOM file
              </p>
              <p className="ant-upload-hint">
                Excel (.xlsx, .xls) & CSV
              </p>
            </Dragger>
            
            <div style={{ marginTop: 20 }}>
              <h4>Uploaded BOM Files</h4>
              <Spin spinning={fileLoading}>
                <Table
                  columns={bomColumns}
                  dataSource={bomFiles}
                  pagination={false}
                  size="small"
                  rowKey="file_id"
                  locale={{ emptyText: 'No BOM files uploaded yet' }}
                />
              </Spin>
            </div>
          </Card>
        </Col>

        <Col span={8}>
          <Card 
            title="Upload Pipe Dimensions" 
            loading={loading}
          >
            <Dragger {...pipeProps} id="pipe-upload">
              <p className="ant-upload-drag-icon">
                <InboxOutlined />
              </p>
              <p className="ant-upload-text">
                Click or drag pipe file
              </p>
              <p className="ant-upload-hint">
                Excel (.xlsx, .xls) & CSV
              </p>
            </Dragger>
            
            <div style={{ marginTop: 20 }}>
              <h4>Uploaded Pipe Files</h4>
              <Spin spinning={fileLoading}>
                <Table
                  columns={pipeColumns}
                  dataSource={pipeFiles}
                  pagination={false}
                  size="small"
                  rowKey="file_id"
                  locale={{ emptyText: 'No pipe files uploaded yet' }}
                />
              </Spin>
            </div>
          </Card>
        </Col>
      </Row>
      
      <Card title="File Requirements & Tips">
  <Row gutter={[24, 24]}>
    {/* Weldment */}
    <Col xs={24} md={8}>
      <h4>Weldment Dimension File Format</h4>
      <ul>
        <li><strong>Required:</strong> Assy PN (Part Number)</li>
        <li><strong>Required:</strong> Total Height measurements</li>
        <li><strong>Required:</strong> Outer Diameter measurements</li>
        <li>Additional dimensions are automatically detected</li>
        <li>Excel (.xlsx, .xls) or CSV format</li>
      </ul>
      <br></br>
      <h4>Expected Column Names</h4>
      <ul>
        <li>Assy PN, Part Number, or similar</li>
        <li>Total Height, Height, or similar</li>
        <li>Outer Dia, Outer Diameter, or similar</li>
        <li>Inner Dia, Inner Diameter (optional)</li>
        <li>Flange dimensions (optional)</li>
        <li>Nozzle dimensions (optional)</li>
      </ul>
    </Col>

    {/* BOM */}
    <Col xs={24} md={8}>
      <h4>BOM File Format</h4>
      <ul>
        <li><strong>Required:</strong> Component (Part Numbers)</li>
        <li><strong>Required:</strong> Lev (Level in BOM hierarchy)</li>
        <li><strong>Required:</strong> Quantity</li>
        <li>Assembly ID (optional, for multiple BOMs)</li>
        <li>Excel (.xlsx, .xls) or CSV format</li>
      </ul>
    </Col>

    {/* Pipe */}
    <Col xs={24} md={8}>
      <h4>Pipe Dimension File Format</h4>
      <ul>
        <li><strong>Required:</strong> ITEM CODE</li>
        <li><strong>Required:</strong> If Bends, No. of Bends</li>
        <li><strong>Required:</strong> If Straight, Length</li>
        <li><strong>Required:</strong> Effective Length</li>
        <li><strong>Required:</strong> X-AXIS, Y-AXIS, Z-AXIS</li>
        <li>Excel (.xlsx, .xls) or CSV format</li>
      </ul>
      <br></br>
      <h4>Expected Column Names</h4>
      <ul>
        <li>ITEM CODE, Part Number, or similar</li>
        <li>If Bends, No. of Bends</li>
        <li>If Straight, Length</li>
        <li>Effective Length</li>
        <li>X-AXIS, Y-AXIS, Z-AXIS</li>
      </ul>
    </Col>
  </Row>
</Card>
      
      

      <Button icon={<FilePdfOutlined />} onClick={() => setExtractorOpen(true)}>
        Extract from Drawing PDF
      </Button>

      <DrawingExtractorModal
        open={extractorOpen}
        onClose={() => setExtractorOpen(false)}
        onConfirm={handleExtractConfirm}
      />
    </div>
  );
};

export default UploadPage;
