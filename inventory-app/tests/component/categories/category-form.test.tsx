import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ConfigProvider, App as AntdApp } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import type { ReactNode } from 'react'
import { CategoryForm } from '@/components/categories/category-form'

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

function renderForm(props: {
  onSubmit: (values: { name: string; description?: string }) => Promise<void>
  initial?: { name?: string; description?: string }
  mode?: 'create' | 'edit'
}) {
  return render(
    <Wrap>
      <CategoryForm
        onSubmit={props.onSubmit}
        {...(props.initial ? { initial: props.initial } : {})}
        {...(props.mode ? { mode: props.mode } : {})}
      />
    </Wrap>,
  )
}

describe('CategoryForm', () => {
  it('shows 分类名称不能为空 when name empty and does not call onSubmit', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    renderForm({ onSubmit })
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: '保存' }))

    expect(await screen.findByText('分类名称不能为空')).toBeInTheDocument()
    const alerts = await screen.findAllByRole('alert')
    expect(alerts.length).toBeGreaterThanOrEqual(1)
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('shows 分类名称长度不能超过50 when name has 51 chars and does not call onSubmit', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    renderForm({ onSubmit })
    const user = userEvent.setup()

    const longName = 'x'.repeat(51)
    await user.type(screen.getByLabelText('分类名称'), longName)
    await user.click(screen.getByRole('button', { name: '保存' }))

    expect(await screen.findByText('分类名称长度不能超过50')).toBeInTheDocument()
    const alerts = await screen.findAllByRole('alert')
    expect(alerts.length).toBeGreaterThanOrEqual(1)
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('shows 描述长度不能超过1000 when description has 1001 chars and does not call onSubmit', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    renderForm({ onSubmit })
    const user = userEvent.setup()

    await user.type(screen.getByLabelText('分类名称'), '电子产品')
    const longDesc = 'd'.repeat(1001)
    // userEvent.type 对 1001 字符过慢；使用 paste
    const desc = screen.getByLabelText('描述')
    await user.click(desc)
    await user.paste(longDesc)
    await user.click(screen.getByRole('button', { name: '保存' }))

    expect(await screen.findByText('描述长度不能超过1000')).toBeInTheDocument()
    const alerts = await screen.findAllByRole('alert')
    expect(alerts.length).toBeGreaterThanOrEqual(1)
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('calls onSubmit with trimmed valid values when input is valid', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    renderForm({ onSubmit })
    const user = userEvent.setup()

    await user.type(screen.getByLabelText('分类名称'), '电子产品')
    await user.click(screen.getByRole('button', { name: '保存' }))

    await vi.waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(1)
    })
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ name: '电子产品' }),
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

    await user.type(screen.getByLabelText('分类名称'), '电子产品')
    const saveBtn = screen.getByRole('button', { name: '保存' })
    await user.click(saveBtn)

    // 等待按钮文案变为 保存中...
    const pendingText = await screen.findByText('保存中...')
    expect(pendingText).toBeInTheDocument()
    const pendingBtn = pendingText.closest('button')
    expect(pendingBtn).not.toBeNull()
    expect(pendingBtn).toBeDisabled()

    // 收尾：让 onSubmit resolve 以避免 act 警告
    resolve()
    await pending
  })
})
