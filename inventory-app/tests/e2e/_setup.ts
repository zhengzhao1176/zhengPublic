import {
  chromium,
  type BrowserContext,
  type Page,
} from 'playwright'
import { afterAll, beforeAll, beforeEach } from 'vitest'

export const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:3001'
export const PROFILE_DIR = process.env.E2E_PROFILE_DIR ?? '.playwright-profile'

let context: BrowserContext | undefined

export function getContext(): BrowserContext {
  if (!context) throw new Error('e2e context not initialized')
  return context
}

export async function setupBrowser(): Promise<BrowserContext> {
  // 等价于: playwright-cli open --headed --persistent
  context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: process.env.CI === 'true',
    baseURL: BASE_URL,
    viewport: { width: 1280, height: 800 },
  })
  return context
}

export async function teardownBrowser() {
  if (context) {
    await context.close()
    context = undefined
  }
}

export type SeedShape = {
  categories?: Array<{ name: string; description?: string }>
  suppliers?: Array<{ name: string; contact?: string; address?: string }>
  products?: Array<{
    code: string
    name: string
    categoryName: string
    supplierName: string
    costPrice: number
    sellPrice: number
    quantity: number
    unit: string
    minStock: number
    maxStock: number
    description?: string
  }>
}

export async function resetBackend(seed?: SeedShape) {
  const r1 = await fetch(`${BASE_URL}/api/test/reset`, { method: 'POST' })
  if (!r1.ok) throw new Error(`reset failed: ${r1.status}`)
  if (seed) {
    const r2 = await fetch(`${BASE_URL}/api/test/seed`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(seed),
    })
    if (!r2.ok) throw new Error(`seed failed: ${r2.status} ${await r2.text()}`)
  }
}

export type Deps = { newPage: () => Promise<Page> }

export function suite(_name: string, fn: (deps: Deps) => void) {
  beforeAll(setupBrowser, 30_000)
  afterAll(teardownBrowser)
  beforeEach(async () => {
    // 默认每个测试自行调用 resetBackend；这里清空 cookies 以避免上一条测试的登录态污染
    if (context) await context.clearCookies()
  })
  fn({
    newPage: async () => {
      const p = await getContext().newPage()
      p.setDefaultTimeout(15_000)
      p.setDefaultNavigationTimeout(20_000)
      return p
    },
  })
}

/** Antd Select 的 label 同时挂在外层 div 和内部 input 上；此 helper 走 combobox role 消歧。
 *  Antd Select 的 dropdown option 用 `.ant-select-item-option` 渲染（虚拟化），
 *  外层 [role="option"] 不可见，因此用 filter(hasText) 而不是 getByRole */
export async function selectAntd(page: Page, label: string, optionText: string) {
  await page.getByRole('combobox', { name: label }).click()
  const opt = page
    .locator('.ant-select-item-option')
    .filter({ hasText: optionText })
    .first()
  await opt.waitFor({ state: 'visible', timeout: 5_000 })
  await opt.click()
}

export async function login(page: Page, username = 'admin', password = 'admin123') {
  await page.goto('/login')
  await page.getByLabel('用户名').fill(username)
  await page.getByLabel('密码').fill(password)
  await page.getByRole('button', { name: /登录/ }).click()
  await page.waitForURL((u) => !u.toString().includes('/login'), { timeout: 8_000 })
}

export function countTrpcCalls(page: Page, procName: string) {
  const counter = { value: 0 }
  page.on('request', (req) => {
    const url = req.url()
    if (url.includes(`/api/trpc/${procName}`) || url.includes(`/api/trpc?batch`) && url.includes(procName)) {
      counter.value += 1
    }
  })
  return counter
}
