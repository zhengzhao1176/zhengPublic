import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ConfigProvider, App as AntdApp } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import type { ReactElement, ReactNode } from 'react'
import { PurchaseOrderForm } from '@/components/purchase-orders/purchase-order-form'

const products = [{ id: 1, code: 'P1', name: 'X', costPrice: 10 }]
const suppliers = [{ id: 1, name: 'S1' }]

afterEach(() => {
  cleanup()
})

function Wrap({ children }: { children: ReactNode }) {
  return (
    <ConfigProvider locale={zhCN} button={{ autoInsertSpace: false }}>
      <AntdApp>{children}</AntdApp>
    </ConfigProvider>
  )
}

type RenderProps = {
  onSubmit: (values: unknown) => Promise<void>
  initial?: Record<string, unknown>
  mode?: 'create' | 'edit'
}

function renderForm(props: RenderProps) {
  // 通过 unknown 中转避免 props.onSubmit 与 PurchaseOrderForm 的具体 Values 类型不匹配
  // （subagent 不读 src/components/purchase-orders/**，因此用宽泛 cast）
  const Form = PurchaseOrderForm as unknown as (p: {
    products: typeof products
    suppliers: typeof suppliers
    onSubmit: (v: unknown) => Promise<void>
    initial?: Record<string, unknown>
    mode?: 'create' | 'edit'
  }) => ReactElement
  return render(
    <Wrap>
      <Form
        products={products}
        suppliers={suppliers}
        onSubmit={props.onSubmit}
        {...(props.initial ? { initial: props.initial } : {})}
        {...(props.mode ? { mode: props.mode } : {})}
      />
    </Wrap>,
  )
}

/** Antd InputNumber 输入数字 */
async function typeNumber(
  user: ReturnType<typeof userEvent.setup>,
  label: string,
  value: string | number,
) {
  const input = screen.getByLabelText(label) as HTMLInputElement
  await user.clear(input)
  await user.type(input, String(value))
}

/** Antd Select 选项点击。优先 combobox role 消歧（同 label 可能匹配多个 input） */
async function selectOption(
  user: ReturnType<typeof userEvent.setup>,
  label: string,
  optionText: string,
) {
  let combobox: HTMLElement
  try {
    combobox = screen.getByRole('combobox', { name: label })
  } catch {
    // 回退到 getByLabelText
    const matches = screen.getAllByLabelText(label)
    combobox = (matches[0] ?? matches[matches.length - 1]) as HTMLElement
  }
  await user.click(combobox)
  const option = await screen.findByText(optionText)
  await user.click(option)
}

async function fillAllValid(
  user: ReturnType<typeof userEvent.setup>,
  overrides: Partial<{
    selectProduct: boolean
    quantity: string | number
    costPrice: string | number
    selectSupplier: boolean
    purchaser: string
  }> = {},
) {
  if (overrides.selectProduct !== false) {
    await selectOption(user, '商品', 'P1 - X')
  }
  await typeNumber(user, '进货数量', overrides.quantity ?? '5')
  if (overrides.costPrice !== undefined) {
    await typeNumber(user, '进货单价', overrides.costPrice)
  } else {
    // 选择商品后默认填入 10；保持默认（不再覆盖）
  }
  if (overrides.selectSupplier !== false) {
    await selectOption(user, '供应商', 'S1')
  }
  await user.type(screen.getByLabelText('进货员'), overrides.purchaser ?? '张三')
}

async function submit(user: ReturnType<typeof userEvent.setup>) {
  const btn = screen.getByRole('button', { name: '保存' })
  await user.click(btn)
}

describe('PurchaseOrderForm — 字段校验', () => {
  it('商品未选 → 请选择商品，onSubmit 未调用', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    renderForm({ onSubmit })
    const user = userEvent.setup()

    await fillAllValid(user, { selectProduct: false, costPrice: '10' })
    await submit(user)

    expect(await screen.findByText('请选择商品')).toBeInTheDocument()
    const alerts = await screen.findAllByRole('alert')
    expect(alerts.length).toBeGreaterThanOrEqual(1)
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('进货数量 0 → 进货数量必须为正整数', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    renderForm({ onSubmit })
    const user = userEvent.setup()

    await fillAllValid(user, { quantity: '0' })
    await submit(user)

    expect(await screen.findByText('进货数量必须为正整数')).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('进货单价 0 → 进价必须大于0', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    renderForm({ onSubmit })
    const user = userEvent.setup()

    await fillAllValid(user, { costPrice: '0' })
    await submit(user)

    expect(await screen.findByText('进价必须大于0')).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('进货单价 10.123 → 进价最多保留2位小数', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    renderForm({ onSubmit })
    const user = userEvent.setup()

    await fillAllValid(user, { costPrice: '10.123' })
    await submit(user)

    expect(await screen.findByText('进价最多保留2位小数')).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('供应商未选 → 请选择供应商', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    renderForm({ onSubmit })
    const user = userEvent.setup()

    await fillAllValid(user, { selectSupplier: false })
    await submit(user)

    expect(await screen.findByText('请选择供应商')).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('进货员为空 → 经办人不能为空', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    renderForm({ onSubmit })
    const user = userEvent.setup()

    // 自行填字段；跳过 purchaser
    await selectOption(user, '商品', 'P1 - X')
    await typeNumber(user, '进货数量', '5')
    await selectOption(user, '供应商', 'S1')
    await submit(user)

    expect(await screen.findByText('经办人不能为空')).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })
})

describe('PurchaseOrderForm — 成功提交', () => {
  it('全部合法 → onSubmit 被调用，参数含必要字段', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    renderForm({ onSubmit })
    const user = userEvent.setup()

    await fillAllValid(user)
    await submit(user)

    await vi.waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(1)
    })
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        productId: 1,
        quantity: 5,
        costPrice: 10,
        supplierId: 1,
        purchaser: '张三',
        purchaseDate: expect.any(String),
      }),
    )
    const arg = onSubmit.mock.calls[0]?.[0] as { purchaseDate: string }
    expect(typeof arg.purchaseDate).toBe('string')
    expect(arg.purchaseDate.length).toBeGreaterThan(0)
    // ISO 8601 sanity check
    expect(Number.isFinite(new Date(arg.purchaseDate).getTime())).toBe(true)
  })
})

describe('PurchaseOrderForm — 提交进行中', () => {
  it('提交中按钮 disabled，文案 保存中...', async () => {
    let resolve!: () => void
    const pending = new Promise<void>((res) => {
      resolve = res
    })
    const onSubmit = vi.fn().mockReturnValue(pending)
    renderForm({ onSubmit })
    const user = userEvent.setup()

    await fillAllValid(user)
    await submit(user)

    const pendingText = await screen.findByText('保存中...')
    expect(pendingText).toBeInTheDocument()
    const pendingBtn = pendingText.closest('button')
    expect(pendingBtn).not.toBeNull()
    expect(pendingBtn).toBeDisabled()

    resolve()
    await pending
  })
})

describe('PurchaseOrderForm — 选商品后自动填进价', () => {
  it('选 P1 后 进货单价 value 包含 10', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    renderForm({ onSubmit })
    const user = userEvent.setup()

    await selectOption(user, '商品', 'P1 - X')
    const cost = screen.getByLabelText('进货单价') as HTMLInputElement
    // 等待自动填充生效
    await vi.waitFor(() => {
      expect(cost.value).toContain('10')
    })
  })
})
