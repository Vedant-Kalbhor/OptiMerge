import React from 'react';
import { Table, Input, Button, message } from 'antd';
import { DeleteOutlined, PlusOutlined, CopyOutlined } from '@ant-design/icons';

export default function DimTable({ rows = [], onChange }) {

  // 🔥 update label/value safely
  const handleChange = (id, field, value) => {
    const next = rows.map(r =>
      r.id === id ? { ...r, [field]: value } : r
    );
    onChange(next);
  };

  const handleRemove = (id) => {
    onChange(rows.filter(r => r.id !== id));
  };

  const handleAdd = () => {
    onChange([
      ...rows,
      {
        id: crypto.randomUUID(),
        label: 'dim',
        value: ''
      }
    ]);
  };

  const handleCopy = () => {
    const tsv = rows.map(r => `${r.label}\t${r.value}`).join('\n');
    navigator.clipboard.writeText(tsv);
    message.success('Copied as TSV');
  };

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginBottom: 8 }}>
        <Button size="small" icon={<CopyOutlined />} onClick={handleCopy}>
          Copy TSV
        </Button>
        <Button size="small" icon={<PlusOutlined />} onClick={handleAdd}>
          Add row
        </Button>
      </div>

      <Table
        size="small"
        pagination={false}
        rowKey="id"   // 🔥 CRITICAL FIX
        dataSource={rows}
        columns={[
          {
            title: 'Label',
            dataIndex: 'label',
            render: (_, record) => (
              <Input
                size="small"
                value={record.label}
                onChange={(e) =>
                  handleChange(record.id, 'label', e.target.value)
                }
              />
            ),
          },
          {
            title: 'Value',
            dataIndex: 'value',
            width: 130,
            render: (_, record) => (
              <Input
                size="small"
                value={record.value}
                onChange={(e) =>
                  handleChange(record.id, 'value', e.target.value)
                }
              />
            ),
          },
          {
            title: '',
            width: 40,
            render: (_, record) => (
              <Button
                type="link"
                danger
                size="small"
                icon={<DeleteOutlined />}
                onClick={() => handleRemove(record.id)}
              />
            ),
          },
        ]}
      />
    </>
  );
}