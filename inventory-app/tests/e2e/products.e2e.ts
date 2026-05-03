import { describe, it, expect } from 'vitest'
import { suite, login, resetBackend, countTrpcCalls, selectAntd } from './_setup'

suite('products E2E', ({ newPage }) => {
  describe('happy path', () => {
    it('creates a product and lists it', async () => {
      await resetBackend({
        categories: [{ name: '类别A' }],
        suppliers: [{ name: '供应商A' }],
      })
      const page = await newPage()
      await login(page)

      await page.getByTestId('nav-products').click()
      await page.waitForURL('**/products')
      await page.getByTestId('products-create').click()
      await page.waitForURL('**/products/new')

      await page.getByLabel('编码').fill('E2E001')
      await page.getByLabel('名称').fill('E2E Widget')
      await selectAntd(page, '分类', '类别A')
      await page.getByLabel('进价').fill('10')
      await page.getByLabel('售价').fill('20')
      await page.getByLabel('初始库存').fill('5')
      await page.getByLabel('单位').fill('件')
      await selectAntd(page, '供应商', '供应商A')
      await page.getByLabel('最小库存').fill('1')
      await page.getByLabel('最大库存').fill('100')
      await page.getByRole('button', { name: '保存', exact: true }).click()

      await page.waitForURL('**/products', { timeout: 10_000 })
      await expect
        .poll(async () => await page.getByText('E2E001').count(), { timeout: 5_000 })
        .toBeGreaterThan(0)
      await page.close()
    })
  })

  describe('server error path', () => {
    it('shows 商品编码已存在 on duplicate code', async () => {
      await resetBackend({
        categories: [{ name: '类别A' }],
        suppliers: [{ name: '供应商A' }],
        products: [{
          code: 'DUP001', name: 'Existing',
          categoryName: '类别A', supplierName: '供应商A',
          costPrice: 1, sellPrice: 2, quantity: 0,
          unit: '件', minStock: 1, maxStock: 10,
        }],
      })
      const page = await newPage()
      await login(page)
      await page.goto('/products/new')

      await page.getByLabel('编码').fill('DUP001')
      await page.getByLabel('名称').fill('Other')
      await selectAntd(page, '分类', '类别A')
      await page.getByLabel('进价').fill('1')
      await page.getByLabel('售价').fill('2')
      await page.getByLabel('初始库存').fill('0')
      await page.getByLabel('单位').fill('件')
      await selectAntd(page, '供应商', '供应商A')
      await page.getByLabel('最小库存').fill('1')
      await page.getByLabel('最大库存').fill('10')
      await page.getByRole('button', { name: '保存', exact: true }).click()

      await expect.poll(async () => await page.getByText('商品编码已存在').count()).toBeGreaterThan(0)
      expect(page.url()).toContain('/products/new')
      await page.close()
    })
  })

  describe('client-side validation 0 network calls', () => {
    it('blocks submit when code too short', async () => {
      await resetBackend({
        categories: [{ name: '类别A' }],
        suppliers: [{ name: '供应商A' }],
      })
      const page = await newPage()
      await login(page)
      await page.goto('/products/new')

      const counter = countTrpcCalls(page, 'products.create')
      await page.getByLabel('编码').fill('AB')
      await page.getByLabel('名称').fill('X')
      await page.getByRole('button', { name: '保存', exact: true }).click()
      await expect.poll(async () =>
        await page.getByText('编码必须为3-20位字母数字或短横线').count()
      ).toBeGreaterThan(0)
      await page.waitForTimeout(300)
      expect(counter.value).toBe(0)
      await page.close()
    })
  })
})
