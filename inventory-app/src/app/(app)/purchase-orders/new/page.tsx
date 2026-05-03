'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Alert, App as AntdApp, Card, Spin } from 'antd'
import { trpc } from '@/lib/trpc-client'
import { translateError } from '@/lib/format'
import { PurchaseOrderForm } from '@/components/purchase-orders/purchase-order-form'

export default function NewPurchaseOrderPage() {
  const router = useRouter()
  const { message } = AntdApp.useApp()
  const utils = trpc.useUtils()
  const [serverError, setServerError] = useState<string | null>(null)

  const products = trpc.products.list.useQuery({ stockStatus: 'ALL', page: 1, pageSize: 50 })
  const sups = trpc.suppliers.list.useQuery({})

  const create = trpc.purchaseOrders.create.useMutation({
    onSuccess: () => {
      message.success('创建成功')
      utils.purchaseOrders.list.invalidate()
      router.replace('/purchase-orders')
    },
    onError: (e) => setServerError(translateError(e.message)),
  })

  if (products.isLoading || sups.isLoading) return <Spin />

  return (
    <Card title="新增进货单">
      {serverError && (
        <Alert role="alert" type="error" showIcon message={serverError} style={{ marginBottom: 16 }} />
      )}
      <PurchaseOrderForm
        products={products.data?.items.map((p) => ({ id: p.id, code: p.code, name: p.name, costPrice: p.costPrice })) ?? []}
        suppliers={sups.data ?? []}
        onSubmit={async (v) => { await create.mutateAsync(v) }}
      />
    </Card>
  )
}
