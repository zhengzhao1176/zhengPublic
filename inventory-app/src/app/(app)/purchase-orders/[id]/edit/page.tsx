'use client'
import { use, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Alert, App as AntdApp, Card, Spin } from 'antd'
import { trpc } from '@/lib/trpc-client'
import { translateError } from '@/lib/format'
import { PurchaseOrderForm } from '@/components/purchase-orders/purchase-order-form'

export default function EditPurchaseOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: idStr } = use(params)
  const id = Number(idStr)
  const router = useRouter()
  const { message } = AntdApp.useApp()
  const utils = trpc.useUtils()
  const [serverError, setServerError] = useState<string | null>(null)

  const detail = trpc.purchaseOrders.byId.useQuery({ id }, { enabled: Number.isFinite(id) && id > 0 })
  const products = trpc.products.list.useQuery({ stockStatus: 'ALL', page: 1, pageSize: 50 })
  const sups = trpc.suppliers.list.useQuery({})

  const update = trpc.purchaseOrders.update.useMutation({
    onSuccess: () => {
      message.success('更新成功')
      utils.purchaseOrders.list.invalidate()
      router.replace('/purchase-orders')
    },
    onError: (e) => setServerError(translateError(e.message)),
  })

  // CONFIRMED 单不能编辑，跳详情
  useEffect(() => {
    if (detail.data && detail.data.status === 'CONFIRMED') {
      router.replace(`/purchase-orders/${id}`)
    }
  }, [detail.data, id, router])

  if (detail.isLoading || products.isLoading || sups.isLoading) return <Spin />
  if (!detail.data) return <Alert role="alert" type="error" message="单据不存在" />
  if (detail.data.status === 'CONFIRMED') return <Spin />

  return (
    <Card title="编辑进货单">
      {serverError && (
        <Alert role="alert" type="error" showIcon message={serverError} style={{ marginBottom: 16 }} />
      )}
      <PurchaseOrderForm
        products={products.data?.items.map((p) => ({ id: p.id, code: p.code, name: p.name, costPrice: p.costPrice })) ?? []}
        suppliers={sups.data ?? []}
        initial={{
          productId: detail.data.productId,
          quantity: detail.data.quantity,
          costPrice: detail.data.costPrice,
          supplierId: detail.data.supplierId,
          purchaser: detail.data.purchaser,
          ...(detail.data.remark !== null ? { remark: detail.data.remark } : {}),
          purchaseDate: detail.data.purchaseDate.toISOString(),
        }}
        onSubmit={async (v) => {
          await update.mutateAsync({
            id,
            productId: v.productId,
            quantity: v.quantity,
            costPrice: v.costPrice,
            supplierId: v.supplierId,
            purchaser: v.purchaser,
            remark: v.remark ?? null,
            purchaseDate: v.purchaseDate,
          })
        }}
      />
    </Card>
  )
}
