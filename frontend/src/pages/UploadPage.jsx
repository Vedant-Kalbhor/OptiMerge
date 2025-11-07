import React, { useState, useEffect } from 'react';
import { Upload, Button, Card, Row, Col, message, Table, Tag, Spin, Alert } from 'antd';
import { UploadOutlined, InboxOutlined, CheckCircleOutlined } from '@ant-design/icons';
import { uploadWeldments, uploadBOMs, getWeldmentFiles, getBOMFiles, healthCheck } from '../services/api';

const { Dragger } = Upload;

const UploadPage = () => {
  const [weldmentFiles, setWeldmentFiles] = useState([]);
  const [bomFiles, setBomFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [fileLoading, setFileLoading] = useState(false);
  const [serverStatus, setServerStatus] = useState('checking');

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
      
      {serverStatus === 'healthy' && (
        <Alert
          message="Backend Server Connected"
          description="The server is running and ready to accept file uploads."
          type="success"
          showIcon
          style={{ marginBottom: 20 }}
        />
      )}
      
      <Row gutter={16} style={{ marginBottom: 20 }}>
        <Col span={12}>
          <Card 
            title="Upload Weldment Dimensions" 
            loading={loading}
            extra={
              <Button 
                type="primary" 
                icon={<UploadOutlined />}
                onClick={() => document.querySelector('#weldment-upload input')?.click()}
              >
                Select File
              </Button>
            }
          >
            <Dragger {...weldmentProps} id="weldment-upload">
              <p className="ant-upload-drag-icon">
                <InboxOutlined />
              </p>
              <p className="ant-upload-text">
                Click or drag weldment dimension file to this area to upload
              </p>
              <p className="ant-upload-hint">
                Support for Excel (.xlsx, .xls) and CSV files
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
        
        <Col span={12}>
          <Card 
            title="Upload BOM Files" 
            loading={loading}
            extra={
              <Button 
                type="primary" 
                icon={<UploadOutlined />}
                onClick={() => document.querySelector('#bom-upload input')?.click()}
              >
                Select File
              </Button>
            }
          >
            <Dragger {...bomProps} id="bom-upload">
              <p className="ant-upload-drag-icon">
                <InboxOutlined />
              </p>
              <p className="ant-upload-text">
                Click or drag BOM file to this area to upload
              </p>
              <p className="ant-upload-hint">
                Support for Excel (.xlsx, .xls) and CSV files
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
      </Row>
      
      <Card title="File Requirements & Tips">
        <Row gutter={16}>
          <Col span={12}>
            <h4>Weldment Dimension File Format:</h4>
            <ul>
              <li><strong>Required:</strong> Assy PN (Part Number)</li>
              <li><strong>Required:</strong> Total Height measurements</li>
              <li><strong>Required:</strong> Outer Diameter measurements</li>
              <li>Additional dimensions are automatically detected</li>
              <li>Excel or CSV format</li>
            </ul>
            
            <h4>Expected Column Names:</h4>
            <ul>
              <li>Assy PN, Part Number, or similar</li>
              <li>Total Height, Height, or similar</li>
              <li>Outer Dia, Outer Diameter, or similar</li>
              <li>Inner Dia, Inner Diameter (optional)</li>
              <li>Flange dimensions (optional)</li>
              <li>Nozzle dimensions (optional)</li>
            </ul>
          </Col>
          
          <Col span={12}>
            <h4>BOM File Format:</h4>
            <ul>
              <li><strong>Required:</strong> Component (Part Numbers)</li>
              <li><strong>Required:</strong> Lev (Level in BOM hierarchy)</li>
              <li><strong>Required:</strong> Quantity</li>
              <li>Assembly ID (optional, for multiple BOMs)</li>
              <li>Excel or CSV format</li>
            </ul>
            
            <h4>Troubleshooting:</h4>
            <ul>
              <li>Ensure files are not password protected</li>
              <li>Check that required columns exist</li>
              <li>Verify file is not corrupted</li>
              <li>Make sure backend server is running</li>
              <li>Check browser console for detailed errors</li>
            </ul>
          </Col>
        </Row>
      </Card>
    </div>
  );
};

export default UploadPage;