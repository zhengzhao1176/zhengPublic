'use client'
import { useState } from 'react'
import Link from 'next/link'
import { Table, Button, Input, Select, Space, Alert, App as AntdApp, Tag, DatePicker } from 'antd'
import dayjs from 'dayjs'
import { trpc } from '@/lib/trpc-client'
import { translateError, formatDate } from '@/lib/format'
import { makeConfirmDelete, makeConfirmAction } from '@/components/shared/confirm'

type Status = 'DRAFT' | 'CONFIRMED'

export default function PurchaseOrdersPage() {
  const { message, modal } = AntdApp.useApp()
  const confirmDelete = makeConfirmDelete(modal)
  const confirmAction = makeConfirmAction(modal)
  const [orderNo, setOrderNo] = useState('')
  const [supplierId, setSupplierId] = useState<number | undefined>(undefined)
  const [status, setStatus] = useState<Status | undefined>(undefined)
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs] | null>(null)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [serverError, setServerError] = useState<string | null>(null)

  const list = trpc.purchaseOrders.list.useQuery({
    orderNo: orderNo || undefined,
    ...(supplierId !== undefined ? { supplierId } : {}),
    ...(status ? { status } : {}),
    ...(dateRange?.[0] ? { dateFrom: dateRange[0].startOf('day').toISOString() } : {}),
    ...(dateRange?.[1] ? { dateTo: dateRange[1].endOf('day').toISOString() } : {}),
    page,
    pageSize,
  })
  const sups = trpc.suppliers.list.useQuery({})
  const utils = trpc.useUtils()

  const del = trpc.purchaseOrders.delete.useMutation({
    onSuccess: () => {
      message.success('删除成功')
      utils.purchaseOrders.list.invalidate()
    },
    onError: (e) => setServerError(translateError(e.message)),
  })

  const confirm = trpc.purchaseOrders.confirm.useMutation({
    onSuccess: () => {
      message.success('确认成功，库存已更新')
      utils.purchaseOrders.list.invalidate()
      utils.products.list.invalidate()
      utils.stats.overview.invalidate()
    },
    onError: (e) => {
      const msg = translateError(e.message)
      message.error(msg)
      setServerError(msg)
    },
  })

  return (
    <div>
      {serverError && (
        <Alert role="alert" type="error" showIcon message={serverError} closable onClose={() => setServerError(null)} style={{ marginBottom: 16 }} />
      )}
      <Space style={{ marginBottom: 16 }} wrap>
        <Input
          placeholder="搜索单号"
          aria-label="搜索"
          data-testid="purchase-orders-search"
          value={orderNo}
          onChange={(e) => { setOrderNo(e.target.value); setPage(1) }}
          allowClear
          style={{ width: 200 }}
        />
        <Select
          placeholder="选择供应商"
          aria-label="供应商筛选"
          allowClear
          style={{ minWidth: 160 }}
          options={sups.data?.map((s) => ({ label: s.name, value: s.id })) ?? []}
          value={supplierId}
          onChange={(v) => { setSupplierId(v); setPage(1) }}
        />
        <Select
          placeholder="状态"
          aria-label="状态筛选"
          allowClear
          style={{ minWidth: 120 }}
          options={[
            { label: '草稿', value: 'DRAFT' },
            { label: '已确认', value: 'CONFIRMED' },
          ]}
          value={status}
          onChange={(v) => { setStatus(v); setPage(1) }}
        />
        <DatePicker.RangePicker
          aria-label="日期范围"
          value={dateRange}
          onChange={(v) => { setDateRange(v as [dayjs.Dayjs, dayjs.Dayjs] | null); setPage(1) }}
        />
        <Link href="/purchase-orders/new">
          <Button type="primary" data-testid="purchase-orders-create">新增进货单</Button>
        </Link>
      </Space>

      <Table
        data-testid="purchase-orders-list"
        rowKey="id"
        loading={list.isLoading}
        dataSource={list.data?.items ?? []}
        pagination={{
          current: page,
          pageSize,
          total: list.data?.total ?? 0,
          onChange: (p, ps) => { setPage(p); setPageSize(ps) },
          itemRender: (_p, type, original) => {
            if (type === 'prev') return <a data-testid="pagination-prev">上一页</a>
            if (type === 'next') return <a data-testid="pagination-next">下一页</a>
            if (type === 'page') return <a data-testid={`pagination-page-${_p}`}>{_p}</a>
            return original
          },
        }}
        onRow={(r) => ({ 'data-testid': `row-${r.id}` } as React.HTMLAttributes<HTMLElement>)}
        columns={[
          { title: '进货单号', dataIndex: 'orderNo', key: 'orderNo' },
          { title: '商品名称', key: 'product', render: (_v, r) => r.product.name },
          { title: '进货数量', dataIndex: 'quantity', key: 'quantity' },
          { title: '进货日期', key: 'purchaseDate', render: (_v, r) => formatDate(r.purchaseDate) },
          { title: '供应商', key: 'supplier', render: (_v, r) => r.supplier.name },
          { title: '进货员', dataIndex: 'purchaser', key: 'purchaser' },
          {
            title: '状态',
            key: 'status',
            render: (_v, r) =>
              r.status === 'CONFIRMED' ? (
                <Tag color="green">已确认</Tag>
              ) : (
                <Tag color="orange">草稿</Tag>
              ),
          },
          {
            title: '操作',
            key: 'action',
            render: (_v, r) => (
              <Space>
                {r.status === 'DRAFT' ? (
                  <>
                    <Link href={`/purchase-orders/${r.id}/edit`} data-testid={`row-${r.id}-edit`}>
                      编辑
                    </Link>
                    <a
                      data-testid={`row-${r.id}-delete`}
                      onClick={() =>
                        confirmDelete(async () => { await del.mutateAsync({ id: r.id }) }, {
                          title: '确认删除该单据？',
                          content: '删除后不可恢复，是否继续？',
                        })
                      }
                    >
                      删除
                    </a>
                    <a
                      data-testid={`row-${r.id}-confirm`}
                      onClick={() =>
                        confirmAction(async () => { await confirm.mutateAsync({ id: r.id }) }, {
                          title: `确认 ${r.orderNo}？`,
                          content: '确认后将自动调整库存，且不可撤销，是否继续？',
                        })
                      }
                    >
                      确认
                    </a>
                  </>
                ) : (
                  <Link href={`/purchase-orders/${r.id}`} data-testid={`row-${r.id}-view`}>
                    查看
                  </Link>
                )}
              </Space>
            ),
          },
        ]}
      />
    </div>
  )
}
