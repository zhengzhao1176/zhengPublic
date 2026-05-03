# 06 — Playwright-CLI 浏览器自动化规范

> 唯一权威：本文档定义本项目所有 E2E（浏览器自动化）测试的写法、运行方式、共享 helper、断言策略。
>
> **重要**：本项目 **不引入 `@playwright/test` 测试运行器**。我们使用 `playwright`（Node API） + 自定义 runner（Vitest 调度），与 `playwright-cli`（参考 https://github.com/microsoft/playwright-cli）的"直接驱动浏览器"风格保持一致。
>
> **运行模式**：默认使用 `chromium.launchPersistentContext('./.playwright-profile', { headless: false })`，对应 `playwright-cli open --headed --persistent` 的语义。CI 环境可切换 `headless: true`（见 §8）。

---

## 1. 选型

| 项 | 选择 | 理由 |
|---|---|---|
| 浏览器引擎入口 | `playwright` 包（chromium 默认） | 最贴近 playwright-cli 用法 |
| 测试 runner | `Vitest`（已在栈内）+ `--config vitest.e2e.config.ts` | 复用断言/快照/CI |
| 启动方式 | `chromium.launchPersistentContext(profileDir, { headless: false })` | headed + 持久化 profile = `playwright-cli open --headed --persistent` |
| 选择器 | 优先 `getByLabel` / `getByRole`；表格行/操作按钮用 `getByTestId` | 与 04 文档对齐 |
| 服务端 fixture | `POST /api/test/reset` + `POST /api/test/seed`（仅 NODE_ENV=test） | 避免直接访问 DB |
| 断言库 | Vitest `expect` + Playwright `expect`（用 `expect` from `playwright/test`?——**不**，统一 vitest expect） | 单一来源 |

---

## 2. 启动 Next.js（test 模式）

```bash
# 调度脚本（先启动 server，再跑 e2e）：
NODE_ENV=test PORT=3001 DATABASE_URL=file:./prisma/test-e2e.db pnpm exec next start -p 3001
# （或 dev 模式）
NODE_ENV=test PORT=3001 DATABASE_URL=file:./prisma/test-e2e.db pnpm exec next dev -p 3001
```

Vitest e2e 命令：

```bash
pnpm test:e2e            # 串行跑所有模块
pnpm test:e2e:<m>        # 只跑某模块
```

`package.json` 脚本：

```json
{
  "scripts": {
    "build:test": "NODE_ENV=test next build",
    "dev:test": "NODE_ENV=test next dev -p 3001",
    "start:test": "NODE_ENV=test PORT=3001 next start",
    "test:e2e:setup": "tsx tests/helpers/e2e-setup.ts",
    "test:e2e": "vitest run --config vitest.e2e.config.ts",
    "test:e2e:auth": "vitest run --config vitest.e2e.config.ts tests/e2e/auth.e2e.ts",
    "test:e2e:categories": "vitest run --config vitest.e2e.config.ts tests/e2e/categories.e2e.ts",
    "test:e2e:suppliers": "vitest run --config vitest.e2e.config.ts tests/e2e/suppliers.e2e.ts",
    "test:e2e:products": "vitest run --config vitest.e2e.config.ts tests/e2e/products.e2e.ts",
    "test:e2e:purchase-orders": "vitest run --config vitest.e2e.config.ts tests/e2e/purchase-orders.e2e.ts",
    "test:e2e:sales-orders": "vitest run --config vitest.e2e.config.ts tests/e2e/sales-orders.e2e.ts",
    "test:e2e:stats": "vitest run --config vitest.e2e.config.ts tests/e2e/stats.e2e.ts",
    "test:e2e:integration": "vitest run --config vitest.e2e.config.ts tests/e2e/_integration.e2e.ts"
  }
}
```

---

## 3. 共享 helper（`tests/e2e/_setup.ts`）

```ts
import {
  chromium,
  type Browser,
  type BrowserContext,
  type Page,
  type Route,
} from 'playwright'
import { afterAll, beforeAll, beforeEach, expect } from 'vitest'

export const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:3001'
export const PROFILE_DIR = process.env.E2E_PROFILE_DIR ?? '.playwright-profile'

let context: BrowserContext

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
  if (context) await context.close()
}

export function suite(name: string, fn: (deps: { newPage: () => Promise<Page> }) => void) {
  beforeAll(setupBrowser, 30_000)
  afterAll(teardownBrowser)
  beforeEach(resetBackend)
  fn({
    newPage: async () => {
      const p = await getContext().newPage()
      p.setDefaultTimeout(8_000)
      return p
    },
  })
}

export async function resetBackend(seed?: SeedShape) {
  await fetch(`${BASE_URL}/api/test/reset`, { method: 'POST' })
  if (seed) {
    const r = await fetch(`${BASE_URL}/api/test/seed`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(seed),
    })
    if (!r.ok) throw new Error(`seed failed: ${r.status} ${await r.text()}`)
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

export async function login(page: Page, username = 'admin', password = 'admin123') {
  await page.goto('/login')
  await page.getByLabel('用户名').fill(username)
  await page.getByLabel('密码').fill(password)
  await page.getByRole('button', { name: /登录/ }).click()
  await page.waitForURL((u) => !u.toString().includes('/login'))
}

export async function expectVisible(page: Page, text: string, opts: { timeout?: number } = {}) {
  await expect.poll(
    async () => await page.getByText(text).count(),
    { timeout: opts.timeout ?? 5_000 },
  ).toBeGreaterThan(0)
}

/**
 * 监听某 tRPC procedure 的网络调用次数。
 * 例：const c = countTrpcCalls(page, 'products.create'); … expect(c.value).toBe(0)
 */
export function countTrpcCalls(page: Page, procName: string) {
  const counter = { value: 0 }
  page.on('request', (req) => {
    if (req.url().includes(`/api/trpc/${procName}`)) counter.value += 1
  })
  return counter
}
```

> 关键：persistent context **会跨测试保留 cookies/localStorage**。每个测试**第一步**调用 `resetBackend(...)` 重置 DB；**登录态**仍保留（admin token cookie），所以从第二条测试开始可跳过登录。

---

## 4. 测试文件骨架（`tests/e2e/<m>.e2e.ts`）

每个文件**第一组测试**都登录一次，后续测试假定 admin 已登录。

```ts
// tests/e2e/products.e2e.ts
import { describe, it, expect } from 'vitest'
import { suite, login, resetBackend, countTrpcCalls } from './_setup'

suite('products E2E', ({ newPage }) => {
  describe('happy path', () => {
    it('logs in then sees dashboard', async () => {
      await resetBackend({
        categories: [{ name: '类别A' }],
        suppliers: [{ name: '供应商A' }],
      })
      const page = await newPage()
      await login(page)
      expect(page.url()).toContain('/dashboard')
      await page.close()
    })

    it('creates a product via /products/new and sees it in the list', async () => {
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
      await page.getByLabel('分类').click()
      await page.getByRole('option', { name: '类别A' }).click()
      await page.getByLabel('进价').fill('10')
      await page.getByLabel('售价').fill('20')
      await page.getByLabel('初始库存').fill('5')
      await page.getByLabel('单位').fill('件')
      await page.getByLabel('供应商').click()
      await page.getByRole('option', { name: '供应商A' }).click()
      await page.getByLabel('最小库存').fill('1')
      await page.getByLabel('最大库存').fill('100')
      await page.getByRole('button', { name: '保存' }).click()

      await page.waitForURL('**/products')
      await expect.poll(async () => await page.getByText('E2E001').count()).toBeGreaterThan(0)
      await page.close()
    })
  })

  describe('server error path', () => {
    it('shows 商品编码已存在 when creating duplicate code', async () => {
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
      await page.getByLabel('分类').click()
      await page.getByRole('option', { name: '类别A' }).click()
      await page.getByLabel('进价').fill('1')
      await page.getByLabel('售价').fill('2')
      await page.getByLabel('初始库存').fill('0')
      await page.getByLabel('单位').fill('件')
      await page.getByLabel('供应商').click()
      await page.getByRole('option', { name: '供应商A' }).click()
      await page.getByLabel('最小库存').fill('1')
      await page.getByLabel('最大库存').fill('10')
      await page.getByRole('button', { name: '保存' }).click()

      await expect.poll(async () =>
        await page.getByText('商品编码已存在').count()
      ).toBeGreaterThan(0)
      expect(page.url()).toContain('/products/new')
      await page.close()
    })
  })

  describe('client-side validation makes 0 network calls', () => {
    it('blocks submit before any /api/trpc/products.create request', async () => {
      const page = await newPage()
      await login(page)
      await page.goto('/products/new')

      const counter = countTrpcCalls(page, 'products.create')
      await page.getByLabel('编码').fill('AB')   // too short
      await page.getByLabel('名称').fill('X')
      await page.getByRole('button', { name: '保存' }).click()
      // 可见错误说明客户端 Zod 已 trip
      await expect.poll(async () =>
        await page.getByText('编码必须为3-20位字母数字或短横线').count()
      ).toBeGreaterThan(0)
      // 略等到 mutation 可能发出（不应发）
      await page.waitForTimeout(300)
      expect(counter.value).toBe(0)
      await page.close()
    })
  })
})
```

> 注意：上面 `login` 通过持久化 cookie 实现"只登录一次后续复用"。**第二条测试不再调 login**——但保险起见，每个 spec 文件第一条 it 仍调用一次以容忍 reset 后空 cookie 情况。具体见各 spec 文档（`specs/<m>.md`）的 §5。

---

## 5. Vitest e2e config

`vitest.e2e.config.ts`：

```ts
import { defineConfig } from 'vitest/config'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  test: {
    include: ['tests/e2e/**/*.e2e.ts'],
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 30_000,
    teardownTimeout: 10_000,
    sequence: { shuffle: false, concurrent: false },
    reporters: ['default'],
  },
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
})
```

> 关键：单进程串行，避免多个 PersistentContext 抢同一 profile 目录。

---

## 6. 选择器规约（必读）

| 用例 | 选择器 |
|---|---|
| 表单字段 | `page.getByLabel('编码')` |
| 提交按钮 | `page.getByRole('button', { name: '保存' })` |
| Antd Select 触发 | `page.getByLabel('分类').click()` 然后 `page.getByRole('option', { name: '类别A' }).click()` |
| 错误文案 | `page.getByRole('alert', { hasText: '...' })` 或 `page.getByText('...')` |
| toast 文本 | `page.getByText('创建成功')`（antd message 默认带 `role="alert"`） |
| 表格行 | `page.getByTestId('row-12')` |
| 行内编辑/删除按钮 | `page.getByTestId('row-12-edit')` |
| 弹窗确认 | `page.getByTestId('modal-confirm')` |
| 侧栏导航 | `page.getByTestId('nav-products')` |
| 工具栏新增 | `page.getByTestId('products-create')` |
| 搜索框 | `page.getByTestId('products-search')` |
| 分页 | `page.getByTestId('pagination-next')` 等 |

> **不允许**：`page.locator('css=...')`、`page.click('button.ant-btn')`、`page.locator('.ant-table-row >> nth=0')`。
> **允许例外**：图表的存在性，可用 `page.locator('canvas')` 或 `page.locator('[data-testid=stat-trend-chart]')`（推荐后者，由 frontend-impl 提供）。

---

## 7. Reset / Seed 用法手册

`/api/test/reset` 清空全部业务数据，并重新写入 admin 用户。
`/api/test/seed` 接受以下载荷（来自 `02-数据库与Schema.md` §5）：

```jsonc
{
  "categories": [{ "name": "类别A", "description": "可选" }],
  "suppliers": [{ "name": "供应商A", "contact": "可选", "address": "可选" }],
  "products": [{
    "code": "DEMO001",
    "name": "示例",
    "categoryName": "类别A",        // 通过 name 引用
    "supplierName": "供应商A",
    "costPrice": 10, "sellPrice": 20,
    "quantity": 100, "unit": "件",
    "minStock": 10, "maxStock": 1000,
    "description": "可选"
  }]
}
```

> **不允许**直接 import `@/server/db` 在测试里写数据（破坏边界、绕开 reset）。

---

## 8. CI vs 本地差异

| 环境 | headless | profile 目录 | 浏览器 |
|---|---|---|---|
| 本地（`CI` 未设置） | `false`（headed） | `.playwright-profile/` | chromium |
| CI（`CI=true`） | `true` | `.tmp-playwright-profile/` | chromium |

CI 启动序列（见 `07-质量门禁与流水线.md` §4）：

```bash
pnpm install
pnpm playwright install chromium
pnpm prisma db push --skip-generate
pnpm db:seed
pnpm build:test
pnpm start:test &              # 后台
sleep 5
pnpm test:e2e
```

---

## 9. 调试技巧（仅当本地手动调试）

playwright-cli 风格的命令清单（不在自动化用，但 agent 可在 `tools` allowlist 里加上以便手动复现）：

```bash
# 直接打开 inspector（与项目网页交互式）
pnpm exec playwright open --browser=chromium http://localhost:3001/login

# 录制 codegen
pnpm exec playwright codegen --browser=chromium http://localhost:3001/products/new

# 截屏调试
pnpm exec playwright screenshot --browser=chromium http://localhost:3001/dashboard /tmp/dash.png
```

> 这些命令**仅供 e2e-test-agent 临时调试**用，**不进入** CI 流程，也**不**在自动化测试中调用。

---

## 10. 反模式（必避免）

| 反模式 | 为什么坏 |
|---|---|
| 在 e2e 中直接 import `@/server/db` 写数据 | 破坏边界、跳过 reset、隐藏 schema 不一致 |
| 使用 CSS 选择器（`.ant-btn-primary`） | UI 重构即坏 |
| 用 `page.waitForTimeout(N)` 当唯一等待 | flake；用 `expect.poll` 或 `waitForURL` |
| 同文件 `it.concurrent` | 共享 profile / DB，会互相污染 |
| 不调 `await page.close()` | profile 句柄泄漏 |
| 测试间共享变量（如 `let createdId`） | 顺序依赖；必须每条测试自含 reset+seed |
| 在 e2e 中读取 `src/components/` 来"知道" testid | 越界；testid 来自 `00-技术约束.md` §8 与 `04-前端规范.md` §5 |

---

## 11. e2e-test-agent 验收清单

- [ ] 文件位置：`tests/e2e/<m>.e2e.ts`
- [ ] 使用 `_setup.ts` 的 `suite()` + `login()` + `resetBackend()`
- [ ] 至少 1 条 happy path（包括 visible 断言）
- [ ] 至少 1 条服务端错误路径（spec §2 列出的错误码之一，至少一种）
- [ ] 至少 1 条客户端校验"零网络调用"断言（`countTrpcCalls`）
- [ ] 选择器仅用 `getByLabel` / `getByRole` / `getByTestId`
- [ ] `pnpm test:e2e:<m>` 在 spec & impl 都到位时全绿
- [ ] 无 import 来自 `src/components/<m>/**` 或 `src/server/routers/<m>.ts`
- [ ] 无 `it.concurrent`、无 CSS selector、无写死 sleep
