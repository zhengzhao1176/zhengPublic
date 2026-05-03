import { describe, it, expect } from 'vitest'
import type { Page } from 'playwright'
import { suite, login, resetBackend, countTrpcCalls, selectAntd } from './_setup'

const baseSeed = {
  categories: [{ name: 'C1' }],
  suppliers: [{ name: 'S1' }],
  products: [
    {
      code: 'P1',
      name: 'X',
      categoryName: 'C1',
      supplierName: 'S1',
      costPrice: 10,
      sellPrice: 20,
      quantity: 0,
      unit: '件',
      minStock: 1,
      maxStock: 1000,
    },
  ],
}

/** 通过 tRPC HTTP 端点直接创建一张 DRAFT 进货单（绕开 UI 日期组件实现细节） */
async function createDraftViaApi(
  page: Page,
  input: {
    productId: number
    quantity: number
    costPrice: number
    supplierId: number
    purchaser: string
    purchaseDate: string
  },
): Promise<{ status: number; body: string }> {
  return page.evaluate(async (i) => {
    const r = await fetch('/api/trpc/purchaseOrders.create?batch=1', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ '0': { json: i } }),
    })
    const text = await r.text()
    return { status: r.status, body: text }
  }, input)
}

async function findFirstRowId(page: Page): Promise<number | null> {
  // Wait for the list query to populate after a reload/navigation
  await page.waitForLoadState('networkidle').catch(() => {})
  for (let attempt = 0; attempt < 20; attempt++) {
    const handles = await page.locator('[data-testid^="row-"]').all()
    for (const h of handles) {
      const tid = await h.getAttribute('data-testid')
      const m = tid && /^row-(\d+)$/.exec(tid)
      if (m && m[1]) return Number(m[1])
    }
    await page.waitForTimeout(250)
  }
  return null
}

suite('purchase-orders E2E', ({ newPage }) => {
  describe('happy path — 创建 (5.1)', () => {
    it('creates a DRAFT purchase order and shows it in the list', async () => {
      await resetBackend(baseSeed)
      const page = await newPage()
      await login(page)

      await page.getByTestId('nav-purchase-orders').click()
      await page.waitForURL('**/purchase-orders', { timeout: 15_000 })
      await page.waitForLoadState('networkidle').catch(() => {})
      await page.getByTestId('purchase-orders-create').click()
      await page.waitForURL('**/purchase-orders/new', { timeout: 15_000 })

      await selectAntd(page, '商品', 'P1 - X')
      await page.getByLabel('进货数量').fill('100')
      // costPrice 自动填充自商品（=10）
      const costInput = page.getByLabel('进货单价')
      await expect
        .poll(async () => (await costInput.inputValue()).includes('10'), { timeout: 5_000 })
        .toBe(true)
      await selectAntd(page, '供应商', 'S1')
      await page.getByLabel('进货员').fill('张三')

      await page.getByRole('button', { name: '保存', exact: true }).click()

      await page.waitForURL('**/purchase-orders', { timeout: 10_000 })
      await expect
        .poll(async () => await page.getByText(/RH\d{12}/).count(), { timeout: 5_000 })
        .toBeGreaterThan(0)
      await expect
        .poll(async () => await page.getByText('草稿').count(), { timeout: 5_000 })
        .toBeGreaterThan(0)
      await expect
        .poll(async () => await page.getByText('创建成功').count(), { timeout: 5_000 })
        .toBeGreaterThan(0)
      await page.close()
    })
  })

  describe('happy path — 确认 (5.2)', () => {
    it('confirms a DRAFT order and updates product stock to 100', async () => {
      await resetBackend(baseSeed)
      const page = await newPage()
      await login(page)

      // 通过 API 直接 seed 一张 DRAFT 单
      await page.goto('/purchase-orders')
      const r = await createDraftViaApi(page, {
        productId: 1,
        quantity: 100,
        costPrice: 10,
        supplierId: 1,
        purchaser: '张三',
        purchaseDate: new Date().toISOString(),
      })
      expect(r.status).toBe(200)

      await page.reload()
      await expect
        .poll(async () => await page.getByText(/RH\d{12}/).count(), { timeout: 5_000 })
        .toBeGreaterThan(0)

      const orderId = await findFirstRowId(page)
      expect(orderId).not.toBeNull()

      await page.getByTestId(`row-${orderId}-confirm`).click()
      await page.getByTestId('modal-confirm').click()

      await expect
        .poll(async () => await page.getByText('确认成功，库存已更新').count(), { timeout: 5_000 })
        .toBeGreaterThan(0)

      // 切到 /products 验证 P1 库存 = 100
      await page.getByTestId('nav-products').click()
      await page.waitForURL('**/products')
      await expect
        .poll(async () => await page.getByText('P1').count(), { timeout: 5_000 })
        .toBeGreaterThan(0)
      const pageText = await page.locator('body').textContent()
      expect(pageText).toContain('100')
      await page.close()
    })
  })

  describe('server error — 超过最大库存 (5.3)', () => {
    it('shows 进货后将超过最大库存容量', async () => {
      await resetBackend({
        categories: [{ name: 'C1' }],
        suppliers: [{ name: 'S1' }],
        products: [
          {
            code: 'P1',
            name: 'X',
            categoryName: 'C1',
            supplierName: 'S1',
            costPrice: 10,
            sellPrice: 20,
            quantity: 950,
            unit: '件',
            minStock: 1,
            maxStock: 1000,
          },
        ],
      })
      const page = await newPage()
      await login(page)

      await page.goto('/purchase-orders')
      const r = await createDraftViaApi(page, {
        productId: 1,
        quantity: 100,
        costPrice: 10,
        supplierId: 1,
        purchaser: '张三',
        purchaseDate: new Date().toISOString(),
      })
      expect(r.status).toBe(200)
      await page.reload()

      const orderId = await findFirstRowId(page)
      expect(orderId).not.toBeNull()

      await page.getByTestId(`row-${orderId}-confirm`).click()
      await page.getByTestId('modal-confirm').click()

      await expect
        .poll(async () => await page.getByText('进货后将超过最大库存容量').count(), { timeout: 5_000 })
        .toBeGreaterThan(0)
      await page.close()
    })
  })

  describe('client-side validation 0 network calls (5.5)', () => {
    it('blocks submit when 进货数量=0 (purchaseOrders.create not called)', async () => {
      await resetBackend(baseSeed)
      const page = await newPage()
      await login(page)
      await page.goto('/purchase-orders/new')

      const counter = countTrpcCalls(page, 'purchaseOrders.create')

      await selectAntd(page, '商品', 'P1 - X')
      await page.getByLabel('进货数量').fill('0')
      await selectAntd(page, '供应商', 'S1')
      await page.getByLabel('进货员').fill('张三')
      await page.getByRole('button', { name: '保存', exact: true }).click()

      await expect
        .poll(async () => await page.getByText('进货数量必须为正整数').count(), { timeout: 5_000 })
        .toBeGreaterThan(0)
      await page.waitForTimeout(300)
      expect(counter.value).toBe(0)
      await page.close()
    })
  })

  describe('编辑 — 仅 DRAFT 可编辑 (5.6)', () => {
    it('CONFIRMED 单访问 /edit 跳转到详情页', async () => {
      await resetBackend(baseSeed)
      const page = await newPage()
      await login(page)

      await page.goto('/purchase-orders')
      const r = await createDraftViaApi(page, {
        productId: 1,
        quantity: 5,
        costPrice: 10,
        supplierId: 1,
        purchaser: '张三',
        purchaseDate: new Date().toISOString(),
      })
      expect(r.status).toBe(200)
      await page.reload()

      const orderId = await findFirstRowId(page)
      expect(orderId).not.toBeNull()

      // 确认它（变为 CONFIRMED）
      await page.getByTestId(`row-${orderId}-confirm`).click()
      await page.getByTestId('modal-confirm').click()
      await expect
        .poll(async () => await page.getByText('确认成功，库存已更新').count(), { timeout: 5_000 })
        .toBeGreaterThan(0)

      // 访问 /edit → 应跳详情
      await page.goto(`/purchase-orders/${orderId}/edit`)
      await page.waitForURL((u) => {
        const s = u.toString()
        return s.includes(`/purchase-orders/${orderId}`) && !s.endsWith('/edit')
      }, { timeout: 5_000 })
      expect(page.url()).toMatch(new RegExp(`/purchase-orders/${orderId}(?:[?#]|$)`))
      // 详情页应显示 已确认
      await expect
        .poll(async () => await page.getByText('已确认').count(), { timeout: 5_000 })
        .toBeGreaterThan(0)
      await page.close()
    })
  })

  describe('单号生成（同日序列）(5.8)', () => {
    it('同日 3 张单 → 列表降序末位 0003 / 0002 / 0001', async () => {
      await resetBackend(baseSeed)
      const page = await newPage()
      await login(page)
      await page.goto('/purchase-orders')

      const sameDateIso = '2026-05-02T10:00:00.000Z'

      for (let i = 0; i < 3; i++) {
        const r = await createDraftViaApi(page, {
          productId: 1,
          quantity: 1,
          costPrice: 10,
          supplierId: 1,
          purchaser: '张三',
          purchaseDate: sameDateIso,
        })
        expect(r.status).toBe(200)
      }

      await page.reload()
      await expect
        .poll(async () => await page.getByText(/RH\d{12}/).count(), { timeout: 5_000 })
        .toBeGreaterThanOrEqual(3)

      const orderNos = await page.evaluate(() => {
        const all = Array.from(document.body.textContent?.match(/RH\d{12}/g) ?? [])
        const seen = new Set<string>()
        const uniq: string[] = []
        for (const s of all) {
          if (!seen.has(s)) {
            seen.add(s)
            uniq.push(s)
          }
        }
        return uniq.slice(0, 3)
      })
      expect(orderNos.length).toBe(3)
      const rowOrderNos = orderNos
      expect(rowOrderNos[0]).toMatch(/0003$/)
      expect(rowOrderNos[1]).toMatch(/0002$/)
      expect(rowOrderNos[2]).toMatch(/0001$/)
      await page.close()
    })
  })
})
