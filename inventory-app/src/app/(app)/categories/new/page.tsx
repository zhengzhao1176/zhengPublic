'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Alert, App as AntdApp, Card } from 'antd'
import { trpc } from '@/lib/trpc-client'
import { translateError } from '@/lib/format'
import { CategoryForm } from '@/components/categories/category-form'

export default function NewCategoryPage() {
  const router = useRouter()
  const { message } = AntdApp.useApp()
  const utils = trpc.useUtils()
  const [serverError, setServerError] = useState<string | null>(null)
  const create = trpc.categories.create.useMutation({
    onSuccess: () => {
      message.success('创建成功')
      utils.categories.list.invalidate()
      router.replace('/categories')
    },
    onError: (e) => setServerError(translateError(e.message)),
  })

  return (
    <Card title="新增分类">
      {serverError && (
        <Alert role="alert" type="error" showIcon message={serverError} style={{ marginBottom: 16 }} />
      )}
      <CategoryForm onSubmit={async (v) => { await create.mutateAsync(v) }} />
    </Card>
  )
}
