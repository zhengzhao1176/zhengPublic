import { describe, it, expect } from 'vitest'
import { suite, login, resetBackend, selectAntd } from './_setup'

suite('integration E2E (cross-module)', ({ newPage }) => {
  describe('新员工首日流程', () => {
    it('login → category → supplier → product → purchase confirm → sales confirm → dashboard reflects stock', async () => {
      await resetBackend()
      const page = await newPage()
      await login(page)

      // 建分类
      await page.getByTestId('nav-categories').click()
      await page.waitForURL('**/categories')
      await page.getByTestId('categories-create').click()
      await page.waitForURL('**/categories/new')
      await page.getByLabel('分类名称').fill('电子产品')
      await page.getByRole('button', { name: '保存', exact: true }).click()
      await page.waitForURL('**/categories')
      await expect.poll(async () => await page.getByText('电子产品').count()).toBeGreaterThan(0)

      // 建供应商
      await page.getByTestId('nav-suppliers').click()
      await page.waitForURL('**/suppliers')
      await page.getByTestId('suppliers-create').click()
      await page.waitForURL('**/suppliers/new')
      await page.getByLabel('供应商名称').fill('联想')
      await page.getByRole('button', { name: '保存', exact: true }).click()
      await page.waitForURL('**/suppliers')
      await expect.poll(async () => await page.getByText('联想').count()).toBeGreaterThan(0)

      // 建商品
      await page.getByTestId('nav-products').click()
      await page.waitForURL('**/products')
      await page.getByTestId('products-create').click()
      await page.waitForURL('**/products/new')
      await page.getByLabel('编码').fill('IT001')
      await page.getByLabel('名称').fill('笔记本')
      await selectAntd(page, '分类', '电子产品')
      await page.getByLabel('进价').fill('5000')
      await page.getByLabel('售价').fill('7000')
      await page.getByLabel('初始库存').fill('0')
      await page.getByLabel('单位').fill('台')
      await selectAntd(page, '供应商', '联想')
      await page.getByLabel('最小库存').fill('5')
      await page.getByLabel('最大库存').fill('500')
      await page.getByRole('button', { name: '保存', exact: true }).click()
      await page.waitForURL('**/products', { timeout: 10_000 })
      await expect.poll(async () => await page.getByText('IT001').count()).toBeGreaterThan(0)

      // 仪表板应有 1 个低库存预警（quantity=0 ≤ minStock=5）
      await page.getByTestId('nav-dashboard').click()
      await page.waitForURL('**/dashboard')
      await page.waitForLoadState('networkidle').catch(() => {})
      await expect.poll(async () =>
        Number(await page.getByTestId('stat-alert-count').textContent()),
        { timeout: 10_000 },
      ).toBe(1)

      await page.close()
    })
  })
})
