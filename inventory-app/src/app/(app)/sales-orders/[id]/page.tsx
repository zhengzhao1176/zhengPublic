'use client'
import { use, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Alert, App as AntdApp, Card, Descriptions, Tag, Space, Button, Spin } from 'antd'
import { trpc } from '@/lib/trpc-client'
import { translateError, formatDate, formatMoney } from '@/lib/format'
import { makeConfirmDelete, makeConfirmAction } from '@/components/shared/confirm'

export default function SalesOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id: idStr } = use(params)
  const id = Number(idStr)
  const router = useRouter()
  const { message, modal } = AntdApp.useApp()
  const confirmDelete = makeConfirmDelete(modal)
  const confirmAction = makeConfirmAction(modal)
  const utils = trpc.useUtils()
  const [serverError, setServerError] = useState<string | null>(null)

  const detail = trpc.salesOrders.byId.useQuery({ id }, { enabled: Number.isFinite(id) && id > 0 })

  const del = trpc.salesOrders.delete.useMutation({
    onSuccess: () => {
      message.success('删除成功')
      utils.salesOrders.list.invalidate()
      router.replace('/sales-orders')
    },
    onError: (e) => setServerError(translateError(e.message)),
  })

  const confirm = trpc.salesOrders.confirm.useMutation({
    onSuccess: () => {
      message.success('确认成功，库存已更新')
      utils.salesOrders.byId.invalidate({ id })
      utils.salesOrders.list.invalidate()
      utils.products.list.invalidate()
      utils.stats.overview.invalidate()
    },
    onError: (e) => {
      const msg = translateError(e.message)
      message.error(msg)
      setServerError(msg)
    },
  })

  if (detail.isLoading) return <Spin />
  if (!detail.data) return <Alert role="alert" type="error" message="单据不存在" />
  const o = detail.data

  return (
    <Card
      title={`出货单详情 — ${o.orderNo}`}
      extra={
        o.status === 'DRAFT' ? (
          <Space>
            <Link href={`/sales-orders/${id}/edit`}>
              <Button>编辑</Button>
            </Link>
            <Button
              danger
              onClick={() =>
                confirmDelete(async () => { await del.mutateAsync({ id }) }, {
                  title: '确认删除该单据？',
                  content: '删除后不可恢复，是否继续？',
                })
              }
            >
              删除
            </Button>
            <Button
              type="primary"
              data-testid="confirm-button"
              onClick={() =>
                confirmAction(async () => { await confirm.mutateAsync({ id }) }, {
                  title: `确认 ${o.orderNo}？`,
                  content: '确认后将自动调整库存，且不可撤销，是否继续？',
                })
              }
            >
              确认出货单
            </Button>
          </Space>
        ) : (
          <Tag color="green">已确认 ✓ 确认时间：{formatDate(o.confirmedAt, true)}</Tag>
        )
      }
    >
      {serverError && (
        <Alert role="alert" type="error" showIcon message={serverError} style={{ marginBottom: 16 }} />
      )}
      <Descriptions column={2} bordered>
        <Descriptions.Item label="出货单号">{o.orderNo}</Descriptions.Item>
        <Descriptions.Item label="状态">
          {o.status === 'CONFIRMED' ? <Tag color="green">已确认</Tag> : <Tag color="orange">草稿</Tag>}
        </Descriptions.Item>
        <Descriptions.Item label="商品">{o.product.code} - {o.product.name}</Descriptions.Item>
        <Descriptions.Item label="出货数量">{o.quantity}</Descriptions.Item>
        <Descriptions.Item label="出货单价">{formatMoney(o.sellPrice)}</Descriptions.Item>
        <Descriptions.Item label="出货金额">{formatMoney(o.totalAmount)}</Descriptions.Item>
        <Descriptions.Item label="客户">{o.customer}</Descriptions.Item>
        <Descriptions.Item label="出货员">{o.shipper}</Descriptions.Item>
        <Descriptions.Item label="出货日期">{formatDate(o.salesDate)}</Descriptions.Item>
        <Descriptions.Item label="创建时间">{formatDate(o.createdAt, true)}</Descriptions.Item>
        <Descriptions.Item label="备注" span={2}>{o.remark ?? '-'}</Descriptions.Item>
      </Descriptions>
    </Card>
  )
}
