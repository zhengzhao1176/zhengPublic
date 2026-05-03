'use client'
import { useState } from 'react'
import { z } from 'zod'

export type ProductFormValues = {
  code: string
  name: string
  categoryId: number
  description?: string
  costPrice: number
  sellPrice: number
  quantity: number
  unit: string
  supplierId: number
  minStock: number
  maxStock: number
}

const schema = z
  .object({
    code: z
      .string()
      .regex(/^[A-Za-z0-9-]{3,20}$/, '编码必须为3-20位字母数字或短横线'),
    name: z.string().trim().min(1, '名称不能为空').max(100),
    categoryId: z.number().int().positive('请选择分类'),
    description: z.string().max(1000).optional(),
    costPrice: z.number().positive('进价必须大于0'),
    sellPrice: z.number().positive('售价必须大于0'),
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
  categories,
  suppliers,
  onSubmit,
}: {
  categories: { id: number; name: string }[]
  suppliers: { id: number; name: string }[]
  onSubmit: (values: ProductFormValues) => Promise<void>
}) {
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setErrors({})
    const fd = new FormData(e.currentTarget)
    const raw = {
      code: String(fd.get('code') ?? ''),
      name: String(fd.get('name') ?? ''),
      categoryId: Number(fd.get('categoryId') ?? 0),
      description: String(fd.get('description') ?? '') || undefined,
      costPrice: Number(fd.get('costPrice') ?? 0),
      sellPrice: Number(fd.get('sellPrice') ?? 0),
      quantity: Number(fd.get('quantity') ?? 0),
      unit: String(fd.get('unit') ?? ''),
      supplierId: Number(fd.get('supplierId') ?? 0),
      minStock: Number(fd.get('minStock') ?? 0),
      maxStock: Number(fd.get('maxStock') ?? 0),
    }
    const parsed = schema.safeParse(raw)
    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {}
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0])
        if (!fieldErrors[key]) fieldErrors[key] = issue.message
      }
      setErrors(fieldErrors)
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
    <form onSubmit={handleSubmit} aria-label="商品表单" noValidate>
      <label>
        编码<input name="code" />
      </label>
      {errors.code && <p role="alert">{errors.code}</p>}

      <label>
        名称<input name="name" />
      </label>
      {errors.name && <p role="alert">{errors.name}</p>}

      <label>
        分类
        <select name="categoryId" defaultValue="0">
          <option value="0">请选择</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </label>
      {errors.categoryId && <p role="alert">{errors.categoryId}</p>}

      <label>
        进价<input name="costPrice" type="number" step="0.01" />
      </label>
      {errors.costPrice && <p role="alert">{errors.costPrice}</p>}

      <label>
        售价<input name="sellPrice" type="number" step="0.01" />
      </label>
      {errors.sellPrice && <p role="alert">{errors.sellPrice}</p>}

      <label>
        初始库存<input name="quantity" type="number" />
      </label>
      {errors.quantity && <p role="alert">{errors.quantity}</p>}

      <label>
        单位<input name="unit" />
      </label>
      {errors.unit && <p role="alert">{errors.unit}</p>}

      <label>
        供应商
        <select name="supplierId" defaultValue="0">
          <option value="0">请选择</option>
          {suppliers.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      </label>
      {errors.supplierId && <p role="alert">{errors.supplierId}</p>}

      <label>
        最小库存<input name="minStock" type="number" />
      </label>
      {errors.minStock && <p role="alert">{errors.minStock}</p>}

      <label>
        最大库存<input name="maxStock" type="number" />
      </label>
      {errors.maxStock && <p role="alert">{errors.maxStock}</p>}

      <label>
        描述<textarea name="description" />
      </label>

      <button type="submit" disabled={submitting}>
        {submitting ? '保存中...' : '保存'}
      </button>
    </form>
  )
}
