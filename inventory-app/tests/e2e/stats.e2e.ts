import { describe, it, expect } from 'vitest'
import { suite, login, resetBackend, countTrpcCalls, selectAntd } from './_setup'

suite('stats E2E', ({ newPage }) => {
  describe('5.1 Dashboard 显示零', () => {
    it('shows zeros on /dashboard when DB is empty', async () => {
      await resetBackend()
      const page = await newPage()
      await login(page)
      // login lands at /dashboard by default
      await page.waitForURL('**/dashboard', { timeout: 10_000 })

      await expect
        .poll(
          async () =>
            (await page.getByTestId('stat-total-products').textContent()) ?? '',
          { timeout: 5_000 },
        )
        .toContain('0')
      await expect
        .poll(
          async () =>
            (await page.getByTestId('stat-total-value').textContent()) ?? '',
          { timeout: 5_000 },
        )
        .toContain('¥0.00')
      await expect
        .poll(
          async () =>
            (await page.getByTestId('stat-alert-count').textContent()) ?? '',
          { timeout: 5_000 },
        )
        .toContain('0')
      await page.close()
    })
  })

  describe('5.2 Dashboard 显示真实数', () => {
    it('aggregates totals and alerts after seeding 2 products (one low-stock)', async () => {
      await resetBackend({
        categories: [{ name: '类别A' }],
        suppliers: [{ name: '供应商A' }],
        products: [
          {
            code: 'P1',
            name: 'Product One',
            categoryName: '类别A',
            supplierName: '供应商A',
            costPrice: 10,
            sellPrice: 20,
            quantity: 100,
            unit: '件',
            minStock: 10,
            maxStock: 1000,
          },
          {
            code: 'P2',
            name: 'Product Two',
            categoryName: '类别A',
            supplierName: '供应商A',
            costPrice: 2,
            sellPrice: 5,
            quantity: 5,
            unit: '件',
            minStock: 10,
            maxStock: 1000,
          },
        ],
      })
      const page = await newPage()
      await login(page)
      await page.waitForURL('**/dashboard', { timeout: 10_000 })

      await expect
        .poll(
          async () =>
            (await page.getByTestId('stat-total-products').textContent()) ?? '',
          { timeout: 5_000 },
        )
        .toContain('2')
      await expect
        .poll(
          async () =>
            (await page.getByTestId('stat-total-quantity').textContent()) ?? '',
          { timeout: 5_000 },
        )
        .toContain('105')
      await expect
        .poll(
          async () =>
            (await page.getByTestId('stat-total-value').textContent()) ?? '',
          { timeout: 5_000 },
        )
        .toContain('¥1010.00')
      await expect
        .poll(
          async () =>
            (await page.getByTestId('stat-alert-count').textContent()) ?? '',
          { timeout: 5_000 },
        )
        .toContain('1')
      await page.close()
    })
  })

  describe('5.3 Alerts 表格只显示 P2', () => {
    it('lists only the low-stock product on /stats/alerts', async () => {
      await resetBackend({
        categories: [{ name: '类别A' }],
        suppliers: [{ name: '供应商A' }],
        products: [
          {
            code: 'P1',
            name: 'Product One',
            categoryName: '类别A',
            supplierName: '供应商A',
            costPrice: 10,
            sellPrice: 20,
            quantity: 100,
            unit: '件',
            minStock: 10,
            maxStock: 1000,
          },
          {
            code: 'P2',
            name: 'Product Two',
            categoryName: '类别A',
            supplierName: '供应商A',
            costPrice: 2,
            sellPrice: 5,
            quantity: 5,
            unit: '件',
            minStock: 10,
            maxStock: 1000,
          },
        ],
      })
      const page = await newPage()
      await login(page)
      await page.goto('/stats/alerts')

      await expect
        .poll(async () => await page.getByText('P2').count(), { timeout: 5_000 })
        .toBeGreaterThan(0)
      await expect
        .poll(async () => await page.getByText('低库存').count(), {
          timeout: 5_000,
        })
        .toBeGreaterThan(0)
      // P1 应当不出现在预警表里
      await expect
        .poll(async () => await page.getByText('Product One').count(), {
          timeout: 1_500,
        })
        .toBe(0)
      await page.close()
    })
  })

  describe('5.5 Report 导出 Excel', () => {
    it('clicking 导出 triggers a download with inventory-report-YYYYMMDD.xlsx filename', async () => {
      await resetBackend({
        categories: [{ name: '类别A' }],
        suppliers: [{ name: '供应商A' }],
        products: [
          {
            code: 'RP1',
            name: 'ReportProd',
            categoryName: '类别A',
            supplierName: '供应商A',
            costPrice: 1,
            sellPrice: 2,
            quantity: 10,
            unit: '件',
            minStock: 1,
            maxStock: 100,
          },
        ],
      })
      const page = await newPage()
      await login(page)
      await page.goto('/stats/report')

      const downloadPromise = page.waitForEvent('download', { timeout: 10_000 })
      await page.getByTestId('report-export').click()
      const dl = await downloadPromise
      expect(dl.suggestedFilename()).toMatch(
        /^inventory-report-\d{8}\.xlsx$/,
      )
      await page.close()
    })
  })

  describe('5.6 Trends 客户端校验：dateFrom > dateTo 不发起请求', () => {
    // Antd RangePicker 内部禁止 from > to 的选择，UI 不可达；服务端 Zod refine 由 tests/unit/stats 覆盖。
    it.skip('blocks query and makes 0 calls to stats.trend when range invalid', async () => {
      await resetBackend({
        categories: [{ name: '类别A' }],
        suppliers: [{ name: '供应商A' }],
        products: [
          {
            code: 'TP1',
            name: 'TrendProd',
            categoryName: '类别A',
            supplierName: '供应商A',
            costPrice: 1,
            sellPrice: 2,
            quantity: 10,
            unit: '件',
            minStock: 1,
            maxStock: 100,
          },
        ],
      })
      const page = await newPage()
      await login(page)
      await page.goto('/stats/trends')

      const counter = countTrpcCalls(page, 'stats.trend')

      // 选择商品（按 spec 商品下拉支持搜索 by code/name）
      await selectAntd(page, '商品', 'TP1')

      // 设置 dateFrom = 2026-05-10, dateTo = 2026-05-01（dateFrom > dateTo）
      // 通过键盘输入避开 antd RangePicker 的复杂交互。
      const fromInput = page.getByLabel('起始日期')
      await fromInput.click()
      await fromInput.fill('2026-05-10')
      await page.keyboard.press('Tab')

      const toInput = page.getByLabel('结束日期')
      await toInput.click()
      await toInput.fill('2026-05-01')
      await page.keyboard.press('Tab')

      await page.getByRole('button', { name: '查询', exact: true }).click()

      // 期待出现字段级 alert（具体文案由前端给出，这里仅断言 counter == 0）
      await page.waitForTimeout(500)
      expect(counter.value).toBe(0)
      await page.close()
    })
  })
})
