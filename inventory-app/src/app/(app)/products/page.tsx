'use client'
import { useState } from 'react'
import Link from 'next/link'
import { Table, Button, Input, Select, Space, Alert, App as AntdApp, Tag } from 'antd'
import { trpc } from '@/lib/trpc-client'
import { translateError, formatMoney } from '@/lib/format'
import { makeConfirmDelete, makeConfirmAction } from '@/components/shared/confirm'

export default function ProductsPage() {
  const { message, modal } = AntdApp.useApp()
  const confirmDelete = makeConfirmDelete(modal)
  const confirmAction = makeConfirmAction(modal)
  const [keyword, setKeyword] = useState('')
  const [categoryId, setCategoryId] = useState<number | undefined>(undefined)
  const [stockStatus, setStockStatus] = useState<'ALL' | 'LOW' | 'OVER' | 'NORMAL'>('ALL')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [selected, setSelected] = useState<number[]>([])
  const [serverError, setServerError] = useState<string | null>(null)

  const list = trpc.products.list.useQuery({
    keyword: keyword || undefined,
    ...(categoryId !== undefined ? { categoryId } : {}),
    stockStatus,
    page,
    pageSize,
  })
  const cats = trpc.categories.list.useQuery({})
  const utils = trpc.useUtils()

  const del = trpc.products.delete.useMutation({
    onSuccess: () => {
      message.success('删除成功')
      utils.products.list.invalidate()
      utils.stats.invalidate()
    },
    onError: (e) => {
      const msg = translateError(e.message)
      message.error(msg)
      setServerError(msg)
    },
  })

  const batchDel = trpc.products.batchDelete.useMutation({
    onSuccess: (r) => {
      message.success('删除成功')
      if (r.failed.length > 0) message.error(`部分失败：${r.failed.length} 项`)
      setSelected([])
      utils.products.list.invalidate()
      utils.stats.invalidate()
    },
  })

  return (
    <div>
      {serverError && (
        <Alert role="alert" type="error" showIcon message={serverError} closable onClose={() => setServerError(null)} style={{ marginBottom: 16 }} />
      )}
      <Space style={{ marginBottom: 16 }} wrap>
        <Input
          placeholder="搜索编码或名称"
          aria-label="搜索"
          data-testid="products-search"
          value={keyword}
          onChange={(e) => { setKeyword(e.target.value); setPage(1) }}
          allowClear
          style={{ width: 200 }}
        />
        <Select
          placeholder="选择分类"
          aria-label="分类筛选"
          allowClear
          style={{ minWidth: 160 }}
          options={cats.data?.map((c) => ({ label: c.name, value: c.id })) ?? []}
          value={categoryId}
          onChange={(v) => { setCategoryId(v); setPage(1) }}
        />
        <Select
          aria-label="库存状态"
          style={{ minWidth: 140 }}
          options={[
            { label: '全部', value: 'ALL' },
            { label: '低库存', value: 'LOW' },
            { label: '超容量', value: 'OVER' },
            { label: '正常', value: 'NORMAL' },
          ]}
          value={stockStatus}
          onChange={(v) => { setStockStatus(v); setPage(1) }}
        />
        <Link href="/products/new">
          <Button type="primary" data-testid="products-create">新增商品</Button>
        </Link>
        <Button
          data-testid="products-batch-delete"
          danger
          disabled={selected.length === 0}
          onClick={() =>
            confirmAction(
              async () => { await batchDel.mutateAsync({ ids: selected }) },
              {
                title: '确认批量删除？',
                content: `共 ${selected.length} 项，删除后不可恢复，是否继续？`,
              },
            )
          }
        >
          批量删除
        </Button>
      </Space>

      <Table
        data-testid="products-list"
        rowKey="id"
        loading={list.isLoading}
        dataSource={list.data?.items ?? []}
        rowSelection={{
          selectedRowKeys: selected,
          onChange: (keys) => setSelected(keys as number[]),
        }}
        pagination={{
          current: page,
          pageSize,
          total: list.data?.total ?? 0,
          showSizeChanger: true,
          pageSizeOptions: [10, 20, 30, 50],
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
          { title: '编码', dataIndex: 'code', key: 'code' },
          { title: '名称', dataIndex: 'name', key: 'name' },
          { title: '分类', key: 'category', render: (_v, r) => r.category.name },
          {
            title: '当前库存',
            key: 'quantity',
            render: (_v, r) => {
              const low = r.quantity <= r.minStock
              const over = r.quantity >= r.maxStock
              return (
                <span>
                  {r.quantity}
                  {low && <Tag color="orange" style={{ marginLeft: 8 }}>低库存</Tag>}
                  {over && <Tag color="red" style={{ marginLeft: 8 }}>超容量</Tag>}
                </span>
              )
            },
          },
          { title: '单位', dataIndex: 'unit', key: 'unit' },
          { title: '进价', key: 'costPrice', render: (_v, r) => formatMoney(r.costPrice) },
          { title: '售价', key: 'sellPrice', render: (_v, r) => formatMoney(r.sellPrice) },
          { title: '供应商', key: 'supplier', render: (_v, r) => r.supplier.name },
          {
            title: '操作',
            key: 'action',
            render: (_v, r) => (
              <Space>
                <Link href={`/products/${r.id}/edit`} data-testid={`row-${r.id}-edit`}>
                  编辑
                </Link>
                <a
                  data-testid={`row-${r.id}-delete`}
                  onClick={() => confirmDelete(async () => { await del.mutateAsync({ id: r.id }) })}
                >
                  删除
                </a>
              </Space>
            ),
          },
        ]}
      />
    </div>
  )
}
