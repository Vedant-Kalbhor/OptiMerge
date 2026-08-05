import React, { useEffect, useState } from 'react';
import { Upload, Button, Card, Row, Col, message, Alert, Divider } from 'antd';
import { FilePdfOutlined, InboxOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';
import {
  uploadWeldments,
  uploadBOMs,
  uploadPipes,
  healthCheck
} from '../services/api';
import DrawingExtractorModal from '../components/DrawingExtractorModal';

const { Dragger } = Upload;

const normalizeHeader = (value) =>
  String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const containsAny = (headers, candidates) =>
  candidates.some((candidate) =>
    headers.some((header) => header.includes(normalizeHeader(candidate)))
  );

const containsAll = (headers, candidates) =>
  candidates.every((candidate) =>
    headers.some((header) => header.includes(normalizeHeader(candidate)))
  );

const readHeadersFromFile = async (file) => {
  const lowerName = file.name.toLowerCase();
  let workbook;

  if (lowerName.endsWith('.csv')) {
    workbook = XLSX.read(await file.text(), { type: 'string' });
  } else {
    workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
  }

  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) {
    return [];
  }

  const worksheet = workbook.Sheets[firstSheetName];
  const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, blankrows: false });
  const headerRow = rows.find((row) =>
    Array.isArray(row) && row.some((cell) => String(cell ?? '').trim() !== '')
  );

  return (headerRow || [])
    .map((cell) => normalizeHeader(cell))
    .filter(Boolean);
};

const detectUploadTarget = async (file) => {
  const headers = await readHeadersFromFile(file);

  const isPipe =
    containsAll(headers, ['x axis', 'y axis', 'z axis', 'effective length']) &&
    (containsAny(headers, ['if bends', 'bends']) || containsAny(headers, ['if straight', 'straight length']));

  const isBOM =
    containsAny(headers, ['component']) &&
    containsAny(headers, ['lev', 'level']) &&
    containsAny(headers, ['quantity', 'qty']);

  const isWeldment =
    containsAny(headers, ['assy pn', 'assy']) &&
    (containsAny(headers, ['total height']) || containsAny(headers, ['outer dia', 'outer diameter']));

  if (isPipe) {
    return {
      type: 'pipe',
      label: 'Pipe Dimensions',
      uploadFn: uploadPipes,
      analysisState: {
        type: 'pipe',
        fileName: file.name,
        autoRun: true,
        autoAnalysis: 'pipe_pairwise'
      }
    };
  }

  if (isBOM) {
    return {
      type: 'bom',
      label: 'BOM',
      uploadFn: uploadBOMs,
      analysisState: {
        type: 'bom',
        fileName: file.name,
        autoRun: true,
        autoAnalysis: 'bom_similarity'
      }
    };
  }

  if (isWeldment) {
    return {
      type: 'weldment',
      label: 'Weldment Dimensions',
      uploadFn: uploadWeldments,
      analysisState: {
        type: 'weldment',
        fileName: file.name,
        autoRun: true,
        autoAnalysis: 'dimensional_clustering'
      }
    };
  }

  throw new Error(
    'Could not detect the file type from its columns. Please upload a valid weldment, BOM, or pipe template.'
  );
};

const UploadPage = () => {
  const navigate = useNavigate();

  const [loading, setLoading] = useState(false);
  const [serverStatus, setServerStatus] = useState('checking');
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

  const handleSmartUpload = async (options) => {
    const { file, onSuccess, onError } = options;

    try {
      setLoading(true);

      const target = await detectUploadTarget(file);
      const formData = new FormData();
      formData.append('file', file);

      console.log(`Uploading ${target.type} file:`, file.name);
      const response = await target.uploadFn(formData);

      onSuccess(response, file);
      message.success(`${file.name} uploaded successfully as ${target.label}`);

      const responseData = response.data || {};
      navigate('/analysis', {
        state: {
          smartUpload: {
            ...target.analysisState,
            fileId: responseData.file_id,
            recordCount: responseData.record_count,
            columns: responseData.columns || [],
            filename: file.name
          }
        }
      });
    } catch (error) {
      console.error('Smart upload error:', error);
      onError(error);
      const errorMessage = error.response?.data?.detail || error.message || 'Upload failed';
      message.error(`${file.name} upload failed: ${errorMessage}`);
    } finally {
      setLoading(false);
    }
  };

  const handleExtractConfirm = (flat) => {
    console.log('Extracted dims:', flat);
    message.success(`${Object.keys(flat).length} dimensions ready`);
  };

  useEffect(() => {
    checkServerHealth();
  }, []);

  const smartUploadProps = {
    name: 'file',
    multiple: false,
    accept: '.xlsx,.xls,.csv',
    showUploadList: false,
    customRequest: handleSmartUpload,
  };

  return (
    <div>
      <h1>Upload Files</h1>

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
        <Col span={24}>
          <Card
            title="Smart Upload"
            loading={loading}
            extra={<span>One file in, the right analysis opens automatically</span>}
          >
            <Dragger {...smartUploadProps} id="smart-upload">
              <p className="ant-upload-drag-icon">
                <InboxOutlined />
              </p>
              <p className="ant-upload-text">Click or drag your file here</p>
              <p className="ant-upload-hint">
                Supports weldment, BOM, and pipe templates in Excel (.xlsx, .xls) or CSV format
              </p>
            </Dragger>
          </Card>
        </Col>
      </Row>

      <Card title="File Requirements & Tips">
        <Row gutter={[24, 24]}>
          <Col xs={24} md={8}>
            <h4>Weldment Dimension File Format</h4>
            <ul>
              <li><strong>Required:</strong> Assy PN (Part Number)</li>
              <li><strong>Required:</strong> Total Height measurements</li>
              <li><strong>Required:</strong> Outer Diameter measurements</li>
              <li>Additional dimensions are automatically detected</li>
              <li>Excel (.xlsx, .xls) or CSV format</li>
            </ul>
            <br />
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
            <br />
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

      <Divider />

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
