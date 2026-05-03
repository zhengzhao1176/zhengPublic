import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ProductForm } from '@/components/products/product-form'

const cats = [{ id: 1, name: '类别A' }]
const sups = [{ id: 1, name: '供应商A' }]

function renderForm(onSubmit = vi.fn()) {
  render(<ProductForm categories={cats} suppliers={sups} onSubmit={onSubmit} />)
  return { onSubmit }
}

async function fillValid(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('编码'), 'P001')
  await user.type(screen.getByLabelText('名称'), 'Widget')
  await user.selectOptions(screen.getByLabelText('分类'), '1')
  await user.type(screen.getByLabelText('进价'), '10')
  await user.type(screen.getByLabelText('售价'), '20')
  await user.type(screen.getByLabelText('初始库存'), '5')
  await user.type(screen.getByLabelText('单位'), 'pcs')
  await user.selectOptions(screen.getByLabelText('供应商'), '1')
  await user.type(screen.getByLabelText('最小库存'), '1')
  await user.type(screen.getByLabelText('最大库存'), '100')
}

describe('ProductForm', () => {
  it('shows error when code too short, blocks submit', async () => {
    const { onSubmit } = renderForm()
    const user = userEvent.setup()
    await user.type(screen.getByLabelText('编码'), 'AB')
    await user.click(screen.getByRole('button', { name: /保存/ }))
    expect(
      await screen.findByText('编码必须为3-20位字母数字或短横线'),
    ).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('shows error when name is empty/whitespace', async () => {
    const { onSubmit } = renderForm()
    const user = userEvent.setup()
    await fillValid(user)
    await user.clear(screen.getByLabelText('名称'))
    await user.type(screen.getByLabelText('名称'), '   ')
    await user.click(screen.getByRole('button', { name: /保存/ }))
    expect(await screen.findByText('名称不能为空')).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('shows error when category not selected', async () => {
    const { onSubmit } = renderForm()
    const user = userEvent.setup()
    await fillValid(user)
    await user.selectOptions(screen.getByLabelText('分类'), '0')
    await user.click(screen.getByRole('button', { name: /保存/ }))
    expect(await screen.findByText('请选择分类')).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('shows error when costPrice is 0 or negative', async () => {
    const { onSubmit } = renderForm()
    const user = userEvent.setup()
    await fillValid(user)
    await user.clear(screen.getByLabelText('进价'))
    await user.type(screen.getByLabelText('进价'), '0')
    await user.click(screen.getByRole('button', { name: /保存/ }))
    expect(await screen.findByText('进价必须大于0')).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('shows error when maxStock <= minStock', async () => {
    const { onSubmit } = renderForm()
    const user = userEvent.setup()
    await fillValid(user)
    await user.clear(screen.getByLabelText('最大库存'))
    await user.type(screen.getByLabelText('最大库存'), '1')
    await user.click(screen.getByRole('button', { name: /保存/ }))
    expect(await screen.findByText('最大库存必须大于最小库存')).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('calls onSubmit with parsed values on valid input', async () => {
    const { onSubmit } = renderForm()
    const user = userEvent.setup()
    await fillValid(user)
    await user.click(screen.getByRole('button', { name: /保存/ }))
    expect(onSubmit).toHaveBeenCalledTimes(1)
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'P001',
        name: 'Widget',
        categoryId: 1,
        supplierId: 1,
        costPrice: 10,
        sellPrice: 20,
        quantity: 5,
        unit: 'pcs',
        minStock: 1,
        maxStock: 100,
      }),
    )
  })

  it('disables submit button while submitting (no double-submit)', async () => {
    let resolve!: () => void
    const onSubmit = vi.fn(() => new Promise<void>((r) => { resolve = r }))
    render(<ProductForm categories={cats} suppliers={sups} onSubmit={onSubmit} />)
    const user = userEvent.setup()
    await fillValid(user)
    await user.click(screen.getByRole('button', { name: /保存/ }))
    const button = screen.getByRole('button')
    expect(button).toBeDisabled()
    expect(button).toHaveTextContent('保存中...')
    resolve()
  })

  it('all error messages have role="alert"', async () => {
    const { onSubmit } = renderForm()
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /保存/ }))
    const alerts = await screen.findAllByRole('alert')
    expect(alerts.length).toBeGreaterThan(0)
    expect(onSubmit).not.toHaveBeenCalled()
  })
})
