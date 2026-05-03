'use client'
import { useState } from 'react'
import { Table, Card, Select, Space, Tag, Empty } from 'antd'
import { trpc } from '@/lib/trpc-client'

type AlertType = 'ALL' | 'LOW' | 'OVER'

export default function AlertsPage() {
  const [type, setType] = useState<AlertType>('ALL')
  const list = trpc.stats.alerts.useQuery({ type })

  return (
    <Card title="库存预警">
      <Space style={{ marginBottom: 16 }}>
        <Select
          aria-label="预警类型"
          value={type}
          onChange={(v) => setType(v)}
          style={{ minWidth: 140 }}
          options={[
            { label: '全部', value: 'ALL' },
            { label: '低库存', value: 'LOW' },
            { label: '超容量', value: 'OVER' },
          ]}
        />
      </Space>
      {list.data && list.data.length === 0 ? (
        <Empty data-testid="stats-alerts-empty" description="暂无预警" />
      ) : (
        <Table
          data-testid="stats-alerts-list"
          rowKey="id"
          loading={list.isLoading}
          dataSource={list.data ?? []}
          pagination={false}
          onRow={(r) => ({ 'data-testid': `row-${r.id}` } as React.HTMLAttributes<HTMLElement>)}
          columns={[
            { title: '编码', dataIndex: 'code', key: 'code' },
            { title: '名称', dataIndex: 'name', key: 'name' },
            { title: '分类', key: 'category', render: (_v, r) => r.category.name },
            { title: '当前库存', dataIndex: 'quantity', key: 'quantity' },
            { title: '最小库存', dataIndex: 'minStock', key: 'minStock' },
            { title: '最大库存', dataIndex: 'maxStock', key: 'maxStock' },
            {
              title: '状态',
              key: 'alertType',
              render: (_v, r) =>
                r.alertType === 'LOW' ? (
                  <Tag color="orange">低库存</Tag>
                ) : (
                  <Tag color="red">超容量</Tag>
                ),
            },
            { title: '供应商', key: 'supplier', render: (_v, r) => r.supplier.name },
          ]}
        />
      )}
    </Card>
  )
}
