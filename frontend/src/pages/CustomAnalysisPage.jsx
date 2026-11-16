import React, { useState, useEffect } from 'react';
import {
  Card,
  Row,
  Col,
  Button,
  Input,
  InputNumber,
  Select,
  Switch,
  Table,
  Upload,
  Space,
  Tag,
  Alert,
  Divider,
  Popconfirm,
  Slider,
  Tooltip,
  Typography,
  message,
  Modal
} from 'antd';
import {
  PlusOutlined,
  DeleteOutlined,
  EditOutlined,
  InboxOutlined,
  ArrowLeftOutlined,
  SaveOutlined,
  CheckCircleOutlined,
  InfoCircleOutlined,
  CalculatorOutlined
} from '@ant-design/icons';
import * as XLSX from 'xlsx';
import {
  getCustomAnalyses,
  saveCustomAnalysis,
  updateCustomAnalysis,
  deleteCustomAnalysis
} from '../services/api';

const { Title, Text, Paragraph } = Typography;
const { Dragger } = Upload;
const { Option } = Select;

const COMPARISON_TYPES = [
  {
    value: 'numeric_proximity',
    label: 'Numeric Proximity (Continuous %)',
    desc: 'Calculates relative closeness on a 0-100% sliding scale. Ideal for dimensions (length, diameter, weight).'
  },
  {
    value: 'tolerance',
    label: 'Tolerance Margin (Pass / Fail within ±Δ)',
    desc: 'Matches 100% if difference is within ± tolerance, otherwise 0%. Ideal for strict manufacturing limits.'
  },
  {
    value: 'exact_text',
    label: 'Exact Text (Categorical Match)',
    desc: 'Matches 100% if text is identical (case-insensitive). Ideal for material, finish, supplier.'
  }
];

const CustomAnalysisPage = () => {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [viewMode, setViewMode] = useState('list'); // 'list' or 'editor'

  // Form state
  const [editingId, setEditingId] = useState(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [identifierCol, setIdentifierCol] = useState('');
  const [defaultThreshold, setDefaultThreshold] = useState(75);
  const [columns, setColumns] = useState([]);

  useEffect(() => {
    loadTemplates();
  }, []);

  const loadTemplates = async () => {
    try {
      setLoading(true);
      const res = await getCustomAnalyses();
      setTemplates(res.data || []);
    } catch (err) {
      console.error('Failed to load templates:', err);
      message.error('Failed to load custom analysis templates.');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateNew = () => {
    setEditingId(null);
    setName('');
    setDescription('');
    setIdentifierCol('');
    setDefaultThreshold(75);
    setColumns([]);
    setViewMode('editor');
  };

  const handleEdit = (template) => {
    setEditingId(template.id);
    setName(template.name || '');
    setDescription(template.description || '');
    setIdentifierCol(template.identifier_column || '');
    setDefaultThreshold(template.default_threshold ?? 75);
    setColumns(
      (template.columns || []).map((col, index) => ({
        key: index,
        name: col.name,
        type: col.type || 'numeric_proximity',
        weight: col.weight ?? 0,
        tolerance: col.tolerance ?? null,
        included: col.included ?? true
      }))
    );
    setViewMode('editor');
  };

  const handleDelete = async (id) => {
    try {
      setLoading(true);
      await deleteCustomAnalysis(id);
      message.success('Custom analysis template deleted successfully.');
      loadTemplates();
    } catch (err) {
      console.error('Failed to delete template:', err);
      message.error('Failed to delete template.');
    } finally {
      setLoading(false);
    }
  };

  // Extract columns from dropped Excel/CSV file
  const handleSampleFileUpload = async (file) => {
    try {
      const lowerName = file.name.toLowerCase();
      let workbook;
      if (lowerName.endsWith('.csv')) {
        const text = await file.text();
        workbook = XLSX.read(text, { type: 'string' });
      } else {
        const buffer = await file.arrayBuffer();
        workbook = XLSX.read(buffer, { type: 'array' });
      }

      const firstSheet = workbook.SheetNames[0];
      if (!firstSheet) {
        message.warning('The uploaded workbook contains no sheets.');
        return false;
      }

      const worksheet = workbook.Sheets[firstSheet];
      const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, blankrows: false });
      const headerRow = rows.find(
        (row) => Array.isArray(row) && row.some((cell) => String(cell ?? '').trim() !== '')
      );

      if (!headerRow || headerRow.length === 0) {
        message.warning('Could not find header row in the sample file.');
        return false;
      }

      const extractedHeaders = headerRow
        .map((cell) => String(cell ?? '').trim())
        .filter(Boolean);

      if (extractedHeaders.length === 0) {
        message.warning('No column headers detected in the sample file.');
        return false;
      }

      // Check first data row to guess types (numeric vs text)
      const dataRowIndex = rows.indexOf(headerRow) + 1;
      const dataRow = rows[dataRowIndex] || [];

      // Build new column list
      const count = extractedHeaders.length;
      const equalWeight = count > 0 ? parseFloat((100 / count).toFixed(1)) : 0;

      const newColumns = extractedHeaders.map((header, idx) => {
        const sampleVal = dataRow[idx];
        const isNumeric =
          sampleVal !== undefined &&
          sampleVal !== null &&
          sampleVal !== '' &&
          !isNaN(Number(sampleVal));

        return {
          key: Date.now() + idx,
          name: header,
          type: isNumeric ? 'numeric_proximity' : 'exact_text',
          weight: equalWeight,
          tolerance: isNumeric ? 0.5 : null,
          included: true
        };
      });

      setColumns(newColumns);

      // Guess part identifier column if not set
      const idMatch = extractedHeaders.find((h) =>
        /^(part|item|assy|name|drawing|number|code|id|no)/i.test(h)
      );
      if (idMatch) {
        setIdentifierCol(idMatch);
      } else if (extractedHeaders.length > 0) {
        setIdentifierCol(extractedHeaders[0]);
      }

      message.success(`Extracted ${extractedHeaders.length} columns from ${file.name}`);
    } catch (err) {
      console.error('File extraction error:', err);
      message.error('Failed to extract headers from the sample file.');
    }

    return false; // Prevent automatic upload by antd Dragger
  };

  // Add column manually
  const handleAddColumn = () => {
    const newKey = Date.now();
    const newCol = {
      key: newKey,
      name: `Column_${columns.length + 1}`,
      type: 'numeric_proximity',
      weight: 0,
      tolerance: 0.5,
      included: true
    };
    setColumns([...columns, newCol]);
  };

  // Update specific column field
  const handleColumnChange = (key, field, value) => {
    setColumns((prev) =>
      prev.map((col) => {
        if (col.key !== key) return col;
        const updated = { ...col, [field]: value };
        if (field === 'type' && value !== 'tolerance') {
          updated.tolerance = null;
        } else if (field === 'type' && value === 'tolerance' && !updated.tolerance) {
          updated.tolerance = 0.5;
        }
        return updated;
      })
    );
  };

  // Remove column
  const handleRemoveColumn = (key) => {
    setColumns((prev) => prev.filter((col) => col.key !== key));
  };

  // Auto-balance weights across all included columns
  const handleAutoBalanceWeights = () => {
    const includedCols = columns.filter((c) => c.included);
    if (includedCols.length === 0) {
      message.warning('No columns are marked as included.');
      return;
    }

    const equalWeight = parseFloat((100 / includedCols.length).toFixed(2));
    setColumns((prev) =>
      prev.map((col) => ({
        ...col,
        weight: col.included ? equalWeight : 0
      }))
    );
    message.success(`Evenly distributed weights (~${equalWeight}% each).`);
  };

  // Save template
  const handleSave = async () => {
    if (!name.trim()) {
      message.error('Please enter an analysis template name.');
      return;
    }

    const includedCols = columns.filter((c) => c.included && c.name.trim() !== '');
    if (includedCols.length === 0) {
      message.error('Please include at least one column for comparison.');
      return;
    }

    if (!identifierCol) {
      message.error('Please select an Item Identifier Column.');
      return;
    }

    const totalWeight = includedCols.reduce((sum, c) => sum + (Number(c.weight) || 0), 0);
    if (Math.abs(totalWeight - 100) > 1.0) {
      Modal.confirm({
        title: 'Weight sum is not 100%',
        content: `The sum of included column weights is currently ${totalWeight.toFixed(1)}%. Do you want to auto-normalize weights to 100% and proceed?`,
        okText: 'Normalize and Save',
        cancelText: 'Edit Weights',
        onOk: async () => {
          const factor = totalWeight > 0 ? 100 / totalWeight : 1;
          const normalizedCols = columns.map((c) => ({
            ...c,
            weight: c.included ? parseFloat(((Number(c.weight) || 0) * factor).toFixed(2)) : 0
          }));
          await submitTemplate(normalizedCols);
        }
      });
      return;
    }

    await submitTemplate(columns);
  };

  const submitTemplate = async (colsToSave) => {
    try {
      setSaving(true);
      const payload = {
        name: name.trim(),
        description: description.trim(),
        identifier_column: identifierCol,
        default_threshold: Number(defaultThreshold),
        columns: colsToSave.map((c) => ({
          name: c.name.trim(),
          type: c.type,
          weight: Number(c.weight) || 0,
          tolerance: c.type === 'tolerance' ? Number(c.tolerance) || 0 : null,
          included: c.included
        }))
      };

      if (editingId) {
        await updateCustomAnalysis(editingId, payload);
        message.success('Custom analysis template updated successfully.');
      } else {
        await saveCustomAnalysis(payload);
        message.success('Custom analysis template created successfully.');
      }

      setViewMode('list');
      loadTemplates();
    } catch (err) {
      console.error('Failed to save template:', err);
      message.error('Failed to save custom analysis template.');
    } finally {
      setSaving(false);
    }
  };

  // Calculations for summary
  const includedCount = columns.filter((c) => c.included).length;
  const totalWeight = columns
    .filter((c) => c.included)
    .reduce((sum, c) => sum + (Number(c.weight) || 0), 0);
  const isWeightValid = Math.abs(totalWeight - 100) <= 0.5;

  // Columns for the configuration table
  const tableColumns = [
    {
      title: 'Include',
      dataIndex: 'included',
      key: 'included',
      width: 80,
      render: (checked, record) => (
        <Switch
          checked={checked}
          size="small"
          onChange={(val) => handleColumnChange(record.key, 'included', val)}
        />
      )
    },
    {
      title: 'Column Header in Excel',
      dataIndex: 'name',
      key: 'name',
      width: 200,
      render: (val, record) => (
        <Input
          value={val}
          placeholder="e.g. Length"
          onChange={(e) => handleColumnChange(record.key, 'name', e.target.value)}
          disabled={!record.included}
        />
      )
    },
    {
      title: 'Comparison Type',
      dataIndex: 'type',
      key: 'type',
      width: 280,
      render: (val, record) => (
        <Select
          value={val}
          style={{ width: '100%' }}
          disabled={!record.included}
          onChange={(selected) => handleColumnChange(record.key, 'type', selected)}
        >
          {COMPARISON_TYPES.map((t) => (
            <Option key={t.value} value={t.value}>
              <Tooltip title={t.desc} placement="topLeft">
                <div>{t.label}</div>
              </Tooltip>
            </Option>
          ))}
        </Select>
      )
    },
    {
      title: 'Tolerance (±Δ)',
      dataIndex: 'tolerance',
      key: 'tolerance',
      width: 140,
      render: (val, record) => (
        <InputNumber
          value={val}
          min={0}
          step={0.1}
          placeholder="± Value"
          disabled={!record.included || record.type !== 'tolerance'}
          style={{ width: '100%' }}
          onChange={(num) => handleColumnChange(record.key, 'tolerance', num)}
        />
      )
    },
    {
      title: 'Weight (%)',
      dataIndex: 'weight',
      key: 'weight',
      width: 130,
      render: (val, record) => (
        <InputNumber
          value={val}
          min={0}
          max={100}
          step={1}
          style={{ width: '100%' }}
          disabled={!record.included}
          onChange={(num) => handleColumnChange(record.key, 'weight', num)}
        />
      )
    },
    {
      title: 'Action',
      key: 'action',
      width: 80,
      render: (_, record) => (
        <Button
          type="text"
          danger
          icon={<DeleteOutlined />}
          onClick={() => handleRemoveColumn(record.key)}
        />
      )
    }
  ];

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', paddingBottom: 40 }}>
      {viewMode === 'list' ? (
        <div>
          {/* Header Row */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 24
            }}
          >
            <div>
              <Title level={2} style={{ margin: 0 }}>
                Custom Analysis Templates
              </Title>
              <Text type="secondary">
                Define custom column detection rules and similarity calculations for your specific Excel files.
              </Text>
            </div>
            <Button
              type="primary"
              size="large"
              icon={<PlusOutlined />}
              onClick={handleCreateNew}
            >
              Create Custom Analysis
            </Button>
          </div>

          {/* List of existing templates */}
          {templates.length === 0 && !loading ? (
            <Card style={{ textAlign: 'center', padding: '60px 20px' }}>
              <Title level={4}>No Custom Analyses Created Yet</Title>
              <Paragraph type="secondary">
                You can create a custom analysis tailored to your specific Excel structure by extracting headers from a sample file or adding columns manually.
              </Paragraph>
              <Button type="primary" icon={<PlusOutlined />} onClick={handleCreateNew}>
                Create Your First Custom Analysis
              </Button>
            </Card>
          ) : (
            <Row gutter={[16, 16]}>
              {templates.map((tpl) => (
                <Col xs={24} md={12} key={tpl.id}>
                  <Card
                    title={
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: 16, fontWeight: 600 }}>{tpl.name}</span>
                        <Tag color="blue">Threshold: {tpl.default_threshold ?? 75}%</Tag>
                      </div>
                    }
                    extra={
                      <Space>
                        <Button
                          type="text"
                          icon={<EditOutlined />}
                          onClick={() => handleEdit(tpl)}
                        >
                          Edit
                        </Button>
                        <Popconfirm
                          title="Delete Template"
                          description="Are you sure you want to delete this custom analysis template?"
                          onConfirm={() => handleDelete(tpl.id)}
                          okText="Delete"
                          okType="danger"
                          cancelText="Cancel"
                        >
                          <Button type="text" danger icon={<DeleteOutlined />} />
                        </Popconfirm>
                      </Space>
                    }
                  >
                    <Paragraph type="secondary" ellipsis={{ rows: 2 }}>
                      {tpl.description || 'No description provided.'}
                    </Paragraph>

                    <Divider style={{ margin: '12px 0' }} />

                    <div style={{ marginBottom: 8 }}>
                      <Text strong>Part Identifier Column: </Text>
                      <Tag color="cyan">{tpl.identifier_column || 'Not specified'}</Tag>
                    </div>

                    <div>
                      <Text strong>Compared Columns ({tpl.columns?.filter((c) => c.included)?.length || 0}):</Text>
                      <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {(tpl.columns || [])
                          .filter((c) => c.included)
                          .map((col, idx) => (
                            <Tag key={idx} color="default">
                              {col.name} ({col.weight}% - {col.type === 'tolerance' ? `Tol ±${col.tolerance}` : col.type.replace('_', ' ')})
                            </Tag>
                          ))}
                      </div>
                    </div>
                  </Card>
                </Col>
              ))}
            </Row>
          )}
        </div>
      ) : (
        /* Editor Mode */
        <div>
          <div style={{ marginBottom: 20 }}>
            <Button
              icon={<ArrowLeftOutlined />}
              onClick={() => setViewMode('list')}
              style={{ marginBottom: 12 }}
            >
              Back to Templates
            </Button>
            <Title level={2} style={{ margin: 0 }}>
              {editingId ? 'Edit Custom Analysis Template' : 'Create Custom Analysis Template'}
            </Title>
            <Text type="secondary">
              Configure detection headers, comparison types, tolerances, and column weights.
            </Text>
          </div>

          <Card title="1. Analysis Information" style={{ marginBottom: 20 }}>
            <Row gutter={16}>
              <Col xs={24} md={12}>
                <div style={{ marginBottom: 16 }}>
                  <Text strong>Analysis Name *</Text>
                  <Input
                    placeholder="e.g. Sheet Metal Brackets, Flange Specs"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    style={{ marginTop: 6 }}
                  />
                </div>
              </Col>
              <Col xs={24} md={12}>
                <div style={{ marginBottom: 16 }}>
                  <Text strong>Part / Item Identifier Column *</Text>
                  <Select
                    showSearch
                    placeholder="Select column that identifies the part number/row"
                    value={identifierCol || undefined}
                    onChange={(val) => setIdentifierCol(val)}
                    style={{ width: '100%', marginTop: 6 }}
                  >
                    {columns.map((col) => (
                      <Option key={col.name} value={col.name}>
                        {col.name}
                      </Option>
                    ))}
                  </Select>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    Used as the label for each item in pairwise comparison results.
                  </Text>
                </div>
              </Col>
            </Row>

            <Row gutter={16}>
              <Col xs={24} md={16}>
                <div style={{ marginBottom: 16 }}>
                  <Text strong>Description</Text>
                  <Input.TextArea
                    rows={2}
                    placeholder="Optional details about standard tolerances, part categories, or drawing sources"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    style={{ marginTop: 6 }}
                  />
                </div>
              </Col>
              <Col xs={24} md={8}>
                <div style={{ marginBottom: 16 }}>
                  <Text strong>Default Similarity Threshold: {defaultThreshold}%</Text>
                  <Slider
                    min={0}
                    max={100}
                    value={defaultThreshold}
                    onChange={(val) => setDefaultThreshold(val)}
                    style={{ marginTop: 12 }}
                  />
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    Pairs scoring equal to or above this percentage are flagged as similar.
                  </Text>
                </div>
              </Col>
            </Row>
          </Card>

          <Card
            title="2. Column Definition & Comparison Rules"
            style={{ marginBottom: 20 }}
            extra={
              <Space>
                <Button
                  icon={<CalculatorOutlined />}
                  onClick={handleAutoBalanceWeights}
                  disabled={columns.length === 0}
                >
                  Auto-Balance Weights
                </Button>
                <Button
                  type="primary"
                  icon={<PlusOutlined />}
                  onClick={handleAddColumn}
                >
                  Add Column Manually
                </Button>
              </Space>
            }
          >
            {/* Sample file upload box */}
            <div style={{ marginBottom: 20 }}>
              <Dragger
                name="sample_file"
                multiple={false}
                showUploadList={false}
                beforeUpload={handleSampleFileUpload}
                accept=".xlsx,.xls,.csv"
                style={{ padding: '12px 0' }}
              >
                <p className="ant-upload-drag-icon" style={{ marginBottom: 8 }}>
                  <InboxOutlined style={{ fontSize: 32, color: '#1890ff' }} />
                </p>
                <p className="ant-upload-text" style={{ fontSize: 15, margin: 0 }}>
                  Click or drag a sample Excel / CSV file here to auto-extract columns
                </p>
                <p className="ant-upload-hint" style={{ fontSize: 12, margin: '4px 0 0' }}>
                  The header row will automatically populate the table below.
                </p>
              </Dragger>
            </div>

            {/* Columns Table */}
            <Table
              dataSource={columns}
              columns={tableColumns}
              pagination={false}
              size="middle"
              rowKey="key"
              locale={{ emptyText: 'No columns added. Upload a sample file above or click "Add Column Manually".' }}
            />

            {/* Weight Status Alert */}
            {columns.length > 0 && (
              <div style={{ marginTop: 16 }}>
                {!isWeightValid ? (
                  <Alert
                    type="warning"
                    showIcon
                    message={
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span>
                          Total included weight is <strong>{totalWeight.toFixed(1)}%</strong> (must equal 100%).
                        </span>
                        <Button size="small" type="link" onClick={handleAutoBalanceWeights}>
                          Evenly Distribute Weights
                        </Button>
                      </div>
                    }
                  />
                ) : (
                  <Alert
                    type="success"
                    showIcon
                    message={`Total weight equals 100% across ${includedCount} included column(s).`}
                  />
                )}
              </div>
            )}
          </Card>

          {/* Action buttons */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
            <Button size="large" onClick={() => setViewMode('list')}>
              Cancel
            </Button>
            <Button
              type="primary"
              size="large"
              icon={<SaveOutlined />}
              loading={saving}
              onClick={handleSave}
            >
              Save Analysis Template
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default CustomAnalysisPage;
