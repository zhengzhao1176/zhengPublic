'use client'
import { use, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Alert, App as AntdApp, Card, Spin } from 'antd'
import { trpc } from '@/lib/trpc-client'
import { translateError } from '@/lib/format'
import { ProductForm } from '@/components/products/product-form'

export default function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: idStr } = use(params)
  const id = Number(idStr)
  const router = useRouter()
  const { message } = AntdApp.useApp()
  const utils = trpc.useUtils()
  const [serverError, setServerError] = useState<string | null>(null)

  const detail = trpc.products.byId.useQuery({ id }, { enabled: Number.isFinite(id) && id > 0 })
  const cats = trpc.categories.list.useQuery({})
  const sups = trpc.suppliers.list.useQuery({})

  const update = trpc.products.update.useMutation({
    onSuccess: () => {
      message.success('更新成功')
      utils.products.list.invalidate()
      utils.stats.invalidate()
      router.replace('/products')
    },
    onError: (e) => setServerError(translateError(e.message)),
  })

  if (detail.isLoading || cats.isLoading || sups.isLoading) return <Spin />
  if (!detail.data) return <Alert role="alert" type="error" message="商品不存在" />

  return (
    <Card title="编辑商品">
      {serverError && (
        <Alert role="alert" type="error" showIcon message={serverError} style={{ marginBottom: 16 }} />
      )}
      <ProductForm
        mode="edit"
        categories={cats.data ?? []}
        suppliers={sups.data ?? []}
        initial={{
          code: detail.data.code,
          name: detail.data.name,
          categoryId: detail.data.categoryId,
          ...(detail.data.description !== null ? { description: detail.data.description } : {}),
          costPrice: detail.data.costPrice,
          sellPrice: detail.data.sellPrice,
          quantity: detail.data.quantity,
          unit: detail.data.unit,
          supplierId: detail.data.supplierId,
          minStock: detail.data.minStock,
          maxStock: detail.data.maxStock,
        }}
        onSubmit={async (v) => {
          await update.mutateAsync({
            id,
            name: v.name,
            categoryId: v.categoryId,
            description: v.description ?? null,
            costPrice: v.costPrice,
            sellPrice: v.sellPrice,
            quantity: v.quantity,
            unit: v.unit,
            supplierId: v.supplierId,
            minStock: v.minStock,
            maxStock: v.maxStock,
          })
        }}
      />
    </Card>
  )
}
