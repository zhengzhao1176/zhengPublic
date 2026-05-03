'use client'
import { useEffect, useState } from 'react'
import { Form, Input, InputNumber, Select, Button, DatePicker } from 'antd'
import dayjs, { type Dayjs } from 'dayjs'
import { z } from 'zod'

export type PurchaseOrderFormValues = {
  productId: number
  quantity: number
  costPrice: number
  supplierId: number
  purchaser: string
  remark?: string | undefined
  purchaseDate: string // ISO
}

const schema = z.object({
  productId: z.number().int().positive('请选择商品'),
  quantity: z.number().int().positive('进货数量必须为正整数'),
  costPrice: z
    .number()
    .finite()
    .positive('进价必须大于0')
    .max(99999.99)
    .refine((n) => Math.round(n * 100) === n * 100, '进价最多保留2位小数'),
  supplierId: z.number().int().positive('请选择供应商'),
  purchaser: z.string().trim().min(1, '经办人不能为空').max(50),
  remark: z.string().max(1000).optional(),
  purchaseDate: z.string().datetime(),
})

export function PurchaseOrderForm({
  initial,
  products,
  suppliers,
  onSubmit,
}: {
  initial?: Partial<PurchaseOrderFormValues>
  products: Array<{ id: number; code: string; name: string; costPrice: number }>
  suppliers: Array<{ id: number; name: string }>
  onSubmit: (v: PurchaseOrderFormValues) => Promise<void>
}) {
  const [form] = Form.useForm()
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)

  const productId = Form.useWatch('productId', form) as number | undefined
  const quantity = Form.useWatch('quantity', form) as number | undefined
  const costPrice = Form.useWatch('costPrice', form) as number | undefined

  useEffect(() => {
    if (productId) {
      const p = products.find((p) => p.id === productId)
      if (p && form.getFieldValue('costPrice') == null) {
        form.setFieldValue('costPrice', p.costPrice)
      }
    }
  }, [productId, products, form])

  const total =
    quantity != null && costPrice != null
      ? Math.round(Number(quantity) * Number(costPrice) * 100) / 100
      : 0

  async function handleFinish(raw: Record<string, unknown>) {
    setErrors({})
    const dateRaw = raw['purchaseDate']
    const iso =
      dateRaw && typeof dateRaw === 'object' && 'toISOString' in dateRaw
        ? (dateRaw as Dayjs).toISOString()
        : typeof dateRaw === 'string'
        ? dateRaw
        : new Date().toISOString()
    const parsed = schema.safeParse({
      productId: Number(raw['productId'] ?? 0),
      quantity: Number(raw['quantity'] ?? 0),
      costPrice: Number(raw['costPrice'] ?? 0),
      supplierId: Number(raw['supplierId'] ?? 0),
      purchaser: String(raw['purchaser'] ?? ''),
      remark: raw['remark'] ? String(raw['remark']) : undefined,
      purchaseDate: iso,
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
      form={form}
      layout="vertical"
      initialValues={{
        ...initial,
        purchaseDate: initial?.purchaseDate ? dayjs(initial.purchaseDate) : dayjs(),
      }}
      onFinish={handleFinish}
      aria-label="进货单表单"
    >
      <Form.Item label="商品" name="productId">
        <Select
          aria-label="商品"
          placeholder="请选择"
          showSearch
          optionFilterProp="label"
          options={products.map((p) => ({ label: `${p.code} - ${p.name}`, value: p.id }))}
        />
      </Form.Item>
      {errors.productId && <Err msg={errors.productId} />}

      <Form.Item label="进货数量" name="quantity">
        <InputNumber aria-label="进货数量" style={{ width: '100%' }} />
      </Form.Item>
      {errors.quantity && <Err msg={errors.quantity} />}

      <Form.Item label="进货单价" name="costPrice">
        <InputNumber aria-label="进货单价" step={0.01} style={{ width: '100%' }} />
      </Form.Item>
      {errors.costPrice && <Err msg={errors.costPrice} />}

      <Form.Item label="进货金额">
        <Input aria-label="进货金额" disabled value={total.toFixed(2)} />
      </Form.Item>

      <Form.Item label="供应商" name="supplierId">
        <Select
          aria-label="供应商"
          placeholder="请选择"
          options={suppliers.map((s) => ({ label: s.name, value: s.id }))}
        />
      </Form.Item>
      {errors.supplierId && <Err msg={errors.supplierId} />}

      <Form.Item label="进货员" name="purchaser">
        <Input aria-label="进货员" />
      </Form.Item>
      {errors.purchaser && <Err msg={errors.purchaser} />}

      <Form.Item label="进货日期" name="purchaseDate">
        <DatePicker aria-label="进货日期" style={{ width: '100%' }} />
      </Form.Item>

      <Form.Item label="备注" name="remark">
        <Input.TextArea aria-label="备注" rows={2} />
      </Form.Item>

      <Button type="primary" htmlType="submit" loading={submitting} disabled={submitting}>
        {submitting ? '保存中...' : '保存'}
      </Button>
    </Form>
  )
}

function Err({ msg }: { msg: string }) {
  return <p role="alert" style={{ color: '#ff4d4f', marginTop: -16 }}>{msg}</p>
}
