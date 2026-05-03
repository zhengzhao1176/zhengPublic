import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ConfigProvider, App as AntdApp } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import type { ComponentProps, ReactNode } from 'react'
import { SalesOrderForm } from '@/components/sales-orders/sales-order-form'

type SalesOrderFormProps = ComponentProps<typeof SalesOrderForm>
type SalesOrderFormSubmit = SalesOrderFormProps['onSubmit']

const products = [
  { id: 1, code: 'P1', name: 'X', sellPrice: 20, quantity: 50 },
]

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
  return render(
    <Wrap>
      <SalesOrderForm
        products={products}
        onSubmit={props.onSubmit as unknown as SalesOrderFormSubmit}
        {...(props.initial
          ? ({ initial: props.initial } as unknown as Pick<SalesOrderFormProps, 'initial'>)
          : {})}
        {...(props.mode ? { mode: props.mode } : {})}
      />
    </Wrap>,
  )
}

/** 在 antd InputNumber 中输入数字（DOM 层为 <input role="spinbutton">） */
async function typeNumber(
  user: ReturnType<typeof userEvent.setup>,
  label: string,
  value: string | number,
) {
  const input = screen.getByLabelText(label) as HTMLInputElement
  await user.clear(input)
  await user.type(input, String(value))
}

/** 选择 antd Select 选项；用 combobox role 消歧（aria-label 同时挂在外层 div 和内部 input 上） */
async function selectOption(
  user: ReturnType<typeof userEvent.setup>,
  label: string,
  optionText: string,
) {
  const combobox = screen.getByRole('combobox', { name: label })
  await user.click(combobox)
  // 等待 antd 下拉浮层出现；选项文案可能含 `（库存 N）` 后缀，用部分匹配
  const option = await vi.waitFor(() => {
    const items = document.querySelectorAll('.ant-select-item-option')
    for (const item of Array.from(items)) {
      if ((item.textContent ?? '').includes(optionText)) return item as HTMLElement
    }
    throw new Error(`option "${optionText}" not found yet`)
  })
  await user.click(option)
}

async function fillAllValid(
  user: ReturnType<typeof userEvent.setup>,
  overrides: Partial<{
    quantity: string | number
    sellPrice: string | number
    customer: string
    shipper: string
    selectProduct: boolean
  }> = {},
) {
  const quantity = overrides.quantity ?? '5'
  const sellPrice = overrides.sellPrice ?? '20'
  const customer = overrides.customer ?? '王五'
  const shipper = overrides.shipper ?? '李四'

  if (overrides.selectProduct !== false) {
    await selectOption(user, '商品', 'P1')
  }
  await typeNumber(user, '出货数量', quantity)
  // 出货单价：选商品后可能已自动填入，先清空再填（即使最终值为 0 也允许）
  const priceInput = screen.getByLabelText('出货单价') as HTMLInputElement
  await user.clear(priceInput)
  if (String(sellPrice).length > 0) {
    await user.type(priceInput, String(sellPrice))
  }
  if (customer.length > 0) {
    await user.type(screen.getByLabelText('客户'), customer)
  }
  if (shipper.length > 0) {
    await user.type(screen.getByLabelText('出货员'), shipper)
  }
}

async function submit(user: ReturnType<typeof userEvent.setup>) {
  const btn = screen.getByRole('button', { name: '保存' })
  await user.click(btn)
}

describe('SalesOrderForm — 字段校验', () => {
  it('商品未选 → 请选择商品，onSubmit 未调用', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    renderForm({ onSubmit })
    const user = userEvent.setup()

    await fillAllValid(user, { selectProduct: false })
    await submit(user)

    expect(await screen.findByText('请选择商品')).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('出货数量 0 → 出货数量必须为正整数', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    renderForm({ onSubmit })
    const user = userEvent.setup()

    await fillAllValid(user, { quantity: '0' })
    await submit(user)

    expect(await screen.findByText('出货数量必须为正整数')).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('出货单价 0 → 售价必须大于0', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    renderForm({ onSubmit })
    const user = userEvent.setup()

    await fillAllValid(user, { sellPrice: '0' })
    await submit(user)

    expect(await screen.findByText('售价必须大于0')).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('出货单价 10.123 → 售价最多保留2位小数', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    renderForm({ onSubmit })
    const user = userEvent.setup()

    await fillAllValid(user, { sellPrice: '10.123' })
    await submit(user)

    expect(await screen.findByText('售价最多保留2位小数')).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('客户为空 → 客户名称不能为空', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    renderForm({ onSubmit })
    const user = userEvent.setup()

    await fillAllValid(user, { customer: '' })
    await submit(user)

    expect(await screen.findByText('客户名称不能为空')).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('出货员为空 → 经办人不能为空', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    renderForm({ onSubmit })
    const user = userEvent.setup()

    await fillAllValid(user, { shipper: '' })
    await submit(user)

    expect(await screen.findByText('经办人不能为空')).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })
})

describe('SalesOrderForm — 字段错误均带 role="alert"', () => {
  it('字段错误时至少 1 个 role="alert"', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    renderForm({ onSubmit })
    const user = userEvent.setup()

    await fillAllValid(user, { quantity: '0' })
    await submit(user)

    await screen.findByText('出货数量必须为正整数')
    const alerts = await screen.findAllByRole('alert')
    expect(alerts.length).toBeGreaterThanOrEqual(1)
    expect(onSubmit).not.toHaveBeenCalled()
  })
})

describe('SalesOrderForm — 选商品后自动填 sellPrice', () => {
  it('选择商品后 sellPrice 字段自动填入商品 sellPrice（如为空）', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    renderForm({ onSubmit })
    const user = userEvent.setup()

    await selectOption(user, '商品', 'P1')

    const priceInput = screen.getByLabelText('出货单价') as HTMLInputElement
    // 等待自动填入；antd InputNumber 可能格式化（如 '20.00'）；用数字相等
    await vi.waitFor(() => {
      expect(Number(priceInput.value)).toBe(20)
    })
  })
})

describe('SalesOrderForm — 成功提交', () => {
  it('全部合法 → onSubmit 携带 productId/quantity/sellPrice/customer/shipper/salesDate', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    renderForm({ onSubmit })
    const user = userEvent.setup()

    await fillAllValid(user, {
      quantity: '5',
      sellPrice: '20',
      customer: '王五',
      shipper: '李四',
    })
    await submit(user)

    await vi.waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(1)
    })
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        productId: 1,
        quantity: 5,
        sellPrice: 20,
        customer: '王五',
        shipper: '李四',
        salesDate: expect.anything(),
      }),
    )
  })
})

describe('SalesOrderForm — 提交进行中', () => {
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

    // 收尾让 promise 完成
    resolve()
    await pending
  })
})
