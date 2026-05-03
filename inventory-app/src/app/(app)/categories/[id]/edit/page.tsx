'use client'
import { use, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Alert, App as AntdApp, Card, Spin } from 'antd'
import { trpc } from '@/lib/trpc-client'
import { translateError } from '@/lib/format'
import { CategoryForm } from '@/components/categories/category-form'

export default function EditCategoryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: idStr } = use(params)
  const id = Number(idStr)
  const router = useRouter()
  const { message } = AntdApp.useApp()
  const utils = trpc.useUtils()
  const [serverError, setServerError] = useState<string | null>(null)

  const detail = trpc.categories.byId.useQuery({ id }, { enabled: Number.isFinite(id) && id > 0 })
  const update = trpc.categories.update.useMutation({
    onSuccess: () => {
      message.success('更新成功')
      utils.categories.list.invalidate()
      router.replace('/categories')
    },
    onError: (e) => setServerError(translateError(e.message)),
  })

  if (detail.isLoading) return <Spin />
  if (!detail.data) return <Alert role="alert" type="error" message="分类不存在" />

  return (
    <Card title="编辑分类">
      {serverError && (
        <Alert role="alert" type="error" showIcon message={serverError} style={{ marginBottom: 16 }} />
      )}
      <CategoryForm
        initial={{
          name: detail.data.name,
          ...(detail.data.description !== null ? { description: detail.data.description } : {}),
        }}
        onSubmit={async (v) => {
          await update.mutateAsync({
            id,
            name: v.name,
            description: v.description ?? null,
          })
        }}
      />
    </Card>
  )
}
