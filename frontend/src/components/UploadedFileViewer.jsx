import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Modal, Pagination, Space, Spin, Table, Tag, Typography, message } from 'antd';
import { EyeOutlined, DownloadOutlined } from '@ant-design/icons';
import * as XLSX from 'xlsx';
import api from '../services/api';

const { Text } = Typography;

const buildPreviewTable = (rows) => {
  const cleanedRows = Array.isArray(rows)
    ? rows.filter((row) => Array.isArray(row) && row.some((cell) => String(cell ?? '').trim() !== ''))
    : [];

  if (!cleanedRows.length) {
    return { columns: [], dataSource: [] };
  }

  const headerIndex = cleanedRows.findIndex((row) =>
    Array.isArray(row) && row.some((cell) => String(cell ?? '').trim() !== '')
  );
  const headerRow = (cleanedRows[headerIndex] || []).map((cell, idx) => {
    const label = String(cell ?? '').trim();
    return label || `Column ${idx + 1}`;
  });

  const dataRows = cleanedRows.slice(headerIndex + 1);
  const columns = headerRow.map((title, index) => ({
    title,
    dataIndex: `col_${index}`,
    key: `col_${index}`,
    ellipsis: true,
  }));

  const dataSource = dataRows.map((row, rowIndex) => {
    const record = { key: rowIndex };
    headerRow.forEach((_, colIndex) => {
      record[`col_${colIndex}`] = row?.[colIndex] ?? '';
    });
    return record;
  });

  return { columns, dataSource };
};

const UploadedFileViewer = ({ sourceFile, buttonText = 'View Uploaded File', buttonType = 'default' }) => {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState({ columns: [], dataSource: [], sheetName: '' });
  const [error, setError] = useState('');
  const [pagination, setPagination] = useState({ current: 1, pageSize: 25 });

  const filename = sourceFile?.filename || 'Uploaded file';
  const downloadUrl = sourceFile?.download_url;

  const fileTag = useMemo(() => {
    const lower = String(filename).toLowerCase();
    if (lower.endsWith('.csv')) return 'CSV';
    if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) return 'Excel';
    return 'File';
  }, [filename]);

  useEffect(() => {
    if (!open || !downloadUrl) {
      return;
    }

    const loadPreview = async () => {
      try {
        setLoading(true);
        setError('');
        setPreview({ columns: [], dataSource: [], sheetName: '' });

        const response = await api.get(downloadUrl, { responseType: 'arraybuffer' });
        const buffer = response.data;
        const lower = String(filename).toLowerCase();
        let workbook;

        if (lower.endsWith('.csv')) {
          const text = new TextDecoder('utf-8').decode(buffer);
          workbook = XLSX.read(text, { type: 'string' });
        } else {
          workbook = XLSX.read(buffer, { type: 'array' });
        }

        const sheetName = workbook.SheetNames[0] || '';
        if (!sheetName) {
          throw new Error('No sheet found in uploaded file');
        }

        const worksheet = workbook.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, blankrows: false, defval: '' });
        const { columns, dataSource } = buildPreviewTable(rows);

        setPreview({ columns, dataSource, sheetName });
        setPagination({ current: 1, pageSize: 25 });
      } catch (err) {
        console.error('Failed to load uploaded file preview:', err);
        setError(err?.message || 'Failed to load uploaded file preview');
        message.error('Could not load the uploaded file preview');
      } finally {
        setLoading(false);
      }
    };

    loadPreview();
  }, [open, downloadUrl, filename]);

  const start = (pagination.current - 1) * pagination.pageSize;
  const paginatedRows = preview.dataSource.slice(start, start + pagination.pageSize);

  const onPageChange = (current, pageSize) => {
    setPagination({ current, pageSize });
  };

  if (!sourceFile) {
    return null;
  }

  return (
    <>
      <Button
        icon={<EyeOutlined />}
        type={buttonType}
        onClick={() => setOpen(true)}
      >
        {buttonText}
      </Button>

      <Modal
        open={open}
        onCancel={() => setOpen(false)}
        width={1100}
        footer={[
          <Button key="close" onClick={() => setOpen(false)}>
            Close
          </Button>
        ]}
        title={
          <Space direction="vertical" size={2}>
            <Text strong>{filename}</Text>
            <Space size={8}>
              <Tag color="blue">{fileTag}</Tag>
              <Text type="secondary">Exact uploaded file used for this analysis</Text>
            </Space>
          </Space>
        }
      >
        <Space style={{ marginBottom: 16 }} wrap>
          <Button
            icon={<DownloadOutlined />}
            onClick={() => window.open(`${api.defaults.baseURL}${downloadUrl}`, '_blank', 'noopener,noreferrer')}
          >
            Download Original
          </Button>
          <Text type="secondary">Previewing the first worksheet or CSV sheet from the stored upload.</Text>
        </Space>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 40 }}>
            <Spin size="large" />
            <div style={{ marginTop: 12 }}>Loading file preview...</div>
          </div>
        ) : error ? (
          <Alert message="Preview unavailable" description={error} type="error" showIcon />
        ) : (
          <>
            <Table
              size="small"
              columns={preview.columns}
              dataSource={paginatedRows}
              pagination={false}
              scroll={{ x: 'max-content', y: 520 }}
              bordered
              rowKey="key"
              title={() => preview.sheetName ? `Sheet: ${preview.sheetName}` : null}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
              <Pagination
                current={pagination.current}
                pageSize={pagination.pageSize}
                total={preview.dataSource.length}
                showSizeChanger
                showQuickJumper
                pageSizeOptions={['10', '25', '50', '100']}
                onChange={onPageChange}
                onShowSizeChange={onPageChange}
                showTotal={(total, range) => `${range[0]}-${range[1]} of ${total}`}
              />
            </div>
          </>
        )}
      </Modal>
    </>
  );
};

export default UploadedFileViewer;
