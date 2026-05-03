'use client'
import { use, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Alert, App as AntdApp, Card, Spin } from 'antd'
import { trpc } from '@/lib/trpc-client'
import { translateError } from '@/lib/format'
import { SupplierForm } from '@/components/suppliers/supplier-form'

export default function EditSupplierPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: idStr } = use(params)
  const id = Number(idStr)
  const router = useRouter()
  const { message } = AntdApp.useApp()
  const utils = trpc.useUtils()
  const [serverError, setServerError] = useState<string | null>(null)

  const detail = trpc.suppliers.byId.useQuery({ id }, { enabled: Number.isFinite(id) && id > 0 })
  const update = trpc.suppliers.update.useMutation({
    onSuccess: () => {
      message.success('更新成功')
      utils.suppliers.list.invalidate()
      router.replace('/suppliers')
    },
    onError: (e) => setServerError(translateError(e.message)),
  })

  if (detail.isLoading) return <Spin />
  if (!detail.data) return <Alert role="alert" type="error" message="供应商不存在" />

  return (
    <Card title="编辑供应商">
      {serverError && (
        <Alert role="alert" type="error" showIcon message={serverError} style={{ marginBottom: 16 }} />
      )}
      <SupplierForm
        initial={{
          name: detail.data.name,
          ...(detail.data.contact !== null ? { contact: detail.data.contact } : {}),
          ...(detail.data.address !== null ? { address: detail.data.address } : {}),
        }}
        onSubmit={async (v) => {
          await update.mutateAsync({
            id,
            name: v.name,
            contact: v.contact ?? null,
            address: v.address ?? null,
          })
        }}
      />
    </Card>
  )
}
