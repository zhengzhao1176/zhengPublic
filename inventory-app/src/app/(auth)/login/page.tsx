'use client'
import { useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Form, Input, Button, Alert, App as AntdApp } from 'antd'
import { z } from 'zod'
import { trpc } from '@/lib/trpc-client'
import { translateError } from '@/lib/format'

const schema = z.object({
  username: z.string().trim().min(1, '请输入用户名'),
  password: z.string().min(1, '请输入密码'),
})

function LoginInner() {
  const router = useRouter()
  const sp = useSearchParams()
  const redirect = sp?.get('redirect') ?? '/dashboard'
  const safeRedirect = redirect.startsWith('/') ? redirect : '/dashboard'
  const { message } = AntdApp.useApp()
  const utils = trpc.useUtils()
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [serverError, setServerError] = useState<string | null>(null)

  const login = trpc.auth.login.useMutation({
    onSuccess: async () => {
      message.success('登录成功')
      await utils.auth.me.reset()
      router.replace(safeRedirect)
    },
    onError: (e) => {
      setServerError(translateError(e.message))
    },
  })

  function onSubmit(raw: { username?: string; password?: string }) {
    setErrors({})
    setServerError(null)
    const parsed = schema.safeParse({
      username: raw.username ?? '',
      password: raw.password ?? '',
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
    login.mutate(parsed.data)
  }

  return (
    <div style={{ maxWidth: 360, margin: '80px auto', padding: 24, background: '#fff', borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.08)' }}>
      <h2 style={{ textAlign: 'center', marginBottom: 24 }}>库存管理系统</h2>
      {serverError && (
        <Alert role="alert" type="error" showIcon message={serverError} style={{ marginBottom: 16 }} />
      )}
      <Form layout="vertical" onFinish={onSubmit} aria-label="登录表单">
        <Form.Item label="用户名" name="username">
          <Input aria-label="用户名" autoComplete="username" />
        </Form.Item>
        {errors.username && <p role="alert" style={{ color: '#ff4d4f', marginTop: -16 }}>{errors.username}</p>}
        <Form.Item label="密码" name="password">
          <Input.Password aria-label="密码" autoComplete="current-password" />
        </Form.Item>
        {errors.password && <p role="alert" style={{ color: '#ff4d4f', marginTop: -16 }}>{errors.password}</p>}
        <Button
          type="primary"
          htmlType="submit"
          block
          loading={login.isPending}
          disabled={login.isPending}
        >
          {login.isPending ? '登录中...' : '登录'}
        </Button>
      </Form>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginInner />
    </Suspense>
  )
}
