import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ConfigProvider, App as AntdApp } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import type { ReactNode } from 'react'
import { SupplierForm } from '@/components/suppliers/supplier-form'

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

type SupplierValues = {
  name: string
  contact?: string | undefined
  address?: string | undefined
}

function renderForm(props: {
  onSubmit: (values: SupplierValues) => Promise<void>
  initial?: Partial<SupplierValues>
  mode?: 'create' | 'edit'
}) {
  return render(
    <Wrap>
      <SupplierForm
        onSubmit={props.onSubmit}
        {...(props.initial ? { initial: props.initial } : {})}
        {...(props.mode ? { mode: props.mode } : {})}
      />
    </Wrap>,
  )
}

describe('SupplierForm', () => {
  it('shows 供应商名称不能为空 when name empty and does not call onSubmit', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    renderForm({ onSubmit })
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: '保存' }))

    expect(await screen.findByText('供应商名称不能为空')).toBeInTheDocument()
    const alerts = await screen.findAllByRole('alert')
    expect(alerts.length).toBeGreaterThanOrEqual(1)
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('shows 供应商名称长度不能超过100 when name has 101 chars and does not call onSubmit', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    renderForm({ onSubmit })
    const user = userEvent.setup()

    const longName = 'x'.repeat(101)
    const nameInput = screen.getByLabelText('供应商名称')
    await user.click(nameInput)
    await user.paste(longName)
    await user.click(screen.getByRole('button', { name: '保存' }))

    expect(await screen.findByText('供应商名称长度不能超过100')).toBeInTheDocument()
    const alerts = await screen.findAllByRole('alert')
    expect(alerts.length).toBeGreaterThanOrEqual(1)
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('calls onSubmit with name when input is valid', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    renderForm({ onSubmit })
    const user = userEvent.setup()

    await user.type(screen.getByLabelText('供应商名称'), '联想')
    await user.click(screen.getByRole('button', { name: '保存' }))

    await vi.waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(1)
    })
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ name: '联想' }),
    )
  })

  it('disables button and shows 保存中... while submission is pending', async () => {
    let resolve!: () => void
    const pending = new Promise<void>((res) => {
      resolve = res
    })
    const onSubmit = vi.fn().mockReturnValue(pending)
    renderForm({ onSubmit })
    const user = userEvent.setup()

    await user.type(screen.getByLabelText('供应商名称'), '联想')
    const saveBtn = screen.getByRole('button', { name: '保存' })
    await user.click(saveBtn)

    const pendingText = await screen.findByText('保存中...')
    expect(pendingText).toBeInTheDocument()
    const pendingBtn = pendingText.closest('button')
    expect(pendingBtn).not.toBeNull()
    expect(pendingBtn).toBeDisabled()

    // 收尾
    resolve()
    await pending
  })
})
