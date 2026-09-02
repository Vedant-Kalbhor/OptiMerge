import React, { useState, useEffect } from 'react';
import {
  Card,
  Button,
  Upload,
  Table,
  Alert,
  Spin,
  message,
  Statistic,
  Row,
  Col,
  Space,
  Typography,
  Divider,
  Tag,
  Progress,
  Upload as AntdUpload
} from 'antd';
import {
  UploadOutlined,
  CalculatorOutlined,
  DownloadOutlined,
  ArrowRightOutlined,
  FileExcelOutlined
} from '@ant-design/icons';
import { useParams, useNavigate } from 'react-router-dom';
import { calculateBOMSavings, getAnalysisResults } from '../services/api';
import { saveAs } from 'file-saver';
import * as XLSX from 'xlsx';
import UploadedFileViewer from '../components/UploadedFileViewer';

const { Title, Text } = Typography;
const { Dragger } = AntdUpload;

const BOMSavingsCalculator = () => {
  const [file, setFile] = useState(null);
  const [fileData, setFileData] = useState(null); // Store parsed file data
  const [loading, setLoading] = useState(false);
  const [calculating, setCalculating] = useState(false);
  const [savingsData, setSavingsData] = useState(null);
  const [analysisData, setAnalysisData] = useState(null);
  const [sourceFile, setSourceFile] = useState(null);
  const [replacements, setReplacements] = useState([]);
  const { analysisId } = useParams();
  const navigate = useNavigate();

  // State for pagination
  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: 10,
    total: 0,
    showSizeChanger: true,
    pageSizeOptions: ['10', '20', '50', '100'],
    showTotal: (total, range) => `${range[0]}-${range[1]} of ${total} items`,
  });

  // Fetch analysis data and replacements on mount
  useEffect(() => {
    const fetchAnalysisData = async () => {
      try {
        setLoading(true);
        const response = await getAnalysisResults(analysisId);
        const data = response.data;
        const raw = data.raw || data;
        const weldmentData = raw?.weldment_pairwise || raw?.weldment_pairwise_result;
        setSourceFile(data.source_file || raw?.source_file || null);
        
        if (!weldmentData) {
          message.error('No weldment analysis data found');
          navigate('/analysis');
          return;
        }

        setAnalysisData(weldmentData);
        
        // Extract replacements from cost savings rows
        if (weldmentData.cost_savings?.has_cost_data && weldmentData.cost_savings.rows) {
          const replacementList = weldmentData.cost_savings.rows.map(row => ({
            oldComponent: row.bom_a,
            newComponent: row.bom_b,
            oldPrice: row.cost_a,
            newPrice: row.cost_b,
            priceDifference: row.old_new_price,
            matchPercentage: row.match_percentage,
            savings: row.cost_savings,
            savingsPercent: row.savings_percent
          }));
          setReplacements(replacementList);
          message.success(`Found ${replacementList.length} replacement suggestions`);
        } else {
          message.warning('No cost savings data found in the analysis. Please run an analysis with Cost and EAU columns.');
        }
      } catch (err) {
        console.error('Error fetching analysis data:', err);
        message.error('Failed to load analysis data');
      } finally {
        setLoading(false);
      }
    };

    if (analysisId) {
      fetchAnalysisData();
    }
  }, [analysisId, navigate]);

  // Update pagination when savingsData changes
  useEffect(() => {
    if (savingsData?.assemblies) {
      setPagination(prev => ({
        ...prev,
        total: savingsData.assemblies.length,
      }));
    }
  }, [savingsData]);

  const parseFile = async (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onload = (e) => {
        try {
          const data = e.target.result;
          const workbook = XLSX.read(data, { type: 'binary' });
          const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
          const jsonData = XLSX.utils.sheet_to_json(firstSheet, { header: 1 });
          
          // Get headers (first row)
          const headers = jsonData[0] || [];
          
          // Find column indices
          const componentIndex = headers.findIndex(h => 
            h.toString().toLowerCase().includes('component')
          );
          const levIndex = headers.findIndex(h => 
            h.toString().toLowerCase().includes('lev')
          );
          const quantityIndex = headers.findIndex(h => 
            h.toString().toLowerCase().includes('quantity')
          );
          const priceIndex = headers.findIndex(h => 
            h.toString().toLowerCase().includes('std') && 
            h.toString().toLowerCase().includes('price')
          );
          const currencyIndex = headers.findIndex(h => 
            h.toString().toLowerCase().includes('crcy') || 
            h.toString().toLowerCase().includes('currency')
          );
          
          // Extract data rows
          const rows = jsonData.slice(1).map((row, index) => ({
            id: index,
            component: row[componentIndex],
            lev: row[levIndex],
            quantity: row[quantityIndex],
            price: row[priceIndex],
            currency: row[currencyIndex],
            originalRow: row // Keep original row for reference
          })).filter(row => row.component && row.component.toString().trim() !== '');
          
          resolve({
            headers,
            rows,
            originalJson: jsonData,
            workbook
          });
        } catch (error) {
          reject(error);
        }
      };
      
      reader.onerror = (error) => reject(error);
      reader.readAsBinaryString(file);
    });
  };

  const handleFileUpload = async (info) => {
    const { file } = info;
    const isExcel = file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
                    file.type === 'application/vnd.ms-excel' ||
                    file.name.endsWith('.xlsx') ||
                    file.name.endsWith('.xls');
    const isCSV = file.type === 'text/csv' || file.name.endsWith('.csv');

    if (!isExcel && !isCSV) {
      message.error('Please upload an Excel or CSV file only!');
      return;
    }

    try {
      setLoading(true);
      const parsedData = await parseFile(file);
      setFileData(parsedData);
      setFile(file);
      setSavingsData(null); // Clear previous results when new file is uploaded
      message.success(`File "${file.name}" loaded successfully`);
    } catch (error) {
      console.error('Error parsing file:', error);
      message.error('Failed to parse file. Please check the file format.');
    } finally {
      setLoading(false);
    }
  };

  const handleCalculateSavings = async () => {
    if (!file) {
      message.error('Please upload a BOM file first');
      return;
    }

    if (!replacements.length) {
      message.error('No replacement data found in the analysis');
      return;
    }

    try {
      setCalculating(true);
      
      const formData = new FormData();
      formData.append('file', file);
      formData.append('analysis_id', analysisId);
      formData.append('replacements', JSON.stringify(replacements));

      const response = await calculateBOMSavings(formData);
      setSavingsData(response.data);
      
      // Reset pagination to first page
      setPagination(prev => ({
        ...prev,
        current: 1,
        total: response.data.assemblies.length,
      }));
      
      message.success('Savings calculated successfully!');
    } catch (err) {
      console.error('Error calculating savings:', err);
      message.error(err.response?.data?.detail || 'Failed to calculate savings. Please check the file format.');
    } finally {
      setCalculating(false);
    }
  };

  const handleExportResults = () => {
    if (!savingsData) {
      message.warning('No results to export');
      return;
    }

    const { assemblies, summary } = savingsData;
    
    // Create CSV content
    const headers = [
      'Assembly',
      'Component (Level=0)',
      'Quantity',
      'Original Price',
      'Currency',
      'Components with Replacements',
      'Total Price Before Replacement',
      'Total Price After Replacement',
      'Savings',
      'Savings %'
    ];

    const csvRows = [
      headers.join(','),
      ...assemblies.map(assembly => [
        assembly.assembly_code,
        assembly.component || '',
        assembly.quantity,
        assembly.original_price,
        assembly.currency,
        assembly.replaced_components?.join('; ') || '',
        assembly.total_before,
        assembly.total_after,
        assembly.savings,
        assembly.savings_percent ? `${assembly.savings_percent.toFixed(2)}%` : ''
      ].join(','))
    ];

    // Add summary section
    csvRows.push('');
    csvRows.push('SUMMARY');
    csvRows.push(`Total Assemblies,${summary.total_assemblies}`);
    csvRows.push(`Assemblies with Savings,${summary.assemblies_with_savings}`);
    csvRows.push(`Total Cost Before,${summary.total_cost_before}`);
    csvRows.push(`Total Cost After,${summary.total_cost_after}`);
    csvRows.push(`Total Savings,${summary.total_savings}`);
    csvRows.push(`Average Savings %,${summary.avg_savings_percent.toFixed(2)}%`);

    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    saveAs(blob, `bom-savings-${analysisId}-${new Date().toISOString().split('T')[0]}.csv`);
    message.success('Results exported successfully');
  };

  const handleDownloadUpdatedFile = () => {
    if (!fileData || !replacements.length || !savingsData) {
      message.warning('No data available to create updated file');
      return;
    }

    try {
      // Create a map of component replacements for quick lookup
      const replacementMap = {};
      replacements.forEach(replacement => {
        replacementMap[replacement.oldComponent] = {
          newComponent: replacement.newComponent,
          newPrice: replacement.newPrice
        };
      });

      // Create a map of assemblies and their updated prices from savings data
      const assemblyPriceMap = {};
      savingsData.assemblies.forEach(assembly => {
        assemblyPriceMap[assembly.assembly_code] = assembly.total_after;
      });

      // Create a new workbook with the updated data
      const { headers, originalJson, workbook } = fileData;
      
      // Find column indices
      const componentIndex = headers.findIndex(h => 
        h.toString().toLowerCase().includes('component')
      );
      const levIndex = headers.findIndex(h => 
        h.toString().toLowerCase().includes('lev')
      );
      const priceIndex = headers.findIndex(h => 
        h.toString().toLowerCase().includes('std') && 
        h.toString().toLowerCase().includes('price')
      );

      // Process each row and apply replacements
      const updatedJson = [...originalJson];
      
      // Start from row 1 (skip header)
      for (let i = 1; i < updatedJson.length; i++) {
        const row = updatedJson[i];
        if (row && row[componentIndex]) {
          const component = row[componentIndex].toString().trim();
          const lev = row[levIndex];
          
          // Check if this is an assembly (Lev=0)
          if (lev === 0 || lev === '0') {
            // Update assembly price with the calculated total_after
            const updatedPrice = assemblyPriceMap[component];
            if (updatedPrice !== undefined && priceIndex >= 0 && priceIndex < row.length) {
              row[priceIndex] = updatedPrice;
            }
          } else {
            // Check if this component should be replaced (for non-assembly components)
            const replacement = replacementMap[component];
            if (replacement) {
              // Update component code
              row[componentIndex] = replacement.newComponent;
              
              // Update price if price column exists
              if (priceIndex >= 0 && priceIndex < row.length) {
                row[priceIndex] = replacement.newPrice;
              }
            }
          }
        }
      }

      // Convert updated JSON back to worksheet
      const updatedWorksheet = XLSX.utils.aoa_to_sheet(updatedJson);
      
      // Create a new workbook with the updated worksheet
      const updatedWorkbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(updatedWorkbook, updatedWorksheet, 'Updated BOM');
      
      // Add a summary sheet
      const summaryData = [
        ['BOM Savings Analysis Summary'],
        ['Generated on:', new Date().toLocaleString()],
        ['Analysis ID:', analysisId],
        [],
        ['SUMMARY STATISTICS'],
        ['Total Assemblies', savingsData.summary.total_assemblies],
        ['Assemblies with Savings', savingsData.summary.assemblies_with_savings],
        ['Total Cost Before', `£${savingsData.summary.total_cost_before.toFixed(2)}`],
        ['Total Cost After', `£${savingsData.summary.total_cost_after.toFixed(2)}`],
        ['Total Savings', `£${savingsData.summary.total_savings.toFixed(2)}`],
        ['Average Savings %', `${savingsData.summary.avg_savings_percent.toFixed(2)}%`],
        [],
        ['ASSEMBLY PRICE UPDATES'],
        ['Assembly Code', 'Original Price', 'Updated Price', 'Savings'],
        ...savingsData.assemblies.map(assembly => [
          assembly.assembly_code,
          `£${assembly.total_before.toFixed(2)}`,
          `£${assembly.total_after.toFixed(2)}`,
          `£${assembly.savings.toFixed(2)}`
        ]),
        [],
        ['COMPONENT REPLACEMENTS APPLIED'],
        ['Old Component', 'New Component', 'Old Price', 'New Price', 'Price Difference', 'Savings'],
        ...replacements.map(r => [
          r.oldComponent,
          r.newComponent,
          `£${r.oldPrice}`,
          `£${r.newPrice}`,
          `£${r.priceDifference}`,
          `£${r.savings}`
        ])
      ];
      
      const summaryWorksheet = XLSX.utils.aoa_to_sheet(summaryData);
      XLSX.utils.book_append_sheet(updatedWorkbook, summaryWorksheet, 'Summary');
      
      // Generate Excel file
      const excelBuffer = XLSX.write(updatedWorkbook, { 
        bookType: 'xlsx', 
        type: 'array' 
      });
      
      const blob = new Blob([excelBuffer], { 
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
      });
      
      saveAs(blob, `updated-bom-${analysisId}-${new Date().toISOString().split('T')[0]}.xlsx`);
      message.success('Updated BOM file downloaded successfully!');
      
    } catch (error) {
      console.error('Error creating updated file:', error);
      message.error('Failed to create updated file');
    }
  };

  // Handle table pagination change
  const handleTableChange = (newPagination) => {
    setPagination({
      ...pagination,
      current: newPagination.current,
      pageSize: newPagination.pageSize,
    });
  };

  const columns = [
    {
      title: 'Assembly',
      dataIndex: 'assembly_code',
      key: 'assembly_code',
      render: (text) => <Text strong>{text}</Text>,
      fixed: 'left',
      width: 120,
    },
    {
      title: 'Quantity',
      dataIndex: 'quantity',
      key: 'quantity',
      align: 'right',
      width: 80,
    },
    {
      title: 'Original Price',
      dataIndex: 'original_price',
      key: 'original_price',
      align: 'right',
      width: 120,
      render: (value) => `£${Number(value).toFixed(2)}`
    },
    {
      title: 'Currency',
      dataIndex: 'currency',
      key: 'currency',
      width: 100,
      render: (text) => <Tag color="blue">{text}</Tag>
    },
    {
      title: 'Replacements',
      dataIndex: 'replaced_components',
      key: 'replaced_components',
      width: 200,
      render: (components) => (
        components?.length > 0 ? (
          <Space direction="vertical" size="small">
            {components.map((comp, idx) => (
              <Text key={idx} type="success" style={{ fontSize: '12px' }}>{comp}</Text>
            ))}
          </Space>
        ) : <Text type="secondary">None</Text>
      )
    },
    {
      title: 'Price Before',
      dataIndex: 'total_before',
      key: 'total_before',
      align: 'right',
      width: 130,
      render: (value) => `£${Number(value).toFixed(2)}`
    },
    {
      title: 'Price After',
      dataIndex: 'total_after',
      key: 'total_after',
      align: 'right',
      width: 130,
      render: (value) => (
        <Text strong type="success">
          £{Number(value).toFixed(2)}
        </Text>
      )
    },
    {
      title: 'Savings',
      dataIndex: 'savings',
      key: 'savings',
      align: 'right',
      width: 120,
      render: (value) => (
        <Text strong type="danger">
          -£{Number(value).toFixed(2)}
        </Text>
      )
    },
    {
      title: 'Savings %',
      dataIndex: 'savings_percent',
      key: 'savings_percent',
      align: 'right',
      width: 120,
      render: (value) => (
        <Progress
          percent={Math.min(value || 0, 100)}
          size="small"
          format={(percent) => `${(percent || 0).toFixed(1)}%`}
          strokeColor={(value || 0) > 0 ? '#52c41a' : '#ff4d4f'}
        />
      )
    }
  ];

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 50 }}>
        <Spin size="large" />
        <p>Loading analysis data...</p>
      </div>
    );
  }

  return (
    <div>
      <Title level={2}>
        <CalculatorOutlined /> BOM Savings Calculator
      </Title>

      {sourceFile && (
        <Card style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontWeight: 600 }}>Source File</div>
              <div style={{ color: '#666' }}>{sourceFile.filename}</div>
            </div>
            <UploadedFileViewer sourceFile={sourceFile} buttonText="View Uploaded File" />
          </div>
        </Card>
      )}
      
      <Alert
        message="Instructions"
        description="Upload a BOM file with columns: Component, Lev, Quantity, Std price, Crcy. The calculator will apply weldment replacements from your analysis to calculate potential savings."
        type="info"
        showIcon
        style={{ marginBottom: 24 }}
      />

      <Row gutter={[24, 24]}>
        <Col span={24}>
          <Card title="Analysis Details" style={{ marginBottom: 24 }}>
            {analysisData && (
              <Row gutter={16}>
                <Col span={8}>
                  <Statistic
                    title="Analysis ID"
                    value={analysisId}
                    valueStyle={{ fontSize: '16px', fontFamily: 'monospace' }}
                  />
                </Col>
                <Col span={8}>
                  <Statistic
                    title="Replacements Found"
                    value={replacements.length}
                    valueStyle={{ color: '#1890ff' }}
                  />
                </Col>
                <Col span={8}>
                  <Statistic
                    title="Potential Groups"
                    value={analysisData.cost_savings?.statistics?.num_groups || 0}
                  />
                </Col>
              </Row>
            )}
          </Card>
        </Col>

        <Col span={12}>
          <Card
            title="Upload BOM File"
            actions={[
              <Button
                key="calculate"
                type="primary"
                icon={<CalculatorOutlined />}
                onClick={handleCalculateSavings}
                loading={calculating}
                disabled={!file || !replacements.length}
                block
              >
                Calculate Savings
              </Button>
            ]}
          >
            <Dragger
              accept=".xlsx,.xls,.csv"
              beforeUpload={() => false}
              onChange={handleFileUpload}
              showUploadList={true}
              maxCount={1}
            >
              <p className="ant-upload-drag-icon">
                <UploadOutlined />
              </p>
              <p className="ant-upload-text">Click or drag file to upload</p>
              <p className="ant-upload-hint">
                Supports Excel (.xlsx, .xls) and CSV files
              </p>
            </Dragger>
            
            <Divider style={{ margin: '16px 0' }}>File Requirements</Divider>
            <Space direction="vertical" size="small" style={{ width: '100%' }}>
              <Text>Required columns:</Text>
              <Space wrap>
                <Tag color="blue">Component</Tag>
                <Tag color="blue">Lev</Tag>
                <Tag color="blue">Quantity</Tag>
                <Tag color="blue">Std price</Tag>
                <Tag color="blue">Crcy</Tag>
              </Space>
            </Space>
          </Card>
        </Col>

        <Col span={12}>
          <Card 
            title="Replacement Summary" 
            extra={<Text type="secondary">{replacements.length} replacements</Text>}
          >
            {replacements.length > 0 ? (
              <Table
                size="small"
                dataSource={replacements.slice(0, 5)}
                pagination={false}
                scroll={{ y: 200 }}
                columns={[
                  {
                    title: 'Old Component',
                    dataIndex: 'oldComponent',
                    key: 'oldComponent',
                    render: (text) => <Text type="danger">{text}</Text>
                  },
                  {
                    title: '→',
                    key: 'arrow',
                    width: 50,
                    align: 'center',
                    render: () => <ArrowRightOutlined style={{ color: '#52c41a' }} />
                  },
                  {
                    title: 'New Component',
                    dataIndex: 'newComponent',
                    key: 'newComponent',
                    render: (text) => <Text type="success">{text}</Text>
                  },
                  {
                    title: 'Price Diff',
                    dataIndex: 'priceDifference',
                    key: 'priceDifference',
                    align: 'right',
                    render: (value) => `£${Number(value).toFixed(2)}`
                  }
                ]}
                rowKey="oldComponent"
                footer={() => (
                  <div style={{ textAlign: 'center', padding: '8px 0' }}>
                    <Text type="secondary">
                      Showing {Math.min(replacements.length, 5)} of {replacements.length} replacements
                    </Text>
                  </div>
                )}
              />
            ) : (
              <Alert
                message="No replacements found"
                description="The analysis doesn't contain any cost-saving replacements. Please run a weldment analysis with Cost and EAU columns."
                type="warning"
                showIcon
              />
            )}
          </Card>
        </Col>
      </Row>

      {savingsData && (
        <>
          <Card
            title="Savings Results"
            style={{ marginTop: 24 }}
            extra={
              <Space>
                <Button
                  icon={<DownloadOutlined />}
                  onClick={handleExportResults}
                  type="primary"
                >
                  Export Results
                </Button>
                <Button
                  icon={<FileExcelOutlined />}
                  onClick={handleDownloadUpdatedFile}
                  type="default"
                  disabled={!file || !replacements.length || !savingsData}
                >
                  Download Updated File
                </Button>
              </Space>
            }
          >
            <Row gutter={16} style={{ marginBottom: 24 }}>
              <Col span={4}>
                <Card>
                  <Statistic
                    title="Total Assemblies"
                    value={savingsData.summary.total_assemblies}
                    valueStyle={{ color: '#1890ff' }}
                  />
                </Card>
              </Col>
              <Col span={4}>
                <Card>
                  <Statistic
                    title="With Savings"
                    value={savingsData.summary.assemblies_with_savings}
                    valueStyle={{ color: '#52c41a' }}
                  />
                </Card>
              </Col>
              <Col span={4}>
                <Card>
                  <Statistic
                    title="Total Cost Before"
                    value={savingsData.summary.total_cost_before}
                    prefix="£"
                    precision={2}
                    valueStyle={{ color: '#faad14' }}
                  />
                </Card>
              </Col>
              <Col span={4}>
                <Card>
                  <Statistic
                    title="Total Cost After"
                    value={savingsData.summary.total_cost_after}
                    prefix="£"
                    precision={2}
                    valueStyle={{ color: '#13c2c2' }}
                  />
                </Card>
              </Col>
              <Col span={4}>
                <Card>
                  <Statistic
                    title="Total Savings"
                    value={savingsData.summary.total_savings}
                    prefix="£"
                    precision={2}
                    valueStyle={{ color: '#ff4d4f', fontWeight: 'bold' }}
                  />
                </Card>
              </Col>
              <Col span={4}>
                <Card>
                  <Statistic
                    title="Avg Savings %"
                    value={savingsData.summary.avg_savings_percent}
                    precision={2}
                    suffix="%"
                    valueStyle={{ color: '#722ed1', fontWeight: 'bold' }}
                  />
                </Card>
              </Col>
            </Row>

            <Table
              columns={columns}
              dataSource={savingsData.assemblies}
              pagination={{
                ...pagination,
                position: ['bottomRight'],
                showTotal: (total, range) => `${range[0]}-${range[1]} of ${total} items`,
                showSizeChanger: true,
                showQuickJumper: true,
                pageSizeOptions: ['10', '20', '50', '100'],
              }}
              onChange={handleTableChange}
              rowKey="assembly_code"
              scroll={{ x: 1200 }}
              summary={pageData => {
                if (!pageData.length) return null;
                
                return (
                  <Table.Summary.Row style={{ background: '#fafafa' }}>
                    <Table.Summary.Cell index={0} colSpan={5}>
                      <Text strong>Total</Text>
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={5} align="right">
                      <Text strong>£{savingsData.summary.total_cost_before.toFixed(2)}</Text>
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={6} align="right">
                      <Text strong type="success">
                        £{savingsData.summary.total_cost_after.toFixed(2)}
                      </Text>
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={7} align="right">
                      <Text strong type="danger">
                        -£{savingsData.summary.total_savings.toFixed(2)}
                      </Text>
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={8} align="right">
                      <Text strong>
                        {savingsData.summary.avg_savings_percent.toFixed(2)}%
                      </Text>
                    </Table.Summary.Cell>
                  </Table.Summary.Row>
                );
              }}
            />
          </Card>
        </>
      )}
    </div>
  );
};

export default BOMSavingsCalculator;
