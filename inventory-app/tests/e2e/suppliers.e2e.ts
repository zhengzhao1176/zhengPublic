import { describe, it, expect } from 'vitest'
import { suite, login, resetBackend, countTrpcCalls } from './_setup'

suite('suppliers E2E', ({ newPage }) => {
  describe('happy path', () => {
    it('creates a supplier and lists it (5.1)', async () => {
      await resetBackend()
      const page = await newPage()
      await login(page)

      await page.getByTestId('nav-suppliers').click()
      await page.waitForURL('**/suppliers')
      await page.getByTestId('suppliers-create').click()
      await page.waitForURL('**/suppliers/new')

      await page.getByLabel('供应商名称').fill('联想')
      await page.getByLabel('联系电话').fill('10086')
      await page.getByLabel('地址').fill('北京市')
      await page.getByRole('button', { name: '保存', exact: true }).click()

      await page.waitForURL('**/suppliers', { timeout: 10_000 })
      await expect
        .poll(async () => await page.getByText('联想').count(), { timeout: 5_000 })
        .toBeGreaterThan(0)
      await expect
        .poll(async () => await page.getByText('创建成功').count(), { timeout: 5_000 })
        .toBeGreaterThan(0)
      await page.close()
    })
  })

  describe('server error path', () => {
    it('shows 供应商名称已存在 on duplicate name (5.2)', async () => {
      await resetBackend({ suppliers: [{ name: '联想' }] })
      const page = await newPage()
      await login(page)
      await page.goto('/suppliers/new')

      await page.getByLabel('供应商名称').fill('联想')
      await page.getByRole('button', { name: '保存', exact: true }).click()

      await expect
        .poll(async () => await page.getByText('供应商名称已存在').count(), { timeout: 5_000 })
        .toBeGreaterThan(0)
      expect(page.url()).toContain('/suppliers/new')
      await page.close()
    })
  })

  describe('client-side validation 0 network calls', () => {
    it('blocks submit when name empty (5.3)', async () => {
      await resetBackend()
      const page = await newPage()
      await login(page)
      await page.goto('/suppliers/new')

      const counter = countTrpcCalls(page, 'suppliers.create')
      await page.getByRole('button', { name: '保存', exact: true }).click()
      await expect
        .poll(async () => await page.getByText('供应商名称不能为空').count(), { timeout: 5_000 })
        .toBeGreaterThan(0)
      await page.waitForTimeout(300)
      expect(counter.value).toBe(0)
      await page.close()
    })
  })

  describe('delete with product reference', () => {
    it('shows 该供应商被商品或订单引用，不能删除 when products exist (5.4)', async () => {
      await resetBackend({
        suppliers: [{ name: 'S1' }],
        categories: [{ name: 'C1' }],
        products: [{
          code: 'P1',
          name: 'X',
          categoryName: 'C1',
          supplierName: 'S1',
          costPrice: 1,
          sellPrice: 2,
          quantity: 0,
          unit: '件',
          minStock: 1,
          maxStock: 10,
        }],
      })
      const page = await newPage()
      await login(page)
      await page.goto('/suppliers')

      await expect
        .poll(async () => await page.getByText('S1').count(), { timeout: 5_000 })
        .toBeGreaterThan(0)

      // 解析行 id
      let supplierId: number | null = null
      const rowHandles = await page.locator('[data-testid^="row-"]').all()
      for (const h of rowHandles) {
        const tid = await h.getAttribute('data-testid')
        const m = tid && /^row-(\d+)$/.exec(tid)
        if (m && m[1]) {
          const text = await h.textContent()
          if (text && text.includes('S1')) {
            supplierId = Number(m[1])
            break
          }
        }
      }
      expect(supplierId).not.toBeNull()

      await page.getByTestId(`row-${supplierId}-delete`).click()
      await page.getByTestId('modal-confirm').click()

      await expect
        .poll(async () => await page.getByText('该供应商被商品或订单引用，不能删除').count(), { timeout: 5_000 })
        .toBeGreaterThan(0)
      await page.close()
    })
  })

  describe('delete empty supplier', () => {
    it('removes the row and shows 删除成功 (5.5)', async () => {
      await resetBackend({ suppliers: [{ name: 'S1' }] })
      const page = await newPage()
      await login(page)
      await page.goto('/suppliers')

      await expect
        .poll(async () => await page.getByText('S1').count(), { timeout: 5_000 })
        .toBeGreaterThan(0)

      let supplierId: number | null = null
      const rowHandles = await page.locator('[data-testid^="row-"]').all()
      for (const h of rowHandles) {
        const tid = await h.getAttribute('data-testid')
        const m = tid && /^row-(\d+)$/.exec(tid)
        if (m && m[1]) {
          const text = await h.textContent()
          if (text && text.includes('S1')) {
            supplierId = Number(m[1])
            break
          }
        }
      }
      expect(supplierId).not.toBeNull()

      await page.getByTestId(`row-${supplierId}-delete`).click()
      await page.getByTestId('modal-confirm').click()

      await expect
        .poll(async () => await page.getByText('删除成功').count(), { timeout: 5_000 })
        .toBeGreaterThan(0)
      await expect
        .poll(async () => await page.getByText('S1').count(), { timeout: 5_000 })
        .toBe(0)
      await page.close()
    })
  })
})
