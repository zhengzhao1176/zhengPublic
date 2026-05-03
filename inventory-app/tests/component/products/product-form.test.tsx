import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ConfigProvider, App as AntdApp } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import type { ComponentProps, ReactNode } from 'react'
import { ProductForm } from '@/components/products/product-form'

const categories = [{ id: 1, name: '类别A' }]
const suppliers = [{ id: 1, name: '供应商A' }]

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

// 解出 ProductForm 的 props 类型（避开直接 import named type，组件文件被列为禁读）
type ProductFormProps = ComponentProps<typeof ProductForm>
type ProductFormSubmit = ProductFormProps['onSubmit']

function renderForm(props: RenderProps) {
  return render(
    <Wrap>
      <ProductForm
        categories={categories}
        suppliers={suppliers}
        onSubmit={props.onSubmit as unknown as ProductFormSubmit}
        {...(props.initial
          ? ({ initial: props.initial } as unknown as Pick<ProductFormProps, 'initial'>)
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

/** 选择 antd Select 选项；通过 role 找到组合框，点击展开后点选项 */
async function selectOption(
  user: ReturnType<typeof userEvent.setup>,
  label: string,
  optionText: string,
) {
  const combobox = screen.getByRole('combobox', { name: label })
  await user.click(combobox)
  const option = await screen.findByText(optionText)
  await user.click(option)
}

/** 填入一组合法默认值（不含某指定字段时跳过） */
async function fillAllValid(
  user: ReturnType<typeof userEvent.setup>,
  overrides: Partial<{
    code: string
    name: string
    costPrice: string | number
    sellPrice: string | number
    quantity: string | number
    unit: string
    minStock: string | number
    maxStock: string | number
    selectCategory: boolean
    selectSupplier: boolean
  }> = {},
) {
  const code = overrides.code ?? 'P001'
  const name = overrides.name ?? 'Widget'
  const costPrice = overrides.costPrice ?? '10'
  const sellPrice = overrides.sellPrice ?? '20'
  const quantity = overrides.quantity ?? '5'
  const unit = overrides.unit ?? '件'
  const minStock = overrides.minStock ?? '1'
  const maxStock = overrides.maxStock ?? '100'

  await user.type(screen.getByLabelText('编码'), code)
  await user.type(screen.getByLabelText('名称'), name)
  await typeNumber(user, '进价', costPrice)
  await typeNumber(user, '售价', sellPrice)
  await typeNumber(user, '初始库存', quantity)
  await user.type(screen.getByLabelText('单位'), unit)
  await typeNumber(user, '最小库存', minStock)
  await typeNumber(user, '最大库存', maxStock)

  if (overrides.selectCategory !== false) {
    await selectOption(user, '分类', '类别A')
  }
  if (overrides.selectSupplier !== false) {
    await selectOption(user, '供应商', '供应商A')
  }
}

async function submit(user: ReturnType<typeof userEvent.setup>) {
  const btn = screen.getByRole('button', { name: '保存' })
  await user.click(btn)
}

describe('ProductForm — 字段校验文案', () => {
  it('编码 AB（太短）→ 编码必须为3-20位字母数字或短横线，onSubmit 未调用', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    renderForm({ onSubmit })
    const user = userEvent.setup()

    await fillAllValid(user, { code: 'AB' })
    await submit(user)

    expect(
      await screen.findByText('编码必须为3-20位字母数字或短横线'),
    ).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('编码 P 01（含空格）→ 编码必须为3-20位字母数字或短横线，onSubmit 未调用', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    renderForm({ onSubmit })
    const user = userEvent.setup()

    await fillAllValid(user, { code: 'P 01' })
    await submit(user)

    expect(
      await screen.findByText('编码必须为3-20位字母数字或短横线'),
    ).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('名称为空 → 名称不能为空', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    renderForm({ onSubmit })
    const user = userEvent.setup()

    // 跳过 name
    await user.type(screen.getByLabelText('编码'), 'P001')
    await typeNumber(user, '进价', '10')
    await typeNumber(user, '售价', '20')
    await typeNumber(user, '初始库存', '5')
    await user.type(screen.getByLabelText('单位'), '件')
    await typeNumber(user, '最小库存', '1')
    await typeNumber(user, '最大库存', '100')
    await selectOption(user, '分类', '类别A')
    await selectOption(user, '供应商', '供应商A')
    await submit(user)

    expect(await screen.findByText('名称不能为空')).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('进价 0 → 进价必须大于0', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    renderForm({ onSubmit })
    const user = userEvent.setup()

    await fillAllValid(user, { costPrice: '0' })
    await submit(user)

    expect(await screen.findByText('进价必须大于0')).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('进价 10.123 → 进价最多保留2位小数', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    renderForm({ onSubmit })
    const user = userEvent.setup()

    await fillAllValid(user, { costPrice: '10.123' })
    await submit(user)

    expect(await screen.findByText('进价最多保留2位小数')).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('售价 0 → 售价必须大于0', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    renderForm({ onSubmit })
    const user = userEvent.setup()

    await fillAllValid(user, { sellPrice: '0' })
    await submit(user)

    expect(await screen.findByText('售价必须大于0')).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('初始库存 -1 → 库存数量必须 >= 0', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    renderForm({ onSubmit })
    const user = userEvent.setup()

    await fillAllValid(user, { quantity: '-1' })
    await submit(user)

    expect(await screen.findByText('库存数量必须 >= 0')).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('单位为空 → 请填写单位', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    renderForm({ onSubmit })
    const user = userEvent.setup()

    // fill everything except unit
    await user.type(screen.getByLabelText('编码'), 'P001')
    await user.type(screen.getByLabelText('名称'), 'Widget')
    await typeNumber(user, '进价', '10')
    await typeNumber(user, '售价', '20')
    await typeNumber(user, '初始库存', '5')
    await typeNumber(user, '最小库存', '1')
    await typeNumber(user, '最大库存', '100')
    await selectOption(user, '分类', '类别A')
    await selectOption(user, '供应商', '供应商A')
    await submit(user)

    expect(await screen.findByText('请填写单位')).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('最小库存 0 → 最小库存必须 > 0', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    renderForm({ onSubmit })
    const user = userEvent.setup()

    await fillAllValid(user, { minStock: '0', maxStock: '5' })
    await submit(user)

    expect(await screen.findByText('最小库存必须 > 0')).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('最大库存 ≤ 最小库存 → 最大库存必须大于最小库存', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    renderForm({ onSubmit })
    const user = userEvent.setup()

    await fillAllValid(user, { minStock: '10', maxStock: '10' })
    await submit(user)

    expect(
      await screen.findByText('最大库存必须大于最小库存'),
    ).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('分类未选 → 请选择分类', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    renderForm({ onSubmit })
    const user = userEvent.setup()

    await fillAllValid(user, { selectCategory: false })
    await submit(user)

    expect(await screen.findByText('请选择分类')).toBeInTheDocument()
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
})

describe('ProductForm — 成功提交', () => {
  it('全部合法 → onSubmit 携带所有字段', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    renderForm({ onSubmit })
    const user = userEvent.setup()

    await fillAllValid(user, {
      code: 'P001',
      name: 'Widget',
      costPrice: '10.5',
      sellPrice: '20',
      quantity: '5',
      unit: '件',
      minStock: '1',
      maxStock: '100',
    })
    await submit(user)

    await vi.waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(1)
    })
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'P001',
        name: 'Widget',
        categoryId: 1,
        supplierId: 1,
        costPrice: 10.5,
        sellPrice: 20,
        quantity: 5,
        unit: '件',
        minStock: 1,
        maxStock: 100,
      }),
    )
  })
})

describe('ProductForm — 编辑模式', () => {
  it("mode='edit' 时编码字段 disabled", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    renderForm({
      onSubmit,
      mode: 'edit',
      initial: {
        code: 'P001',
        name: 'Widget',
        categoryId: 1,
        supplierId: 1,
        costPrice: 10,
        sellPrice: 20,
        quantity: 5,
        unit: '件',
        minStock: 1,
        maxStock: 100,
      },
    })

    const codeInput = screen.getByLabelText('编码') as HTMLInputElement
    expect(codeInput).toBeDisabled()
  })
})

describe('ProductForm — 提交进行中', () => {
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

    // 收尾 — 让 onSubmit 完成以避免 act 警告
    resolve()
    await pending
  })
})

describe('ProductForm — 错误均带 role="alert"', () => {
  it('字段错误时至少 1 个 role="alert"', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    renderForm({ onSubmit })
    const user = userEvent.setup()

    await fillAllValid(user, { code: 'AB' })
    await submit(user)

    // 确保错误已渲染
    await screen.findByText('编码必须为3-20位字母数字或短横线')
    const alerts = await screen.findAllByRole('alert')
    expect(alerts.length).toBeGreaterThanOrEqual(1)
    expect(onSubmit).not.toHaveBeenCalled()
  })
})

// 抑制未使用 import 的 lint
void within
