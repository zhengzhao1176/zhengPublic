'use client'
import { use, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Alert, App as AntdApp, Card, Spin } from 'antd'
import { trpc } from '@/lib/trpc-client'
import { translateError } from '@/lib/format'
import { SalesOrderForm } from '@/components/sales-orders/sales-order-form'

export default function EditSalesOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: idStr } = use(params)
  const id = Number(idStr)
  const router = useRouter()
  const { message } = AntdApp.useApp()
  const utils = trpc.useUtils()
  const [serverError, setServerError] = useState<string | null>(null)

  const detail = trpc.salesOrders.byId.useQuery({ id }, { enabled: Number.isFinite(id) && id > 0 })
  const products = trpc.products.list.useQuery({ stockStatus: 'ALL', page: 1, pageSize: 50 })

  const update = trpc.salesOrders.update.useMutation({
    onSuccess: () => {
      message.success('更新成功')
      utils.salesOrders.list.invalidate()
      router.replace('/sales-orders')
    },
    onError: (e) => setServerError(translateError(e.message)),
  })

  useEffect(() => {
    if (detail.data && detail.data.status === 'CONFIRMED') {
      router.replace(`/sales-orders/${id}`)
    }
  }, [detail.data, id, router])

  if (detail.isLoading || products.isLoading) return <Spin />
  if (!detail.data) return <Alert role="alert" type="error" message="单据不存在" />
  if (detail.data.status === 'CONFIRMED') return <Spin />

  return (
    <Card title="编辑出货单">
      {serverError && (
        <Alert role="alert" type="error" showIcon message={serverError} style={{ marginBottom: 16 }} />
      )}
      <SalesOrderForm
        products={products.data?.items.map((p) => ({ id: p.id, code: p.code, name: p.name, sellPrice: p.sellPrice, quantity: p.quantity })) ?? []}
        initial={{
          productId: detail.data.productId,
          quantity: detail.data.quantity,
          sellPrice: detail.data.sellPrice,
          customer: detail.data.customer,
          shipper: detail.data.shipper,
          ...(detail.data.remark !== null ? { remark: detail.data.remark } : {}),
          salesDate: detail.data.salesDate.toISOString(),
        }}
        onSubmit={async (v) => {
          await update.mutateAsync({
            id,
            productId: v.productId,
            quantity: v.quantity,
            sellPrice: v.sellPrice,
            customer: v.customer,
            shipper: v.shipper,
            remark: v.remark ?? null,
            salesDate: v.salesDate,
          })
        }}
      />
    </Card>
  )
}
