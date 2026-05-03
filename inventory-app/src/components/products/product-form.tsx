'use client'
import { useState } from 'react'
import { Form, Input, InputNumber, Select, Button } from 'antd'
import { z } from 'zod'

export type ProductFormValues = {
  code: string
  name: string
  categoryId: number
  description?: string | undefined
  costPrice: number
  sellPrice: number
  quantity: number
  unit: string
  supplierId: number
  minStock: number
  maxStock: number
}

// 故意不在 moneyField 上调 .positive()/.max() — 字段级 .refine 提供中文文案，避免 Zod 默认英文 message 抢先触发
const moneyField = z.number().finite()

const schema = z
  .object({
    code: z.string().regex(/^[A-Za-z0-9-]{3,20}$/, '编码必须为3-20位字母数字或短横线'),
    name: z
      .string()
      .trim()
      .min(1, '名称不能为空')
      .max(100, '名称长度不能超过100'),
    categoryId: z.number().int().positive('请选择分类'),
    description: z.string().max(1000, '描述长度不能超过1000').optional(),
    costPrice: moneyField
      .refine((n) => n > 0, '进价必须大于0')
      .refine((n) => n <= 99999.99, '进价不能超过99999.99')
      .refine((n) => Math.round(n * 100) === n * 100, '进价最多保留2位小数'),
    sellPrice: moneyField
      .refine((n) => n > 0, '售价必须大于0')
      .refine((n) => n <= 99999.99, '售价不能超过99999.99')
      .refine((n) => Math.round(n * 100) === n * 100, '售价最多保留2位小数'),
    quantity: z.number().int().nonnegative('库存数量必须 >= 0'),
    unit: z.string().min(1, '请填写单位').max(20),
    supplierId: z.number().int().positive('请选择供应商'),
    minStock: z.number().int().positive('最小库存必须 > 0'),
    maxStock: z.number().int(),
  })
  .refine((d) => d.maxStock > d.minStock, {
    message: '最大库存必须大于最小库存',
    path: ['maxStock'],
  })

export function ProductForm({
  initial,
  categories,
  suppliers,
  onSubmit,
  mode = 'create',
}: {
  initial?: Partial<ProductFormValues>
  categories: { id: number; name: string }[]
  suppliers: { id: number; name: string }[]
  onSubmit: (v: ProductFormValues) => Promise<void>
  mode?: 'create' | 'edit'
}) {
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)

  async function handleFinish(raw: Record<string, unknown>) {
    setErrors({})
    const parsed = schema.safeParse({
      code: String(raw['code'] ?? ''),
      name: String(raw['name'] ?? ''),
      categoryId: Number(raw['categoryId'] ?? 0),
      description: raw['description'] ? String(raw['description']) : undefined,
      costPrice: Number(raw['costPrice'] ?? 0),
      sellPrice: Number(raw['sellPrice'] ?? 0),
      quantity: Number(raw['quantity'] ?? 0),
      unit: String(raw['unit'] ?? ''),
      supplierId: Number(raw['supplierId'] ?? 0),
      minStock: Number(raw['minStock'] ?? 0),
      maxStock: Number(raw['maxStock'] ?? 0),
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
    <Form
      layout="vertical"
      initialValues={initial}
      onFinish={handleFinish}
      aria-label="商品表单"
    >
      <Form.Item label="编码" name="code">
        <Input aria-label="编码" disabled={mode === 'edit'} />
      </Form.Item>
      {errors.code && <Err msg={errors.code} />}

      <Form.Item label="名称" name="name">
        <Input aria-label="名称" />
      </Form.Item>
      {errors.name && <Err msg={errors.name} />}

      <Form.Item label="分类" name="categoryId">
        <Select
          aria-label="分类"
          placeholder="请选择"
          options={categories.map((c) => ({ label: c.name, value: c.id }))}
          allowClear
        />
      </Form.Item>
      {errors.categoryId && <Err msg={errors.categoryId} />}

      <Form.Item label="进价" name="costPrice">
        <InputNumber aria-label="进价" step={0.01} style={{ width: '100%' }} />
      </Form.Item>
      {errors.costPrice && <Err msg={errors.costPrice} />}

      <Form.Item label="售价" name="sellPrice">
        <InputNumber aria-label="售价" step={0.01} style={{ width: '100%' }} />
      </Form.Item>
      {errors.sellPrice && <Err msg={errors.sellPrice} />}

      <Form.Item label="初始库存" name="quantity">
        <InputNumber aria-label="初始库存" style={{ width: '100%' }} />
      </Form.Item>
      {errors.quantity && <Err msg={errors.quantity} />}

      <Form.Item label="单位" name="unit">
        <Input aria-label="单位" />
      </Form.Item>
      {errors.unit && <Err msg={errors.unit} />}

      <Form.Item label="供应商" name="supplierId">
        <Select
          aria-label="供应商"
          placeholder="请选择"
          options={suppliers.map((s) => ({ label: s.name, value: s.id }))}
          allowClear
        />
      </Form.Item>
      {errors.supplierId && <Err msg={errors.supplierId} />}

      <Form.Item label="最小库存" name="minStock">
        <InputNumber aria-label="最小库存" style={{ width: '100%' }} />
      </Form.Item>
      {errors.minStock && <Err msg={errors.minStock} />}

      <Form.Item label="最大库存" name="maxStock">
        <InputNumber aria-label="最大库存" style={{ width: '100%' }} />
      </Form.Item>
      {errors.maxStock && <Err msg={errors.maxStock} />}

      <Form.Item label="描述" name="description">
        <Input.TextArea aria-label="描述" rows={3} />
      </Form.Item>
      {errors.description && <Err msg={errors.description} />}

      <Button type="primary" htmlType="submit" loading={submitting} disabled={submitting}>
        {submitting ? '保存中...' : '保存'}
      </Button>
    </Form>
  )
}

function Err({ msg }: { msg: string }) {
  return <p role="alert" style={{ color: '#ff4d4f', marginTop: -16 }}>{msg}</p>
}
