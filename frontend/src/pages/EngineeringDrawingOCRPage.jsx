import React, { useState } from 'react';
import {
  Card,
  Upload,
  Button,
  Typography,
  Alert,
  Space,
  Tag,
  message,
  Progress,
} from 'antd';
import {
  InboxOutlined,
  FileImageOutlined,
  FilePdfOutlined,
  FileExcelOutlined,
  DownloadOutlined,
  ClearOutlined,
} from '@ant-design/icons';
import { uploadImageOrPdf } from '../services/api';

const { Dragger } = Upload;
const { Title, Text, Paragraph } = Typography;

const EngineeringDrawingOCRPage = () => {
  const [selectedFile, setSelectedFile] = useState(null);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [uploadFileList, setUploadFileList] = useState([]);
  const [processing, setProcessing] = useState(false);
  const [resultFile, setResultFile] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');

  // Old Code
  // const beforeUpload = (file) => {
  //   const allowedTypes = [
  //     'image/jpeg',
  //     'image/png',
  //     'application/pdf',
  //   ];

  //   const isAllowed = allowedTypes.includes(file.type);

  //   if (!isAllowed) {
  //     message.error('Only JPG, JPEG, PNG and PDF files are supported.');
  //     return Upload.LIST_IGNORE;
  //   }

  //   const maxSize = 25 * 1024 * 1024;

  //   if (file.size > maxSize) {
  //     message.error('File size must be 25 MB or less.');
  //     return Upload.LIST_IGNORE;
  //   }

  //   setSelectedFile(file);
  //   setResultFile(null);
  //   setErrorMessage('');

  //   return false;
  // };

  const beforeUpload = (file) => {
    const allowedTypes = [
      'image/jpeg',
      'image/png',
      'application/pdf',
    ];

    if (!allowedTypes.includes(file.type)) {
      message.error('Only JPG, JPEG, PNG and PDF files are supported.');
      return Upload.LIST_IGNORE;
    }

    const maxSize = 25 * 1024 * 1024;

    if (file.size > maxSize) {
      message.error('File size must be 25 MB or less.');
      return Upload.LIST_IGNORE;
    }

    setResultFile(null);
    setErrorMessage('');

    return false;
  };

  // Added
  const handleFileChange = ({ fileList }) => {

    const actualFiles = fileList
      .map(item => item.originFileObj || item)
      .filter(Boolean);

    const hasPdf = actualFiles.some(
      file => file.type === 'application/pdf'
    );

    // PDF must be uploaded individually
    if (hasPdf && actualFiles.length > 1) {
      message.error(
        'Please upload a PDF separately. Multiple upload supports images only.'
      );

      setUploadFileList([]);
      setSelectedFile(null);
      setSelectedFiles([]);

      return;
    }

    setUploadFileList(fileList);

    if (hasPdf) {
      setSelectedFile(actualFiles[0]);
      setSelectedFiles([]);
    } else {
      setSelectedFile(null);
      setSelectedFiles(actualFiles);
    }

    setResultFile(null);
    setErrorMessage('');
  };

  const handleUpload = async () => {
    // if (!selectedFile) {
    //   message.warning('Please select an image or PDF file first.');
    //   return;
    // }
    if (!selectedFile && selectedFiles.length === 0) {
      message.warning('Please select an image or PDF file first.');
      return;
    }

    try {
      setProcessing(true);
      setErrorMessage('');
      setResultFile(null);

      const formData = new FormData();
      // formData.append('file', selectedFile);
      if (selectedFiles.length > 0) {

        // Multiple images
        selectedFiles.forEach(file => {
          formData.append('files', file);
        });

      } else {

        // Single image or PDF
        formData.append('file', selectedFile);
      }

      console.log('Sending engineering drawing:', selectedFiles);

      const response = await uploadImageOrPdf(formData);

      const contentType = response.headers?.['content-type'] || '';

      // The backend returns an Excel file on success.
      if (
        !contentType.includes(
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        )
      ) {
        // Try to read an error response returned as a blob.
        const text = await response.data.text();

        try {
          const errorData = JSON.parse(text);
          throw new Error(
            errorData.detail || 'The backend did not return an Excel file.'
          );
        } catch (parseError) {
          if (parseError.message) {
            throw parseError;
          }
          throw new Error(text || 'The backend did not return an Excel file.');
        }
      }

      const blob = new Blob(
        [response.data],
        {
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        }
      );

      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');

      link.href = downloadUrl;
      // link.download = getOutputFilename(selectedFile.name);
      const outputFilename = selectedFiles.length > 0
    ? 'images_extraction.xlsx'
    : getOutputFilename(selectedFile.name);

link.download = outputFilename;
      document.body.appendChild(link);
      link.click();
      link.remove();

      window.URL.revokeObjectURL(downloadUrl);

      setResultFile({
        name: outputFilename,
        size: blob.size,
      });

      message.success('Drawing processed successfully. Excel file downloaded.');
    } catch (error) {
      console.error('Engineering drawing processing error:', error);

      let detail = error.message || 'Failed to process the engineering drawing.';

      if (error.response?.data instanceof Blob) {
        try {
          const text = await error.response.data.text();
          const data = JSON.parse(text);
          detail = data.detail || detail;
        } catch {
          // Keep the original error message.
        }
      }

      setErrorMessage(detail);
      message.error(detail);
    } finally {
      setProcessing(false);
    }
  };

  // const handleClear = () => {
  //   setSelectedFile(null);
  //   setResultFile(null);
  //   setErrorMessage('');
  // };

  const handleClear = () => {
    setSelectedFile(null);
    setSelectedFiles([]);
    setUploadFileList([]);
    setResultFile(null);
    setErrorMessage('');
};

  const getFileType = () => {
    if (!selectedFile) return null;

    if (selectedFile.type === 'application/pdf') {
      return 'PDF';
    }

    return 'IMAGE';
  };

  const getOutputFilename = (filename) => {
    const baseName = filename.includes('.')
      ? filename.substring(0, filename.lastIndexOf('.'))
      : filename;

    return `${baseName}_extraction.xlsx`;
  };

  // const props = {
  //   name: 'file',
  //   multiple: false,
  //   accept: '.jpg,.jpeg,.png,.pdf',
  //   showUploadList: false,
  //   beforeUpload,
  //   onRemove: handleClear,
  // };

  const props = {
    name: 'file',
    multiple: true,
    accept: '.jpg,.jpeg,.png,.pdf',
    showUploadList: false,
    beforeUpload,
  };

  return (
    <div>
      <Title level={3}>
        <FileImageOutlined style={{ color: '#1890ff', marginRight: 10 }} />
        Engineering Drawing OCR
      </Title>

      <Paragraph type="secondary">
        Upload an engineering drawing as an image or PDF. The backend
        automatically selects the appropriate service, extracts the table
        information using OCR, and generates an Excel file.
      </Paragraph>

      {/* How it works */}
      <Card title="How it works" style={{ marginBottom: 20 }}>
        <Space size="large" wrap>
          <div style={{ textAlign: 'center', width: 180 }}>
            <div style={{ fontSize: 30 }}>
              <FileImageOutlined />
            </div>
            <Text strong>1. Upload Drawing</Text>
            <br />
            <Text type="secondary" style={{ fontSize: 12 }}>
              JPG, JPEG, PNG or PDF
            </Text>
          </div>

          <div style={{ fontSize: 24, color: '#d9d9d9' }}>→</div>

          <div style={{ textAlign: 'center', width: 180 }}>
            <div style={{ fontSize: 30 }}>🔍</div>
            <Text strong>2. Automatic OCR</Text>
            <br />
            <Text type="secondary" style={{ fontSize: 12 }}>
              Image or PDF service is selected automatically
            </Text>
          </div>

          <div style={{ fontSize: 24, color: '#d9d9d9' }}>→</div>

          <div style={{ textAlign: 'center', width: 180 }}>
            <div style={{ fontSize: 30 }}>
              <FileExcelOutlined />
            </div>
            <Text strong>3. Generate Excel</Text>
            <br />
            <Text type="secondary" style={{ fontSize: 12 }}>
              Download the extracted engineering data
            </Text>
          </div>
        </Space>
      </Card>

      {/* Upload */}
      <Card title="Upload Engineering Drawing" style={{ marginBottom: 20 }}>
        {/* <Dragger {...props} disabled={processing}> */}
        <Dragger
          {...props}
          fileList={uploadFileList}
          onChange={handleFileChange}
          onRemove={(file) => {
            const updatedFiles = uploadFileList.filter(
              item => item.uid !== file.uid
            );

            handleFileChange({ fileList: updatedFiles });
          }}
          disabled={processing}
        >
          <p className="ant-upload-drag-icon">
            <InboxOutlined />
          </p>

          <p className="ant-upload-text">
            Click or drag an engineering drawing here
          </p>

          <p className="ant-upload-hint">
            Supported formats: JPG, JPEG, PNG and PDF
          </p>

          <p className="ant-upload-hint">
            Maximum file size: 25 MB
          </p>
        </Dragger>

        {/* Old Code */}
        {/* {selectedFile && (
          <Card
            size="small"
            style={{ marginTop: 20 }}
            title="Selected File"
          >
            <Space direction="vertical" style={{ width: '100%' }}>
              <Space wrap>
                {getFileType() === 'PDF' ? (
                  <FilePdfOutlined style={{ color: '#ff4d4f', fontSize: 22 }} />
                ) : (
                  <FileImageOutlined style={{ color: '#1890ff', fontSize: 22 }} />
                )}

                <Text strong>{selectedFile.name}</Text>

                <Tag color={getFileType() === 'PDF' ? 'red' : 'blue'}>
                  {getFileType()}
                </Tag>

                <Text type="secondary">
                  {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                </Text>
              </Space>

              {processing && (
                <Progress
                  percent={70}
                  status="active"
                  showInfo={false}
                />
              )}

              <Space>
                <Button
                  type="primary"
                  icon={<FileExcelOutlined />}
                  onClick={handleUpload}
                  loading={processing}
                >
                  {processing ? 'Processing Drawing...' : 'Extract & Generate Excel'}
                </Button>

                <Button
                  icon={<ClearOutlined />}
                  onClick={handleClear}
                  disabled={processing}
                >
                  Clear
                </Button>
              </Space>
            </Space>
          </Card>
        )} */}
        {(selectedFile || selectedFiles.length > 0) && (
    <Card
        size="small"
        style={{ marginTop: 20 }}
        title="Selected Files"
    >
        <Space direction="vertical" style={{ width: '100%' }}>

            {selectedFile && (
                <Space wrap>
                    {selectedFile.type === 'application/pdf' ? (
                        <FilePdfOutlined
                            style={{ color: '#ff4d4f', fontSize: 22 }}
                        />
                    ) : (
                        <FileImageOutlined
                            style={{ color: '#1890ff', fontSize: 22 }}
                        />
                    )}

                    <Text strong>{selectedFile.name}</Text>
                    <Tag color={selectedFile.type === 'application/pdf' ? 'red' : 'blue'}>
                        {selectedFile.type === 'application/pdf' ? 'PDF' : 'IMAGE'}
                    </Tag>
                </Space>
            )}

            {selectedFiles.map((file, index) => (
                <Space key={`${file.name}-${index}`} wrap>
                    <FileImageOutlined
                        style={{ color: '#1890ff', fontSize: 22 }}
                    />
                    <Text strong>{file.name}</Text>
                    <Tag color="blue">IMAGE</Tag>
                    <Text type="secondary">
                        {(file.size / 1024 / 1024).toFixed(2)} MB
                    </Text>
                </Space>
            ))}

            <Text type="secondary">
                {selectedFiles.length > 0
                    ? `${selectedFiles.length} images selected`
                    : '1 file selected'}
            </Text>

            <Space>
                <Button
                    type="primary"
                    icon={<FileExcelOutlined />}
                    onClick={handleUpload}
                    loading={processing}
                >
                    {processing ? 'Processing...' : 'Extract & Generate Excel'}
                </Button>

                <Button
                    icon={<ClearOutlined />}
                    onClick={handleClear}
                    disabled={processing}
                >
                    Clear
                </Button>
            </Space>

        </Space>
    </Card>
)}
      </Card>

      {/* Error */}
      {errorMessage && (
        <Alert
          message="Processing Failed"
          description={errorMessage}
          type="error"
          showIcon
          closable
          onClose={() => setErrorMessage('')}
          style={{ marginBottom: 20 }}
        />
      )}

      {/* Result */}
      {resultFile && (
        <Card
          title="Extraction Completed"
          style={{ marginBottom: 20 }}
        >
          <Alert
            message="Excel file generated successfully"
            description={`${resultFile.name} is ready. The generated file was downloaded automatically.`}
            type="success"
            showIcon
            icon={<FileExcelOutlined />}
          />

          <div style={{ marginTop: 16 }}>
            <Space>
              <FileExcelOutlined
                style={{ color: '#52c41a', fontSize: 24 }}
              />
              <Text strong>{resultFile.name}</Text>
              <Tag color="green">
                {(resultFile.size / 1024).toFixed(1)} KB
              </Tag>
            </Space>
          </div>
        </Card>
      )}

      {/* Service information */}
      <Card title="Processing Services">
        <Space wrap>
          <Tag icon={<FileImageOutlined />} color="blue">
            Image → OCRService
          </Tag>

          <Tag icon={<FilePdfOutlined />} color="red">
            PDF → PDFService → OCRService
          </Tag>

          <Tag icon={<FileExcelOutlined />} color="green">
            OCR Results → ExcelService
          </Tag>

          <Text type="secondary">
            The backend chooses the processing service from the uploaded file type.
          </Text>
        </Space>
      </Card>
    </div>
  );
};

export default EngineeringDrawingOCRPage;
