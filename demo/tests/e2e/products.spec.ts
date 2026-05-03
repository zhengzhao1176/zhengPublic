import { test, expect } from '@playwright/test'

// Test environment exposes /api/test/reset and /api/test/seed for fixtures.

test.beforeEach(async ({ request }) => {
  await request.post('/api/test/reset')
  await request.post('/api/test/seed', {
    data: {
      categories: [{ name: '类别A' }],
      suppliers: [{ name: '供应商A' }],
    },
  })
})

async function fillForm(page: import('@playwright/test').Page, code: string) {
  await page.getByLabel('编码').fill(code)
  await page.getByLabel('名称').fill('E2E Widget')
  await page.getByLabel('分类').selectOption({ label: '类别A' })
  await page.getByLabel('进价').fill('10')
  await page.getByLabel('售价').fill('20')
  await page.getByLabel('初始库存').fill('5')
  await page.getByLabel('单位').fill('pcs')
  await page.getByLabel('供应商').selectOption({ label: '供应商A' })
  await page.getByLabel('最小库存').fill('1')
  await page.getByLabel('最大库存').fill('100')
}

test('user creates a product and sees it in the list', async ({ page }) => {
  await page.goto('/products/new')
  await fillForm(page, 'E2E001')
  await page.getByRole('button', { name: '保存' }).click()

  await expect(page).toHaveURL('/products')
  await expect(page.getByText('E2E001')).toBeVisible()
})

test('duplicate code shows server error and stays on form page', async ({ page }) => {
  // first create succeeds
  await page.goto('/products/new')
  await fillForm(page, 'DUP001')
  await page.getByRole('button', { name: '保存' }).click()
  await expect(page).toHaveURL('/products')

  // second create with same code: error displayed, URL unchanged
  await page.goto('/products/new')
  await fillForm(page, 'DUP001')
  await page.getByRole('button', { name: '保存' }).click()
  await expect(page).toHaveURL('/products/new')
  await expect(page.getByRole('alert')).toContainText(/已存在|重复|CODE_EXISTS/)
})

test('client-side validation blocks submit before any network call', async ({ page }) => {
  let calls = 0
  await page.route('**/api/trpc/products.create**', (route) => {
    calls++
    route.continue()
  })
  await page.goto('/products/new')
  await page.getByLabel('编码').fill('AB') // too short
  await page.getByLabel('名称').fill('X')
  await page.getByRole('button', { name: '保存' }).click()
  await expect(
    page.getByText('编码必须为3-20位字母数字或短横线'),
  ).toBeVisible()
  expect(calls).toBe(0)
})
