'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Alert, App as AntdApp, Card, Spin } from 'antd'
import { trpc } from '@/lib/trpc-client'
import { translateError } from '@/lib/format'
import { ProductForm } from '@/components/products/product-form'

export default function NewProductPage() {
  const router = useRouter()
  const { message } = AntdApp.useApp()
  const utils = trpc.useUtils()
  const [serverError, setServerError] = useState<string | null>(null)

  const cats = trpc.categories.list.useQuery({})
  const sups = trpc.suppliers.list.useQuery({})

  const create = trpc.products.create.useMutation({
    onSuccess: () => {
      message.success('创建成功')
      utils.products.list.invalidate()
      utils.stats.invalidate()
      router.replace('/products')
    },
    onError: (e) => setServerError(translateError(e.message)),
  })

  if (cats.isLoading || sups.isLoading) return <Spin />

  return (
    <Card title="新增商品">
      {serverError && (
        <Alert role="alert" type="error" showIcon message={serverError} style={{ marginBottom: 16 }} />
      )}
      <ProductForm
        categories={cats.data ?? []}
        suppliers={sups.data ?? []}
        onSubmit={async (v) => { await create.mutateAsync(v) }}
      />
    </Card>
  )
}
