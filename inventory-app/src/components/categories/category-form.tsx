'use client'
import { useState } from 'react'
import { Form, Input, Button } from 'antd'
import { z } from 'zod'

export type CategoryFormValues = {
  name: string
  description?: string | undefined
}

const schema = z.object({
  name: z.string().trim().min(1, '分类名称不能为空').max(50, '分类名称长度不能超过50'),
  description: z.string().max(1000, '描述长度不能超过1000').optional(),
})

export function CategoryForm({
  initial,
  onSubmit,
}: {
  initial?: Partial<CategoryFormValues>
  onSubmit: (v: CategoryFormValues) => Promise<void>
}) {
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)

  async function handleFinish(raw: CategoryFormValues) {
    setErrors({})
    const parsed = schema.safeParse({
      name: raw.name ?? '',
      description: raw.description || undefined,
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
    <Form layout="vertical" initialValues={initial} onFinish={handleFinish} aria-label="分类表单">
      <Form.Item label="分类名称" name="name">
        <Input aria-label="分类名称" />
      </Form.Item>
      {errors.name && <p role="alert" style={{ color: '#ff4d4f', marginTop: -16 }}>{errors.name}</p>}

      <Form.Item label="描述" name="description">
        <Input.TextArea aria-label="描述" rows={3} />
      </Form.Item>
      {errors.description && <p role="alert" style={{ color: '#ff4d4f', marginTop: -16 }}>{errors.description}</p>}

      <Button type="primary" htmlType="submit" loading={submitting} disabled={submitting}>
        {submitting ? '保存中...' : '保存'}
      </Button>
    </Form>
  )
}
