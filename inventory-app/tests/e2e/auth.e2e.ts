import { describe, it, expect } from 'vitest'
import { suite, login, resetBackend, countTrpcCalls } from './_setup'

suite('auth E2E', ({ newPage }) => {
  describe('happy path', () => {
    it('logs in admin → reaches /dashboard', async () => {
      await resetBackend()
      const page = await newPage()
      await login(page)
      expect(page.url()).toContain('/dashboard')
      await expect.poll(async () => await page.getByText('admin').count(), { timeout: 5000 }).toBeGreaterThan(0)
      await page.close()
    })
  })

  describe('server error path', () => {
    it('shows 用户名或密码错误 with bad credentials', async () => {
      await resetBackend()
      const page = await newPage()
      await page.goto('/login')
      await page.getByLabel('用户名').fill('admin')
      await page.getByLabel('密码').fill('wrong')
      await page.getByRole('button', { name: /登录/ }).click()
      await expect.poll(async () => await page.getByText('用户名或密码错误').count()).toBeGreaterThan(0)
      expect(page.url()).toContain('/login')
      await page.close()
    })
  })

  describe('client-side validation 0 network calls', () => {
    it('blocks submit with empty fields', async () => {
      await resetBackend()
      const page = await newPage()
      await page.goto('/login')
      const counter = countTrpcCalls(page, 'auth.login')
      await page.getByRole('button', { name: /登录/ }).click()
      await expect.poll(async () => await page.getByText('请输入用户名').count()).toBeGreaterThan(0)
      await page.waitForTimeout(300)
      expect(counter.value).toBe(0)
      await page.close()
    })
  })

  describe('unauthenticated → login redirect', () => {
    it('visiting /products without cookie redirects to /login?redirect=/products', async () => {
      await resetBackend()
      const page = await newPage()
      await page.goto('/products')
      await page.waitForURL(/\/login/, { timeout: 5_000 })
      expect(page.url()).toContain('/login')
      expect(page.url()).toContain('redirect=%2Fproducts')
      await page.close()
    })
  })

  describe('logout', () => {
    it('clicking 退出登录 returns to /login', async () => {
      await resetBackend()
      const page = await newPage()
      await login(page)
      await page.getByTestId('header-logout').click()
      await page.waitForURL(/\/login/, { timeout: 5_000 })
      await expect.poll(async () => await page.getByText('已退出登录').count()).toBeGreaterThan(0)
      await page.close()
    })
  })
})
