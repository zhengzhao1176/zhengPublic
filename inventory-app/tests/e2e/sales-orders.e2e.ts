import { describe, it, expect } from 'vitest'
import { suite, login, resetBackend, countTrpcCalls, selectAntd } from './_setup'

suite('sales-orders E2E', ({ newPage }) => {
  describe('5.1 happy path — 创建 + 确认 → 库存递减', () => {
    it('creates DRAFT order, confirms it, product.quantity decrements', async () => {
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
            quantity: 50,
            unit: '件',
            minStock: 1,
            maxStock: 1000,
          },
        ],
      })
      const page = await newPage()
      await login(page)

      await page.getByTestId('nav-sales-orders').click()
      await page.waitForURL('**/sales-orders')
      await page.getByTestId('sales-orders-create').click()
      await page.waitForURL('**/sales-orders/new')

      // 选择商品（label 含 `（库存 50）` 后缀，使用部分匹配）
      await selectAntd(page, '商品', 'P1 - X')
      await page.getByLabel('出货数量').fill('10')
      // 出货单价默认应自动填 20，无需修改
      await page.getByLabel('客户').fill('王五')
      await page.getByLabel('出货员').fill('李四')
      await page.getByRole('button', { name: '保存', exact: true }).click()

      // 提交后跳回列表
      await page.waitForURL('**/sales-orders', { timeout: 10_000 })

      // 列表应能看到 1 张 DRAFT 单（含 `草稿` 状态）
      await expect
        .poll(async () => await page.getByText('草稿').count(), { timeout: 5_000 })
        .toBeGreaterThan(0)

      // 找到该行的 id，再点 row-<id>-confirm
      let orderId: number | null = null
      const rowHandles = await page.locator('[data-testid^="row-"]').all()
      for (const h of rowHandles) {
        const tid = await h.getAttribute('data-testid')
        const m = tid && /^row-(\d+)$/.exec(tid)
        if (m && m[1]) {
          orderId = Number(m[1])
          break
        }
      }
      expect(orderId).not.toBeNull()

      await page.getByTestId(`row-${orderId}-confirm`).click()
      // 二次确认弹窗
      await page.getByTestId('modal-confirm').click()

      // 等待 toast `确认成功，库存已更新`
      await expect
        .poll(async () => await page.getByText('确认成功，库存已更新').count(), { timeout: 5_000 })
        .toBeGreaterThan(0)

      // 进入 /products 验证库存 = 40
      await page.getByTestId('nav-products').click()
      await page.waitForURL('**/products')
      await expect
        .poll(async () => await page.getByText('40').count(), { timeout: 5_000 })
        .toBeGreaterThan(0)

      await page.close()
    })
  })

  describe('5.2 server error path — 库存不足', () => {
    it('confirm with quantity > stock shows 库存不足，无法出货', async () => {
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
            quantity: 5,
            unit: '件',
            minStock: 1,
            maxStock: 1000,
          },
        ],
      })
      const page = await newPage()
      await login(page)

      // 先创建一张 quantity=10 的 DRAFT 单（10 > 5 → 确认时报 INSUFFICIENT_STOCK）
      await page.goto('/sales-orders/new')
      await selectAntd(page, '商品', 'P1 - X')
      await page.getByLabel('出货数量').fill('10')
      await page.getByLabel('客户').fill('王五')
      await page.getByLabel('出货员').fill('李四')
      await page.getByRole('button', { name: '保存', exact: true }).click()
      await page.waitForURL('**/sales-orders', { timeout: 10_000 })

      // 取行 id
      await expect
        .poll(async () => await page.getByText('草稿').count(), { timeout: 5_000 })
        .toBeGreaterThan(0)
      let orderId: number | null = null
      const rowHandles = await page.locator('[data-testid^="row-"]').all()
      for (const h of rowHandles) {
        const tid = await h.getAttribute('data-testid')
        const m = tid && /^row-(\d+)$/.exec(tid)
        if (m && m[1]) {
          orderId = Number(m[1])
          break
        }
      }
      expect(orderId).not.toBeNull()

      await page.getByTestId(`row-${orderId}-confirm`).click()
      await page.getByTestId('modal-confirm').click()

      // 期望出现 `库存不足，无法出货` 文案
      await expect
        .poll(async () => await page.getByText('库存不足，无法出货').count(), { timeout: 5_000 })
        .toBeGreaterThan(0)

      // 列表应仍显示 草稿（未变 已确认）
      await expect
        .poll(async () => await page.getByText('草稿').count(), { timeout: 3_000 })
        .toBeGreaterThan(0)

      await page.close()
    })
  })

  describe('5.3 client-side validation 0 network calls', () => {
    it('blocks submit when 出货数量=0 — counter == 0', async () => {
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
            quantity: 50,
            unit: '件',
            minStock: 1,
            maxStock: 1000,
          },
        ],
      })
      const page = await newPage()
      await login(page)
      await page.goto('/sales-orders/new')

      const counter = countTrpcCalls(page, 'salesOrders.create')

      // 选择商品（必须先选才能让客户校验进入 quantity 检查）
      await selectAntd(page, '商品', 'P1 - X')
      await page.getByLabel('出货数量').fill('0')
      await page.getByLabel('客户').fill('王五')
      await page.getByLabel('出货员').fill('李四')
      await page.getByRole('button', { name: '保存', exact: true }).click()

      // 期望出现 出货数量必须为正整数 错误
      await expect
        .poll(async () => await page.getByText('出货数量必须为正整数').count(), { timeout: 5_000 })
        .toBeGreaterThan(0)

      // 等一段时间确保不会有迟到的 mutation 请求
      await page.waitForTimeout(300)
      expect(counter.value).toBe(0)

      await page.close()
    })
  })

  describe('5.5 CONFIRMED 单 UI 只读', () => {
    it('CONFIRMED row only shows 查看，no 编辑/删除/确认', async () => {
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
            quantity: 50,
            unit: '件',
            minStock: 1,
            maxStock: 1000,
          },
        ],
      })
      const page = await newPage()
      await login(page)

      // 通过 UI 创建一张 DRAFT 单 → 立即确认它使其变为 CONFIRMED
      await page.goto('/sales-orders/new')
      await selectAntd(page, '商品', 'P1 - X')
      await page.getByLabel('出货数量').fill('5')
      await page.getByLabel('客户').fill('王五')
      await page.getByLabel('出货员').fill('李四')
      await page.getByRole('button', { name: '保存', exact: true }).click()
      await page.waitForURL('**/sales-orders', { timeout: 10_000 })
      await page.waitForLoadState('networkidle').catch(() => {})

      // 取出 id 并 confirm（等待行渲染）
      let orderId: number | null = null
      for (let i = 0; i < 20 && orderId === null; i++) {
        const rowHandles = await page.locator('[data-testid^="row-"]').all()
        for (const h of rowHandles) {
          const tid = await h.getAttribute('data-testid')
          const m = tid && /^row-(\d+)$/.exec(tid)
          if (m && m[1]) {
            orderId = Number(m[1])
            break
          }
        }
        if (orderId === null) await page.waitForTimeout(250)
      }
      expect(orderId).not.toBeNull()

      await page.getByTestId(`row-${orderId}-confirm`).click()
      await page.getByTestId('modal-confirm').click()

      // 等待 toast，确认状态翻转
      await expect
        .poll(async () => await page.getByText('确认成功，库存已更新').count(), { timeout: 5_000 })
        .toBeGreaterThan(0)
      await expect
        .poll(async () => await page.getByText('已确认').count(), { timeout: 5_000 })
        .toBeGreaterThan(0)

      // 此时该行应仅 `查看`，无 编辑/删除/确认
      await expect
        .poll(async () => await page.getByTestId(`row-${orderId}-view`).count())
        .toBeGreaterThan(0)
      await expect
        .poll(async () => await page.getByTestId(`row-${orderId}-edit`).count())
        .toBe(0)
      await expect
        .poll(async () => await page.getByTestId(`row-${orderId}-delete`).count())
        .toBe(0)
      await expect
        .poll(async () => await page.getByTestId(`row-${orderId}-confirm`).count())
        .toBe(0)

      await page.close()
    })
  })

  describe('5.6 CH 前缀 + 同日序列', () => {
    it('connects 3 same-day orders → tail 4 digits 0001/0002/0003', async () => {
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
            quantity: 50,
            unit: '件',
            minStock: 1,
            maxStock: 1000,
          },
        ],
      })
      const page = await newPage()
      await login(page)

      // 默认 salesDate 是今天；连续创建 3 张
      for (let i = 0; i < 3; i++) {
        await page.goto('/sales-orders/new')
        await selectAntd(page, '商品', 'P1 - X')
        await page.getByLabel('出货数量').fill('1')
        await page.getByLabel('客户').fill('客户' + (i + 1))
        await page.getByLabel('出货员').fill('李四')
        await page.getByRole('button', { name: '保存', exact: true }).click()
        await page.waitForURL('**/sales-orders', { timeout: 10_000 })
      }

      // 列表应展示 3 张 DRAFT，单号格式 CH<YYYYMMDD><0001..0003>
      await expect
        .poll(async () => await page.getByText(/CH\d{8}0001/).count(), { timeout: 5_000 })
        .toBeGreaterThan(0)
      await expect
        .poll(async () => await page.getByText(/CH\d{8}0002/).count())
        .toBeGreaterThan(0)
      await expect
        .poll(async () => await page.getByText(/CH\d{8}0003/).count())
        .toBeGreaterThan(0)

      // 三个单号应共享同一日期段（前 10 位 `CH` + `YYYYMMDD`）
      const html = await page.content()
      const matches = html.match(/CH\d{8}\d{4}/g) ?? []
      const datePart = (s: string) => s.slice(2, 10)
      const tails = matches.map((s) => Number(s.slice(-4))).sort((a, b) => a - b)
      const dates = new Set(matches.map(datePart))
      expect(dates.size).toBe(1)
      expect(tails.includes(1)).toBe(true)
      expect(tails.includes(2)).toBe(true)
      expect(tails.includes(3)).toBe(true)

      await page.close()
    })
  })
})
