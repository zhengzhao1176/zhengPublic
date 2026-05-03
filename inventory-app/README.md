# Inventory App

A web-based inventory management system built per the spec at `/Users/apple/Desktop/t3/server/`.

**Stack**: Next.js 15 (App Router) + tRPC v11 + Prisma + SQLite + TypeScript + Antd + Vitest + Playwright (CLI-style E2E).

## Quick start (克隆即用 — DB 已预 seed 入库)

```bash
# 1. install
pnpm install

# 2. 生成 prisma client 类型（不动 DB；prisma/dev.db 仓库自带）
pnpm prisma generate

# 3. dev server
pnpm dev
# open http://localhost:3000 → /login (admin / admin123)
```

### 想从空库重建？

```bash
pnpm db:reset                # drop → push → seed（重置 dev.db）
```

### 想清空 test 库（E2E 用）？

```bash
DATABASE_URL=file:./test-e2e.db pnpm prisma db push --skip-generate --force-reset
DATABASE_URL=file:./test-e2e.db NODE_ENV=test pnpm db:seed
```

## E2E (browser automation, playwright-cli style)

The 35 E2E tests drive Chromium via `chromium.launchPersistentContext('./.playwright-profile', { headless: false })` — programmatically equivalent to `playwright-cli open --headed --persistent`. By default they run **headed**（你能看到 Chrome 窗口实际操作页面）；CI 环境通过 `CI=true` 切换为 headless。

```bash
# 一次性安装 chromium 二进制（仅首次）
pnpm exec playwright install chromium

# Terminal 1: start the test-mode server (用 INV_TEST_API=1 旁路 next dev 强制 NODE_ENV=development 的限制)
DATABASE_URL=file:./test-e2e.db pnpm prisma db push --skip-generate
pnpm dev:test                       # = INV_TEST_API=1 PORT=3001 next dev -p 3001

# Terminal 2 — 三种跑法（任选其一）：

# 1) 全自动 — 35 条 headed 测试，浏览器窗口可见（默认）
pnpm test:e2e

# 2) 全自动 — headless，CI 模式
CI=true pnpm test:e2e

# 3) 手动 — 直接打开浏览器到登录页（playwright-cli open --headed --persistent 等价）
pnpm e2e:open                       # = playwright open --browser=chromium --user-data-dir=./.playwright-profile http://localhost:3001/login

# 4) 录制新交互生成代码（playwright codegen）
pnpm e2e:codegen
```

按模块跑（每条都是真实 Chromium）：

```bash
pnpm test:e2e:auth                  # 5 tests
pnpm test:e2e:categories            # 5 tests
pnpm test:e2e:suppliers             # 5 tests
pnpm test:e2e:products              # 3 tests
pnpm test:e2e:purchase-orders       # 6 tests
pnpm test:e2e:sales-orders          # 5 tests
pnpm test:e2e:stats                 # 5 tests (1 故意 skip — Antd RangePicker UI 不可达)
pnpm test:e2e:integration           # 1 test (跨模块 happy flow)
```

E2E 的运行时由 `tests/e2e/_setup.ts` 提供：`suite()` / `login(page)` / `resetBackend(seed)` / `selectAntd(page, label, optionText)` / `countTrpcCalls(page, 'router.proc')`。每条测试默认 `await context.clearCookies()`，必须自行 `await resetBackend(...)` seed 干净状态。

## Backend tests

```bash
pnpm test:unit            # all unit tests
pnpm test:property        # all property tests (fast-check)
pnpm test:component       # all component tests (jsdom + Testing Library)

# per-module
pnpm test:auth
pnpm test:products
pnpm test:purchase-orders
# ...
```

## Quality gates

```bash
pnpm test:coverage     # branch ≥ 80% (configurable in vitest.config.ts)
pnpm test:mutation     # Stryker variant kill rate
```

## Reset everything

```bash
pnpm db:reset
```

## Default credentials

`admin` / `admin123` (seeded; do NOT use in prod).

## Module map

| Module | Backend | Frontend | Tests |
|---|---|---|---|
| auth | `src/server/routers/auth.ts` | `src/app/(auth)/login` | `tests/unit/auth/`, `tests/e2e/auth.e2e.ts` |
| categories | `src/server/routers/categories.ts` | `src/app/(app)/categories/`, `src/components/categories/` | `tests/unit/categories/` |
| suppliers | `src/server/routers/suppliers.ts` | `src/app/(app)/suppliers/`, `src/components/suppliers/` | (similar) |
| products | `src/server/routers/products.ts` | `src/app/(app)/products/`, `src/components/products/` | `tests/{unit,property}/products/`, `tests/e2e/products.e2e.ts` |
| purchase-orders | `src/server/routers/purchase-orders.ts` | `src/app/(app)/purchase-orders/`, `src/components/purchase-orders/` | `tests/unit/purchase-orders/` |
| sales-orders | `src/server/routers/sales-orders.ts` | `src/app/(app)/sales-orders/`, `src/components/sales-orders/` | `tests/unit/sales-orders/` |
| stats | `src/server/routers/stats.ts` | `src/app/(app)/dashboard`, `src/app/(app)/stats/` | (smoke via integration) |

## Environment

`.env.example` lists all variables; copy to `.env.local` for dev.

## Spec source

The full development & testing spec lives at `/Users/apple/Desktop/t3/server/`. Each module has a frozen `specs/<m>.md` document — that's the contract the backend / frontend / e2e-test agents work against in isolation.
