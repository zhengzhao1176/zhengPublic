'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Alert, App as AntdApp, Card } from 'antd'
import { trpc } from '@/lib/trpc-client'
import { translateError } from '@/lib/format'
import { SupplierForm } from '@/components/suppliers/supplier-form'

export default function NewSupplierPage() {
  const router = useRouter()
  const { message } = AntdApp.useApp()
  const utils = trpc.useUtils()
  const [serverError, setServerError] = useState<string | null>(null)
  const create = trpc.suppliers.create.useMutation({
    onSuccess: () => {
      message.success('创建成功')
      utils.suppliers.list.invalidate()
      router.replace('/suppliers')
    },
    onError: (e) => setServerError(translateError(e.message)),
  })

  return (
    <Card title="新增供应商">
      {serverError && (
        <Alert role="alert" type="error" showIcon message={serverError} style={{ marginBottom: 16 }} />
      )}
      <SupplierForm onSubmit={async (v) => { await create.mutateAsync(v) }} />
    </Card>
  )
}
