'use client'
import { useState } from 'react'
import { Form, Input, Button } from 'antd'
import { z } from 'zod'

export type SupplierFormValues = {
  name: string
  contact?: string | undefined
  address?: string | undefined
}

const schema = z.object({
  name: z.string().trim().min(1, '供应商名称不能为空').max(100, '供应商名称长度不能超过100'),
  contact: z.string().max(50).optional(),
  address: z.string().max(255).optional(),
})

export function SupplierForm({
  initial,
  onSubmit,
}: {
  initial?: Partial<SupplierFormValues>
  onSubmit: (v: SupplierFormValues) => Promise<void>
}) {
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)

  async function handleFinish(raw: SupplierFormValues) {
    setErrors({})
    const parsed = schema.safeParse({
      name: raw.name ?? '',
      contact: raw.contact || undefined,
      address: raw.address || undefined,
    })
    if (!parsed.success) {
      const e: Record<string, string> = {}
      for (const issue of parsed.error.issues) {
        const k = String(issue.path[0])
        if (!e[k]) e[k] = issue.message
      }
      setErrors(e)
      return
    }
    setSubmitting(true)
    try {
      await onSubmit(parsed.data)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Form layout="vertical" initialValues={initial} onFinish={handleFinish} aria-label="供应商表单">
      <Form.Item label="供应商名称" name="name">
        <Input aria-label="供应商名称" />
      </Form.Item>
      {errors.name && <p role="alert" style={{ color: '#ff4d4f', marginTop: -16 }}>{errors.name}</p>}
      <Form.Item label="联系电话" name="contact">
        <Input aria-label="联系电话" />
      </Form.Item>
      <Form.Item label="地址" name="address">
        <Input aria-label="地址" />
      </Form.Item>
      <Button type="primary" htmlType="submit" loading={submitting} disabled={submitting}>
        {submitting ? '保存中...' : '保存'}
      </Button>
    </Form>
  )
}
