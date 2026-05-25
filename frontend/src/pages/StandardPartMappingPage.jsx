import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Col,
  Divider,
  Progress,
  Row,
  Select,
  Space,
  Spin,
  Table,
  Tag,
  Upload,
  message,
} from 'antd';
import {
  CheckCircleOutlined,
  DownloadOutlined,
  InboxOutlined,
  PlayCircleOutlined,
  UploadOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { saveAs } from 'file-saver';
import {
  exportStandardPartMappingJob,
  getStandardPartMappingStatus,
  runStandardPartMapping,
  saveStandardPartMappingDecision,
} from '../services/api';

const { Dragger } = Upload;

const StandardPartMappingPage = () => {
  const [statusLoading, setStatusLoading] = useState(false);
  const [runLoading, setRunLoading] = useState(false);
  const [decisionLoadingKey, setDecisionLoadingKey] = useState(null);
  const [pipelineStatus, setPipelineStatus] = useState([]);
  const [jobResult, setJobResult] = useState(null);
  const [standardFileList, setStandardFileList] = useState([]);
  const [legacyFileList, setLegacyFileList] = useState([]);
  const [selectedCandidates, setSelectedCandidates] = useState({});
  useEffect(() => {
    loadStatus();
  }, []);

  const loadStatus = async () => {
    try {
      setStatusLoading(true);
      const response = await getStandardPartMappingStatus();
      setPipelineStatus(response.data?.steps || []);
    } catch (error) {
      console.error('Failed to load status:', error);
      message.error('Failed to load standard part mapping status');
    } finally {
      setStatusLoading(false);
    }
  };

  const runMapping = async () => {
    try {
      setRunLoading(true);
      const formData = new FormData();
      if (legacyFileList[0]?.originFileObj) {
        formData.append('legacy_file', legacyFileList[0].originFileObj);
      }
      if (standardFileList[0]?.originFileObj) {
        formData.append('standard_file', standardFileList[0].originFileObj);
      }

      const response = await runStandardPartMapping(formData);
      setJobResult(response.data);
      setSelectedCandidates({});
      message.success('Standard part mapping completed');
    } catch (error) {
      console.error('Mapping run failed:', error);
      const errorMessage = error.response?.data?.detail || error.message || 'Mapping failed';
      message.error(`Mapping failed: ${errorMessage}`);
    } finally {
      setRunLoading(false);
    }
  };

  const handleSaveDecision = async (record) => {
    const key = record.source_row_key;
    const selectedPartNo = selectedCandidates[key];
    const candidates = record.candidates || [];
    if (!selectedPartNo) {
      message.warning('Please select a candidate first');
      return;
    }

    try {
      setDecisionLoadingKey(key);
      const formData = new FormData();
      formData.append('source_row_key', key);
      formData.append('source_text', record.source_text || '');
      formData.append('selected_part_no', selectedPartNo);
      formData.append('confidence', String(record.top_score ?? ''));
      formData.append('candidate_payload', JSON.stringify(candidates));

      await saveStandardPartMappingDecision(jobResult.job_id, formData);
      message.success(`Saved decision for ${key}`);

      setJobResult((prev) => {
        if (!prev) return prev;
        const updatedReviewQueue = (prev.review_queue || []).filter(
          (item) => item.source_row_key !== key
        );
        return {
          ...prev,
          review_queue: updatedReviewQueue,
          summary: {
            ...prev.summary,
            review_required: Math.max(0, (prev.summary?.review_required || 0) - 1),
          },
        };
      });
    } catch (error) {
      console.error('Failed to save decision:', error);
      const errorMessage = error.response?.data?.detail || error.message || 'Save failed';
      message.error(`Could not save decision: ${errorMessage}`);
    } finally {
      setDecisionLoadingKey(null);
    }
  };

  const handleExport = async () => {
    if (!jobResult?.job_id) {
      message.warning('Run a mapping job first');
      return;
    }

    try {
      const response = await exportStandardPartMappingJob(jobResult.job_id);
      const blob = new Blob([response.data], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      saveAs(blob, `standard-part-mapping-${jobResult.job_id}.xlsx`);
      message.success('Export ready');
    } catch (error) {
      console.error('Export failed:', error);
      message.error('Failed to export mapped workbook');
    }
  };

  const autoMatchedColumns = [
    { title: 'Source Sheet', dataIndex: 'source_sheet', key: 'source_sheet', width: 160 },
    { title: 'Position', dataIndex: 'position', key: 'position', width: 90 },
    { title: 'Source Text', dataIndex: 'source_text', key: 'source_text', width: 380 },
    { title: 'Part No', dataIndex: 'selected_part_no', key: 'selected_part_no', width: 140 },
    {
      title: 'Score',
      dataIndex: 'top_score',
      key: 'top_score',
      width: 160,
      render: (value) => <Progress percent={Math.round(value || 0)} size="small" status="success" />,
    },
  ];

  const reviewColumns = [
    { title: 'Source Sheet', dataIndex: 'source_sheet', key: 'source_sheet', width: 160 },
    { title: 'Position', dataIndex: 'position', key: 'position', width: 90 },
    { title: 'Source Text', dataIndex: 'source_text', key: 'source_text', width: 320 },
    {
      title: 'Candidates',
      dataIndex: 'candidates',
      key: 'candidates',
      width: 360,
      render: (candidates) => (
        <Space wrap>
          {(candidates || []).map((candidate) => (
            <Tag key={candidate.part_no} color="blue">
              {candidate.part_no} ({Math.round(candidate.score || 0)})
            </Tag>
          ))}
        </Space>
      ),
    },
    {
      title: 'Select Match',
      key: 'select_match',
      width: 220,
      render: (_, record) => (
        <Select
          style={{ width: '100%' }}
          placeholder="Choose candidate"
          value={selectedCandidates[record.source_row_key]}
          onChange={(value) =>
            setSelectedCandidates((prev) => ({
              ...prev,
              [record.source_row_key]: value,
            }))
          }
          options={(record.candidates || []).map((candidate) => ({
            label: `${candidate.part_no} - ${candidate.normalized_name}`,
            value: candidate.part_no,
          }))}
        />
      ),
    },
    {
      title: 'Action',
      key: 'action',
      width: 140,
      render: (_, record) => (
        <Button
          type="primary"
          onClick={() => handleSaveDecision(record)}
          loading={decisionLoadingKey === record.source_row_key}
        >
          Save
        </Button>
      ),
    },
  ];

  const unresolvedColumns = [
    { title: 'Source Sheet', dataIndex: 'source_sheet', key: 'source_sheet', width: 160 },
    { title: 'Position', dataIndex: 'position', key: 'position', width: 90 },
    { title: 'Source Text', dataIndex: 'source_text', key: 'source_text' },
  ];

  const summaryCards = useMemo(() => {
    const summary = jobResult?.summary || {};
    return [
      { title: 'Total Rows', value: summary.total_rows || 0, color: '#1677ff' },
      { title: 'Auto Matched', value: summary.auto_matched || 0, color: '#52c41a' },
      { title: 'Needs Review', value: summary.review_required || 0, color: '#faad14' },
      { title: 'Unmatched', value: summary.unmatched || 0, color: '#ff4d4f' },
    ];
  }, [jobResult]);

  const autoMatchedRows = jobResult?.auto_matched_rows || [];
  const reviewQueueRows = jobResult?.review_queue || [];
  const unmatchedRows = jobResult?.unmatched_rows || [];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h1 style={{ marginBottom: 4 }}>Standard Part Mapping</h1>
          <div style={{ color: '#666' }}>
            Deterministic standard-library mapping with manual review for ambiguous matches.
          </div>
        </div>
        <Space>
          <Button icon={<DownloadOutlined />} onClick={handleExport} disabled={!jobResult}>
            Export Mapped Workbook
          </Button>
          <Button icon={<PlayCircleOutlined />} type="primary" onClick={runMapping} loading={runLoading}>
            Run Mapping
          </Button>
        </Space>
      </div>

      <Row gutter={16} style={{ marginBottom: 20 }}>
        {summaryCards.map((card) => (
          <Col span={6} key={card.title}>
            <Card>
              <div style={{ color: '#666', marginBottom: 8 }}>{card.title}</div>
              <div style={{ fontSize: 28, fontWeight: 700, color: card.color }}>{card.value}</div>
            </Card>
          </Col>
        ))}
      </Row>

      <Row gutter={16}>
        <Col span={12}>
          <Card title="Standard Library Input" style={{ marginBottom: 16 }}>
            <Dragger
              beforeUpload={(file) => {
                setStandardFileList([{ uid: file.uid, name: file.name, originFileObj: file }]);
                return false;
              }}
              fileList={standardFileList}
              onRemove={() => setStandardFileList([])}
              accept=".xlsx,.xls"
              multiple={false}
            >
              <p className="ant-upload-drag-icon">
                <UploadOutlined />
              </p>
              <p className="ant-upload-text">Drop the standard library workbook here</p>
              <p className="ant-upload-hint">If empty, the bundled Standard data.xlsx will be used.</p>
            </Dragger>
          </Card>
        </Col>

        <Col span={12}>
          <Card title="Legacy BOM Input" style={{ marginBottom: 16 }}>
            <Dragger
              beforeUpload={(file) => {
                setLegacyFileList([{ uid: file.uid, name: file.name, originFileObj: file }]);
                return false;
              }}
              fileList={legacyFileList}
              onRemove={() => setLegacyFileList([])}
              accept=".xlsx,.xls"
              multiple={false}
            >
              <p className="ant-upload-drag-icon">
                <InboxOutlined />
              </p>
              <p className="ant-upload-text">Drop the legacy BOM workbook here</p>
              <p className="ant-upload-hint">If empty, the bundled Legacy BOM.xlsx will be used.</p>
            </Dragger>
          </Card>
        </Col>
      </Row>

      <Card title="Pipeline Status" style={{ marginBottom: 20 }} loading={statusLoading}>
        {pipelineStatus.length > 0 ? (
          <Row gutter={12}>
            {pipelineStatus.map((step) => (
              <Col span={6} key={step.step} style={{ marginBottom: 12 }}>
                <Alert
                  type={step.status === 'implemented' ? 'success' : step.status === 'partial' ? 'warning' : 'info'}
                  showIcon
                  icon={step.status === 'implemented' ? <CheckCircleOutlined /> : <WarningOutlined />}
                  message={step.step}
                  description={step.status}
                />
              </Col>
            ))}
          </Row>
        ) : (
          <Spin />
        )}
      </Card>

      {jobResult ? (
        <>
          <Card title="Job Summary" style={{ marginBottom: 20 }}>
            <Space wrap>
              <Tag color="green">Job: {jobResult.job_id}</Tag>
              <Tag color="blue">Standard rows: {jobResult.standard_library?.rows || 0}</Tag>
              <Tag color="blue">Legacy rows: {jobResult.legacy_bom?.rows || 0}</Tag>
              <Tag color="purple">Families: {(jobResult.standard_library?.families || []).join(', ') || 'n/a'}</Tag>
            </Space>
            <Divider />
            <Alert
              message="Auto-mapped rows are safe to accept immediately."
              description="Rows in the review queue have close candidates and can be resolved by a human reviewer."
              type="info"
              showIcon
            />
          </Card>

          <Card title="Auto Matched Rows" style={{ marginBottom: 20 }}>
            <Table
              columns={autoMatchedColumns}
              dataSource={autoMatchedRows}
              rowKey="source_row_key"
              pagination={{ pageSize: 10 }}
              scroll={{ x: 900 }}
              size="small"
            />
          </Card>

          <Card title="Review Queue" style={{ marginBottom: 20 }}>
            <Table
              columns={reviewColumns}
              dataSource={reviewQueueRows}
              rowKey="source_row_key"
              pagination={{ pageSize: 10 }}
              scroll={{ x: 1200 }}
              size="small"
            />
          </Card>

          <Card title="Unmatched Rows">
            <Table
              columns={unresolvedColumns}
              dataSource={unmatchedRows}
              rowKey="source_row_key"
              pagination={{ pageSize: 10 }}
              scroll={{ x: 900 }}
              size="small"
            />
          </Card>
        </>
      ) : (
        <Card>
          <div style={{ textAlign: 'center', padding: '24px 0' }}>
            <p style={{ marginBottom: 16 }}>
              Use the two upload panels above, then run the matcher to generate standard part mappings.
            </p>
            <Button type="primary" onClick={runMapping} loading={runLoading}>
              Start First Mapping Run
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
};

export default StandardPartMappingPage;
