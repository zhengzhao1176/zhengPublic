import { describe, it, expect } from 'vitest'
import { suite, login, resetBackend, countTrpcCalls } from './_setup'

suite('categories E2E', ({ newPage }) => {
  describe('happy path', () => {
    it('creates a category and lists it (5.1)', async () => {
      await resetBackend()
      const page = await newPage()
      await login(page)

      await page.getByTestId('nav-categories').click()
      await page.waitForURL('**/categories')
      await page.getByTestId('categories-create').click()
      await page.waitForURL('**/categories/new')

      await page.getByLabel('分类名称').fill('电子产品')
      await page.getByLabel('描述').fill('')
      await page.getByRole('button', { name: '保存', exact: true }).click()

      await page.waitForURL('**/categories', { timeout: 10_000 })
      await expect
        .poll(async () => await page.getByText('电子产品').count(), { timeout: 5_000 })
        .toBeGreaterThan(0)
      await expect
        .poll(async () => await page.getByText('创建成功').count(), { timeout: 5_000 })
        .toBeGreaterThan(0)
      await page.close()
    })
  })

  describe('server error path', () => {
    it('shows 分类名称已存在 on duplicate name (5.2)', async () => {
      await resetBackend({ categories: [{ name: '电子产品' }] })
      const page = await newPage()
      await login(page)
      await page.goto('/categories/new')

      await page.getByLabel('分类名称').fill('电子产品')
      await page.getByRole('button', { name: '保存', exact: true }).click()

      await expect
        .poll(async () => await page.getByText('分类名称已存在').count(), { timeout: 5_000 })
        .toBeGreaterThan(0)
      expect(page.url()).toContain('/categories/new')
      await page.close()
    })
  })

  describe('client-side validation 0 network calls', () => {
    it('blocks submit when name empty (5.3)', async () => {
      await resetBackend()
      const page = await newPage()
      await login(page)
      await page.goto('/categories/new')

      const counter = countTrpcCalls(page, 'categories.create')
      await page.getByRole('button', { name: '保存', exact: true }).click()
      await expect
        .poll(async () => await page.getByText('分类名称不能为空').count(), { timeout: 5_000 })
        .toBeGreaterThan(0)
      await page.waitForTimeout(300)
      expect(counter.value).toBe(0)
      await page.close()
    })
  })

  describe('delete with product reference', () => {
    it('shows 该分类下还有商品，不能删除 when products exist (5.4)', async () => {
      await resetBackend({
        categories: [{ name: '电子产品' }],
        suppliers: [{ name: 'S1' }],
        products: [{
          code: 'P1',
          name: 'X',
          categoryName: '电子产品',
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
      await page.goto('/categories')

      // 等待列表加载，找到电子产品所在行的 id
      await expect
        .poll(async () => await page.getByText('电子产品').count(), { timeout: 5_000 })
        .toBeGreaterThan(0)

      // 通过 API 拿到 id（避免依赖 DOM 内部实现）
      const r = await fetch('http://localhost:3001/api/test/categories-by-name?name=' + encodeURIComponent('电子产品')).catch(() => null)
      let categoryId: number | null = null
      if (r && r.ok) {
        const j = await r.json().catch(() => null)
        categoryId = j?.id ?? null
      }
      // 如果 test-only 端点不存在，则解析行 testid
      if (categoryId == null) {
        const rowHandles = await page.locator('[data-testid^="row-"]').all()
        for (const h of rowHandles) {
          const tid = await h.getAttribute('data-testid')
          const m = tid && /^row-(\d+)$/.exec(tid)
          if (m && m[1]) {
            const text = await h.textContent()
            if (text && text.includes('电子产品')) {
              categoryId = Number(m[1])
              break
            }
          }
        }
      }
      expect(categoryId).not.toBeNull()

      await page.getByTestId(`row-${categoryId}-delete`).click()
      await page.getByTestId('modal-confirm').click()

      await expect
        .poll(async () => await page.getByText('该分类下还有商品，不能删除').count(), { timeout: 5_000 })
        .toBeGreaterThan(0)
      await page.close()
    })
  })

  describe('delete empty category', () => {
    it('removes the row and shows 删除成功 (5.5)', async () => {
      await resetBackend({ categories: [{ name: '空分类' }] })
      const page = await newPage()
      await login(page)
      await page.goto('/categories')

      await expect
        .poll(async () => await page.getByText('空分类').count(), { timeout: 5_000 })
        .toBeGreaterThan(0)

      // 解析行 id
      let categoryId: number | null = null
      const rowHandles = await page.locator('[data-testid^="row-"]').all()
      for (const h of rowHandles) {
        const tid = await h.getAttribute('data-testid')
        const m = tid && /^row-(\d+)$/.exec(tid)
        if (m && m[1]) {
          const text = await h.textContent()
          if (text && text.includes('空分类')) {
            categoryId = Number(m[1])
            break
          }
        }
      }
      expect(categoryId).not.toBeNull()

      await page.getByTestId(`row-${categoryId}-delete`).click()
      await page.getByTestId('modal-confirm').click()

      await expect
        .poll(async () => await page.getByText('删除成功').count(), { timeout: 5_000 })
        .toBeGreaterThan(0)
      await expect
        .poll(async () => await page.getByText('空分类').count(), { timeout: 5_000 })
        .toBe(0)
      await page.close()
    })
  })
})
