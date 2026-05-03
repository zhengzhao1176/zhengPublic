'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Alert, App as AntdApp, Card, Spin } from 'antd'
import { trpc } from '@/lib/trpc-client'
import { translateError } from '@/lib/format'
import { SalesOrderForm } from '@/components/sales-orders/sales-order-form'

export default function NewSalesOrderPage() {
  const router = useRouter()
  const { message } = AntdApp.useApp()
  const utils = trpc.useUtils()
  const [serverError, setServerError] = useState<string | null>(null)

  const products = trpc.products.list.useQuery({ stockStatus: 'ALL', page: 1, pageSize: 50 })

  const create = trpc.salesOrders.create.useMutation({
    onSuccess: () => {
      message.success('创建成功')
      utils.salesOrders.list.invalidate()
      router.replace('/sales-orders')
    },
    onError: (e) => setServerError(translateError(e.message)),
  })

  if (products.isLoading) return <Spin />

  return (
    <Card title="新增出货单">
      {serverError && (
        <Alert role="alert" type="error" showIcon message={serverError} style={{ marginBottom: 16 }} />
      )}
      <SalesOrderForm
        products={products.data?.items.map((p) => ({ id: p.id, code: p.code, name: p.name, sellPrice: p.sellPrice, quantity: p.quantity })) ?? []}
        onSubmit={async (v) => { await create.mutateAsync(v) }}
      />
    </Card>
  )
}
