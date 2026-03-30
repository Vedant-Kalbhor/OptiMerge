import React, { useState } from 'react';
import { Card, Button, Alert, Typography, Divider, Space, Tag, message } from 'antd';
import { FilePdfOutlined, ThunderboltOutlined, EyeOutlined, DownloadOutlined } from '@ant-design/icons';
import DrawingExtractorModal from '../components/DrawingExtractorModal';

const { Title, Text, Paragraph } = Typography;

const DimensionExtractionPage = () => {
  const [modalOpen, setModalOpen]       = useState(false);
  const [lastResult, setLastResult]     = useState(null);  // { flat, timestamp }

  const handleConfirm = (flat) => {
    setLastResult({ flat, timestamp: new Date().toLocaleString() });
    message.success(`${Object.keys(flat).length} dimensions extracted and ready`);
  };

  const handleDownloadCSV = () => {
    if (!lastResult) return;
    const csv = 'Label,Value\n' +
      Object.entries(lastResult.flat).map(([k, v]) => `"${k}","${v}"`).join('\n');
    const blob = new URL(`data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`);
    const a    = document.createElement('a');
    a.href     = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = 'extracted_dimensions.csv';
    a.click();
  };

  const handleDownloadTSV = () => {
    if (!lastResult) return;
    const tsv  = Object.entries(lastResult.flat).map(([k, v]) => `${k}\t${v}`).join('\n');
    const a    = document.createElement('a');
    a.href     = URL.createObjectURL(new Blob([tsv], { type: 'text/plain' }));
    a.download = 'extracted_dimensions.tsv';
    a.click();
  };

  return (
    <div>
      <Title level={3}>
        <FilePdfOutlined style={{ color: '#ff4d4f', marginRight: 10 }} />
        Dimension Extraction from Drawings
      </Title>

      <Paragraph type="secondary">
        Upload a PDF engineering drawing to automatically extract dimensions — fully offline,
        no AI or cloud required. Supports labeled drawings, radius, diameter, thread specs,
        hole callouts, counterbores, and plain numeric dimensions.
      </Paragraph>

      {/* How it works */}
      <Card title="How it works" style={{ marginBottom: 20 }}>
        <Space size="large" wrap>
          <div style={{ textAlign: 'center', width: 160 }}>
            <div style={{ fontSize: 28 }}>📄</div>
            <Text strong>Upload PDF</Text>
            <br />
            <Text type="secondary" style={{ fontSize: 12 }}>
              Any CAD-exported PDF drawing
            </Text>
          </div>
          <div style={{ fontSize: 24, color: '#d9d9d9' }}>→</div>
          <div style={{ textAlign: 'center', width: 160 }}>
            <div style={{ fontSize: 28 }}>🔍</div>
            <Text strong>Auto-Detect</Text>
            <br />
            <Text type="secondary" style={{ fontSize: 12 }}>
              Text blocks extracted with spatial positions
            </Text>
          </div>
          <div style={{ fontSize: 24, color: '#d9d9d9' }}>→</div>
          <div style={{ textAlign: 'center', width: 160 }}>
            <div style={{ fontSize: 28 }}>✏️</div>
            <Text strong>Review & Label</Text>
            <br />
            <Text type="secondary" style={{ fontSize: 12 }}>
              Edit labels in Quick or Visual mode
            </Text>
          </div>
          <div style={{ fontSize: 24, color: '#d9d9d9' }}>→</div>
          <div style={{ textAlign: 'center', width: 160 }}>
            <div style={{ fontSize: 28 }}>📥</div>
            <Text strong>Export</Text>
            <br />
            <Text type="secondary" style={{ fontSize: 12 }}>
              Download as CSV / TSV for weldment upload
            </Text>
          </div>
        </Space>
      </Card>

      {/* Supported notations */}
      <Card title="Supported engineering notations" style={{ marginBottom: 20 }}>
        <Space wrap>
          <Tag color="green">Plain numbers — 80, 12.5</Tag>
          <Tag color="orange">Radius — R20 or 20\nR</Tag>
          <Tag color="orange">Diameter — ⌀6 or Ø4.6</Tag>
          <Tag color="orange">Thread — M8×1.0</Tag>
          <Tag color="orange">Hole callout — 6 HOLES ⌀6.5</Tag>
          <Tag color="orange">Counterbore — CB 10 5</Tag>
          <Tag color="blue">Labels — Total Height, Outer Dia, …</Tag>
        </Space>
      </Card>

      {/* Action */}
      <Card style={{ marginBottom: 20, textAlign: 'center' }}>
        <Space direction="vertical" size="middle">
          <Button
            type="primary"
            size="large"
            icon={<FilePdfOutlined />}
            onClick={() => setModalOpen(true)}
          >
            Open Drawing Extractor
          </Button>
          <Space>
            <Tag icon={<ThunderboltOutlined />} color="processing">Quick Extract</Tag>
            <Text type="secondary">or</Text>
            <Tag icon={<EyeOutlined />} color="success">Visual Bounding Boxes</Tag>
          </Space>
        </Space>
      </Card>

      {/* Last result */}
      {lastResult && (
        <Card
          title={`Last Extraction — ${lastResult.timestamp}`}
          extra={
            <Space>
              <Button size="small" icon={<DownloadOutlined />} onClick={handleDownloadCSV}>
                Download CSV
              </Button>
              <Button size="small" icon={<DownloadOutlined />} onClick={handleDownloadTSV}>
                Download TSV
              </Button>
            </Space>
          }
        >
          <Alert
            message={`${Object.keys(lastResult.flat).length} dimensions ready — paste the TSV directly into your weldment Excel file`}
            type="success"
            showIcon
            style={{ marginBottom: 12 }}
          />
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#fafafa' }}>
                <th style={{ padding: '6px 12px', textAlign: 'left', borderBottom: '1px solid #f0f0f0', fontWeight: 600 }}>Label</th>
                <th style={{ padding: '6px 12px', textAlign: 'left', borderBottom: '1px solid #f0f0f0', fontWeight: 600 }}>Value</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(lastResult.flat).map(([k, v]) => (
                <tr key={k} style={{ borderBottom: '1px solid #f0f0f0' }}>
                  <td style={{ padding: '6px 12px', fontFamily: 'monospace' }}>{k}</td>
                  <td style={{ padding: '6px 12px', fontWeight: 500 }}>{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <DrawingExtractorModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onConfirm={handleConfirm}
      />
    </div>
  );
};

export default DimensionExtractionPage;