import React, { useEffect, useState } from 'react';
import { Card, Table, Button, Alert, Spin, message, Collapse, Typography } from 'antd';
import { DownloadOutlined } from '@ant-design/icons';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { getAnalysisResults } from '../services/api';
import { saveAs } from 'file-saver';

const { Panel } = Collapse;
const { Text } = Typography;

const PipeReplacementSuggestion = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { analysisId } = useParams();

  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState(null);
  const [groups, setGroups] = useState([]);
  const [perVariantRows, setPerVariantRows] = useState([]);
  const [overallSavings, setOverallSavings] = useState({
    totalOriginal: 0,
    totalSavings: 0,
    avgAbsSavings: 0,
    savingsPct: 0
  });

  useEffect(() => {
    const fromState =
      location.state?.pipeAnalysis ||
      location.state?.analysisResults ||
      location.state?.suggestions;

    if (fromState) {
      setAnalysis(fromState);
      processReplacementData(fromState);
    } else if (analysisId) {
      loadAnalysis(analysisId);
    } else {
      message.error('Pipe analysis data not found');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analysisId, location.state]);

  const loadAnalysis = async (id) => {
    try {
      setLoading(true);
      const resp = await getAnalysisResults(id);
      setAnalysis(resp.data);
      processReplacementData(resp.data);
    } catch (err) {
      console.error('Failed to load pipe analysis:', err);
      message.error('Unable to load pipe analysis results');
    } finally {
      setLoading(false);
    }
  };

  const round2 = (v) => Math.round((Number(v) || 0) * 100) / 100;
  const round4 = (v) => Math.round((Number(v) || 0) * 10000) / 10000;

  const currencySymbol = (curr) => {
    if (!curr) return '';
    const map = {
      GBP: '£',
      gbp: '£',
      USD: '$',
      usd: '$',
      EUR: '€',
      eur: '€',
      INR: '₹',
      inr: '₹'
    };
    return map[curr] || curr;
  };

  const fmtMoney = (val, currCode) => {
    const sym = currencySymbol(currCode || 'GBP');
    const v = Number(val || 0).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
    return `${sym}${v}`;
  };

  const processReplacementData = (data) => {
    const pipeAnalysis =
      data?.pipe_pairwise ||
      data?.pipe_pairwise_result ||
      data?.pipe_pairwise_analysis ||
      data;

    const replacementData = pipeAnalysis?.replacement_suggestions;

    if (!replacementData) {
      setGroups([]);
      setPerVariantRows([]);
      setOverallSavings({
        totalOriginal: 0,
        totalSavings: 0,
        avgAbsSavings: 0,
        savingsPct: 0
      });
      return;
    }

    const backendGroups = Array.isArray(replacementData.groups)
      ? replacementData.groups
      : [];

    const backendRows = Array.isArray(replacementData.replacement_rows)
      ? replacementData.replacement_rows
      : [];

    const formattedGroups = backendGroups.map((group, index) => ({
      key: group.group_id || `G${String(index + 1).padStart(3, '0')}`,
      groupId: group.group_id || `G${String(index + 1).padStart(3, '0')}`,
      members: Array.isArray(group.members) ? group.members : [],
      cheapestItem: group.cheapest_item || '',
      cheapestPrice: Number(group.cheapest_price || 0),
      totalSavings: Number(group.total_savings || 0),
      replacements: Array.isArray(group.replacements)
        ? group.replacements
        : []
    }));

    const formattedRows = backendRows.map((row) => ({
      groupId: row.group_id,
      fromId: row.from_item,
      toId: row.to_item,
      costFrom: Number(row.cost_from || 0),
      costTo: Number(row.cost_to || 0),
      savingAbs: Number(row.saving_abs || 0),
      savingPct: Number(row.saving_pct || 0)
    }));

    const summary = replacementData.summary || {};

    setGroups(formattedGroups);
    setPerVariantRows(formattedRows);
    setOverallSavings({
      totalOriginal: round4(summary.total_original_cost || 0),
      totalSavings: round4(summary.total_savings || 0),
      avgAbsSavings: round4(summary.average_savings || 0),
      savingsPct: round4(summary.average_savings_percent || 0)
    });
  };

  const handleExportCSV = () => {
    if (!perVariantRows.length) {
      message.warning('No replacement rows to export');
      return;
    }

    const header = [
      'GroupID',
      'PipeToReplace',
      'ReplaceWith',
      'CostOriginal',
      'CostReplacement',
      'SavingAbs',
      'SavingPct'
    ];

    const rows = perVariantRows.map((r) => [
      r.groupId,
      r.fromId,
      r.toId,
      Number(r.costFrom || 0).toFixed(2),
      Number(r.costTo || 0).toFixed(2),
      Number(r.savingAbs || 0).toFixed(2),
      Number(r.savingPct || 0).toFixed(4)
    ]);

    rows.push([]);

    rows.push([
      'Total Savings',
      '',
      '',
      '',
      '',
      Number(overallSavings.totalSavings || 0).toFixed(2),
      `${Number(overallSavings.savingsPct || 0).toFixed(4)}%`
    ]);

    const csv = [header, ...rows]
      .map((r) =>
        r.length
          ? r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')
          : ''
      )
      .join('\n');

    const blob = new Blob([csv], {
      type: 'text/csv;charset=utf-8;'
    });

    saveAs(
      blob,
      `pipe-replacement-rows-${new Date()
        .toISOString()
        .slice(0, 19)
        .replace(/[:T]/g, '-')}.csv`
    );

    message.success('CSV exported');
  };

  const getPipeLabel = (pipe, price) => {
    return `${pipe} (${fmtMoney(price)})`;
  };

  const pipeAnalysis =
    analysis?.pipe_pairwise ||
    analysis?.pipe_pairwise_result ||
    analysis;

  const replacementData =
    pipeAnalysis?.replacement_suggestions || {};

  const priceAvailable =
    pipeAnalysis?.price_available === true ||
    replacementData?.price_available === true;

  const totalPipes =
    Number(pipeAnalysis?.parameters?.total_pipes || 0);

  const replacementOpportunities =
    Number(
      replacementData?.summary?.replacement_opportunities ||
      perVariantRows.length ||
      0
    );

  const similarityGroups =
    Number(
      replacementData?.summary?.groups ||
      groups.length ||
      0
    );

  const totalReduction = groups.reduce(
    (sum, group) =>
      sum + Math.max(
        0,
        Array.isArray(group.members)
          ? group.members.length - 1
          : 0
      ),
    0
  );

  const pipesAfterReplacement = Math.max(
    0,
    totalPipes - totalReduction
  );

  const replacedPipes = Math.max(
    0,
    totalPipes - pipesAfterReplacement
  );

  const columns = [
    {
      title: 'Group',
      dataIndex: 'groupId',
      key: 'groupId',
      width: 100
    },
    {
      title: 'Pipe (to replace)',
      dataIndex: 'fromId',
      key: 'fromId',
      render: (id) => <code>{id}</code>,
      width: 220
    },
    {
      title: 'Replace with',
      dataIndex: 'toId',
      key: 'toId',
      render: (id) => <code>{id}</code>,
      width: 220
    },
    {
      title: 'Cost (original)',
      dataIndex: 'costFrom',
      key: 'costFrom',
      render: (v) => fmtMoney(v)
    },
    {
      title: 'Cost (replacement)',
      dataIndex: 'costTo',
      key: 'costTo',
      render: (v) => fmtMoney(v)
    },
    {
      title: 'Saving (abs)',
      dataIndex: 'savingAbs',
      key: 'savingAbs',
      render: (v) => fmtMoney(v)
    },
    {
      title: 'Saving %',
      dataIndex: 'savingPct',
      key: 'savingPct',
      render: (v) => `${Number(v || 0).toFixed(2)}%`
    }
  ];

  return (
    <div>
      <h1>Replacement Suggestions — Exact Matches (100%)</h1>

      <Card style={{ marginBottom: 16, padding: 18 }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 20 }}>
            <Spin />
          </div>
        ) : !priceAvailable ? (
          <Alert
            message="Price Data Not Available"
            description="The uploaded Pipe file does not contain a Price column. Cost-effective replacement suggestions cannot be generated without price information."
            type="warning"
            showIcon
          />
        ) : (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 24,
              justifyContent: 'space-between',
              flexWrap: 'wrap'
            }}
          >
            <div
              style={{
                display: 'flex',
                gap: 36,
                alignItems: 'center',
                flexWrap: 'wrap'
              }}
            >
              <div style={{ minWidth: 140 }}>
                <div style={{ color: '#6b7280', fontSize: 13 }}>
                  Total Pipes
                </div>
                <div
                  style={{
                    fontSize: 28,
                    fontWeight: 700,
                    color: '#1e88e5'
                  }}
                >
                  {totalPipes}
                </div>
              </div>

              <div style={{ minWidth: 180 }}>
                <div style={{ color: '#6b7280', fontSize: 13 }}>
                  Replacement Opportunities
                </div>
                <div
                  style={{
                    fontSize: 28,
                    fontWeight: 700,
                    color: '#f59e0b'
                  }}
                >
                  {replacementOpportunities}
                </div>
              </div>

              <div style={{ minWidth: 190 }}>
                <div style={{ color: '#6b7280', fontSize: 13 }}>
                  Pipes After Replacement
                </div>
                <div
                  style={{
                    fontSize: 28,
                    fontWeight: 700,
                    color: '#10b981'
                  }}
                >
                  {pipesAfterReplacement}
                </div>
              </div>

              <div style={{ minWidth: 160 }}>
                <div style={{ color: '#6b7280', fontSize: 13 }}>
                  Similarity Groups
                </div>
                <div
                  style={{
                    fontSize: 28,
                    fontWeight: 700,
                    color: '#06b6d4'
                  }}
                >
                  {similarityGroups}
                </div>
              </div>
            </div>

            <div
              style={{
                marginLeft: 'auto',
                textAlign: 'right',
                minWidth: 220
              }}
            >
              <div
                style={{
                  fontSize: 12,
                  color: '#6b7280'
                }}
              >
                Average Savings
              </div>

              <div
                style={{
                  fontSize: 22,
                  fontWeight: 800,
                  color: '#16a34a'
                }}
              >
                {fmtMoney(overallSavings.avgAbsSavings)}
              </div>

              <div
                style={{
                  marginTop: 8,
                  fontSize: 12,
                  color: '#6b7280'
                }}
              >
                Avg Savings %
              </div>

              <div
                style={{
                  fontSize: 20,
                  fontWeight: 700,
                  color: '#7c3aed'
                }}
              >
                {(overallSavings.savingsPct || 0).toFixed(2)}%
              </div>
            </div>

            <div
              style={{
                width: '100%',
                marginTop: 12,
                textAlign: 'center'
              }}
            >
              <span style={{ color: '#6b7280' }}>
                Optimization reduces {replacedPipes} pipes →{' '}
                {pipesAfterReplacement} unique pipes remain
              </span>

              <span
                style={{
                  marginLeft: 10,
                  fontWeight: 700,
                  color: '#16a34a'
                }}
              >
                (
                {totalPipes
                  ? Math.round((replacedPipes / totalPipes) * 100)
                  : 0}
                % consolidation)
              </span>
            </div>
          </div>
        )}
      </Card>

      <Card style={{ marginBottom: 16 }}>
        <div
          style={{
            display: 'flex',
            gap: 8,
            justifyContent: 'flex-start',
            alignItems: 'center'
          }}
        >
          <Button
            type="primary"
            icon={<DownloadOutlined />}
            onClick={handleExportCSV}
            disabled={perVariantRows.length === 0}
          >
            Export CSV (per-pipe)
          </Button>

          <Button onClick={() => navigate(-1)}>
            Back
          </Button>
        </div>
      </Card>

      <Card>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40 }}>
            <Spin size="large" />
            <div>Loading...</div>
          </div>
        ) : !priceAvailable ? (
          <Alert
            message="Replacement Suggestions Unavailable"
            description="No Price column was provided in the uploaded Pipe file. The normal Pipe similarity analysis remains available, but cost-effective replacement analysis requires pricing data."
            type="info"
            showIcon
          />
        ) : groups.length === 0 ? (
          <Alert
            message="No exact-match groups found"
            description="There are no Pipe items that are exactly identical (100% match), so no replacement suggestions can be generated."
            type="info"
            showIcon
          />
        ) : perVariantRows.length === 0 ? (
          <Alert
            message="No cost-effective replacements found"
            description="Exact-match Pipe groups were found, but none of the matching Pipes has a cheaper replacement alternative."
            type="info"
            showIcon
          />
        ) : (
          <>
            <Table
              columns={[
                {
                  title: 'GroupID',
                  dataIndex: 'groupId',
                  key: 'groupId',
                  width: 100
                },
                {
                  title: 'Members',
                  dataIndex: 'members',
                  key: 'members',
                  render: (members) => (
                    <span style={{ fontFamily: 'monospace' }}>
                      {members
                        .map(
                          (member) =>
                            `${member.item_code} (${fmtMoney(
                              member.price
                            )})`
                        )
                        .join(', ')}
                    </span>
                  )
                }
              ]}
              dataSource={groups}
              pagination={false}
              rowKey="groupId"
              size="small"
              style={{ marginBottom: 16 }}
            />

            <Card
              title="Per-pipe replacement savings"
              style={{ marginBottom: 12 }}
            >
              <Collapse accordion>
                {groups.map((group, idx) => {
                  const members = Array.isArray(group.members)
                    ? group.members
                    : [];

                  const rowsForGroup =
                    perVariantRows.filter(
                      (row) => row.groupId === group.groupId
                    );

                  const groupTotalSavings =
                    rowsForGroup.reduce(
                      (sum, row) =>
                        sum + Number(row.savingAbs || 0),
                      0
                    );

                  const cheapest =
                    group.cheapestItem ||
                    (rowsForGroup.length
                      ? rowsForGroup[0].toId
                      : 'N/A');

                  const cheapestMember = members.find(
                    (member) =>
                      member.item_code === cheapest
                  );

                  return (
                    <Panel
                      header={
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            width: '100%'
                          }}
                        >
                          <div>
                            <Text strong>
                              Group {idx + 1}:
                            </Text>

                            <Text
                              style={{
                                marginLeft: 8
                              }}
                            >
                              {members.length} similar pipes
                            </Text>
                          </div>

                          <div
                            style={{
                              color: '#389e0d'
                            }}
                          >
                            <Text>
                              Cheapest:{' '}
                            </Text>

                            <Text strong>
                              {cheapestMember
                                ? getPipeLabel(
                                    cheapestMember.item_code,
                                    cheapestMember.price
                                  )
                                : cheapest}
                            </Text>

                            <Text
                              style={{
                                marginLeft: 12
                              }}
                            >
                              | Total Savings:{' '}
                              {fmtMoney(
                                groupTotalSavings
                              )}
                            </Text>
                          </div>
                        </div>
                      }
                      key={`pv-${group.groupId}`}
                    >
                      <div
                        style={{
                          padding: '6px 8px'
                        }}
                      >
                        <div
                          style={{
                            marginBottom: 8
                          }}
                        >
                          <Text strong>
                            Members:
                          </Text>{' '}
                          <Text>
                            {members
                              .map((member) =>
                                getPipeLabel(
                                  member.item_code,
                                  member.price
                                )
                              )
                              .join(', ') || '—'}
                          </Text>
                        </div>

                        <div
                          style={{
                            marginBottom: 8
                          }}
                        >
                          <Text strong>
                            Cheapest Pipe:
                          </Text>{' '}
                          <Text>
                            {cheapestMember
                              ? getPipeLabel(
                                  cheapestMember.item_code,
                                  cheapestMember.price
                                )
                              : '—'}
                          </Text>
                        </div>

                        <div
                          style={{
                            marginBottom: 8
                          }}
                        >
                          <Text strong>
                            Replacements:
                          </Text>

                          <ul
                            style={{
                              marginTop: 8
                            }}
                          >
                            {rowsForGroup.map(
                              (row, i) => (
                                <li
                                  key={`r-${i}`}
                                  style={{
                                    marginBottom: 6
                                  }}
                                >
                                  <Text>
                                    {getPipeLabel(
                                      row.fromId,
                                      row.costFrom
                                    )}{' '}
                                    →{' '}
                                    {getPipeLabel(
                                      row.toId,
                                      row.costTo
                                    )}
                                    :{' '}
                                    <Text strong>
                                      {fmtMoney(
                                        row.savingAbs
                                      )}
                                    </Text>{' '}
                                    <Text type="secondary">
                                      (
                                      {Number(
                                        row.savingPct || 0
                                      ).toFixed(2)}
                                      %)
                                    </Text>
                                  </Text>
                                </li>
                              )
                            )}
                          </ul>
                        </div>
                      </div>
                    </Panel>
                  );
                })}
              </Collapse>

              <div
                style={{
                  marginTop: 12,
                  display: 'flex',
                  justifyContent: 'flex-end',
                  gap: 12
                }}
              >
                <div
                  style={{
                    textAlign: 'right'
                  }}
                >
                  <div
                    style={{
                      fontSize: 12,
                      color: '#6b7280'
                    }}
                  >
                    Total original cost (considered)
                  </div>

                  <div
                    style={{
                      fontSize: 18,
                      fontWeight: 700
                    }}
                  >
                    {fmtMoney(
                      overallSavings.totalOriginal
                    )}
                  </div>
                </div>

                <div
                  style={{
                    textAlign: 'right'
                  }}
                >
                  <div
                    style={{
                      fontSize: 12,
                      color: '#6b7280'
                    }}
                  >
                    Total savings (abs)
                  </div>

                  <div
                    style={{
                      fontSize: 18,
                      fontWeight: 700
                    }}
                  >
                    {fmtMoney(
                      overallSavings.totalSavings
                    )}
                  </div>
                </div>

                <div
                  style={{
                    textAlign: 'right'
                  }}
                >
                  <div
                    style={{
                      fontSize: 12,
                      color: '#6b7280'
                    }}
                  >
                    Total Savings %
                  </div>

                  <div
                    style={{
                      fontSize: 20,
                      fontWeight: 700
                    }}
                  >
                    {(overallSavings.savingsPct || 0).toFixed(
                      4
                    )}
                    %
                  </div>
                </div>
              </div>
            </Card>
          </>
        )}
      </Card>
    </div>
  );
};

export default PipeReplacementSuggestion;