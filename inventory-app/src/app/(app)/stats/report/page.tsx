'use client'
import { Button, Card, Table, Spin, Space } from 'antd'
import dayjs from 'dayjs'
import * as XLSX from 'xlsx'
import { trpc } from '@/lib/trpc-client'
import { formatMoney } from '@/lib/format'

export default function ReportPage() {
  const list = trpc.stats.report.useQuery()
  const utils = trpc.useUtils()

  async function onExport() {
    const rows = await utils.stats.report.fetch()
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, '库存报表')
    XLSX.writeFile(wb, `inventory-report-${dayjs().format('YYYYMMDD')}.xlsx`)
  }

  if (list.isLoading) return <Spin />

  return (
    <Card
      title="库存报表"
      extra={
        <Space>
          <Button type="primary" data-testid="report-export" onClick={onExport}>
            导出 Excel
          </Button>
        </Space>
      }
    >
      <Table
        data-testid="stats-report-list"
        rowKey="code"
        dataSource={list.data ?? []}
        pagination={false}
        columns={[
          { title: '编码', dataIndex: 'code', key: 'code' },
          { title: '名称', dataIndex: 'name', key: 'name' },
          { title: '分类', dataIndex: 'categoryName', key: 'categoryName' },
          { title: '当前库存', dataIndex: 'quantity', key: 'quantity' },
          { title: '单位', dataIndex: 'unit', key: 'unit' },
          { title: '进价', key: 'costPrice', render: (_v, r) => formatMoney(r.costPrice) },
          { title: '库存价值', key: 'stockValue', render: (_v, r) => formatMoney(r.stockValue) },
          { title: '售价', key: 'sellPrice', render: (_v, r) => formatMoney(r.sellPrice) },
          { title: '供应商', dataIndex: 'supplierName', key: 'supplierName' },
        ]}
      />
    </Card>
  )
}
