'use client'
import { useEffect, useState } from 'react'
import { Form, Input, InputNumber, Select, Button, DatePicker } from 'antd'
import dayjs, { type Dayjs } from 'dayjs'
import { z } from 'zod'

export type SalesOrderFormValues = {
  productId: number
  quantity: number
  sellPrice: number
  customer: string
  shipper: string
  remark?: string | undefined
  salesDate: string // ISO
}

const schema = z.object({
  productId: z.number().int().positive('请选择商品'),
  quantity: z.number().int().positive('出货数量必须为正整数'),
  sellPrice: z
    .number()
    .finite()
    .positive('售价必须大于0')
    .max(99999.99)
    .refine((n) => Math.round(n * 100) === n * 100, '售价最多保留2位小数'),
  customer: z.string().trim().min(1, '客户名称不能为空').max(100),
  shipper: z.string().trim().min(1, '经办人不能为空').max(50),
  remark: z.string().max(1000).optional(),
  salesDate: z.string().datetime(),
})

export function SalesOrderForm({
  initial,
  products,
  onSubmit,
}: {
  initial?: Partial<SalesOrderFormValues>
  products: Array<{ id: number; code: string; name: string; sellPrice: number; quantity: number }>
  onSubmit: (v: SalesOrderFormValues) => Promise<void>
}) {
  const [form] = Form.useForm()
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)

  const productId = Form.useWatch('productId', form) as number | undefined
  const quantity = Form.useWatch('quantity', form) as number | undefined
  const sellPrice = Form.useWatch('sellPrice', form) as number | undefined

  useEffect(() => {
    if (productId) {
      const p = products.find((p) => p.id === productId)
      if (p && form.getFieldValue('sellPrice') == null) {
        form.setFieldValue('sellPrice', p.sellPrice)
      }
    }
  }, [productId, products, form])

  const total =
    quantity != null && sellPrice != null
      ? Math.round(Number(quantity) * Number(sellPrice) * 100) / 100
      : 0

  async function handleFinish(raw: Record<string, unknown>) {
    setErrors({})
    const dateRaw = raw['salesDate']
    const iso =
      dateRaw && typeof dateRaw === 'object' && 'toISOString' in dateRaw
        ? (dateRaw as Dayjs).toISOString()
        : typeof dateRaw === 'string'
        ? dateRaw
        : new Date().toISOString()
    const parsed = schema.safeParse({
      productId: Number(raw['productId'] ?? 0),
      quantity: Number(raw['quantity'] ?? 0),
      sellPrice: Number(raw['sellPrice'] ?? 0),
      customer: String(raw['customer'] ?? ''),
      shipper: String(raw['shipper'] ?? ''),
      remark: raw['remark'] ? String(raw['remark']) : undefined,
      salesDate: iso,
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
        salesDate: initial?.salesDate ? dayjs(initial.salesDate) : dayjs(),
      }}
      onFinish={handleFinish}
      aria-label="出货单表单"
    >
      <Form.Item label="商品" name="productId">
        <Select
          aria-label="商品"
          placeholder="请选择"
          showSearch
          optionFilterProp="label"
          options={products.map((p) => ({
            label: `${p.code} - ${p.name}（库存 ${p.quantity}）`,
            value: p.id,
          }))}
        />
      </Form.Item>
      {errors.productId && <Err msg={errors.productId} />}

      <Form.Item label="出货数量" name="quantity">
        <InputNumber aria-label="出货数量" style={{ width: '100%' }} />
      </Form.Item>
      {errors.quantity && <Err msg={errors.quantity} />}

      <Form.Item label="出货单价" name="sellPrice">
        <InputNumber aria-label="出货单价" step={0.01} style={{ width: '100%' }} />
      </Form.Item>
      {errors.sellPrice && <Err msg={errors.sellPrice} />}

      <Form.Item label="出货金额">
        <Input aria-label="出货金额" disabled value={total.toFixed(2)} />
      </Form.Item>

      <Form.Item label="客户" name="customer">
        <Input aria-label="客户" />
      </Form.Item>
      {errors.customer && <Err msg={errors.customer} />}

      <Form.Item label="出货员" name="shipper">
        <Input aria-label="出货员" />
      </Form.Item>
      {errors.shipper && <Err msg={errors.shipper} />}

      <Form.Item label="出货日期" name="salesDate">
        <DatePicker aria-label="出货日期" style={{ width: '100%' }} />
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
