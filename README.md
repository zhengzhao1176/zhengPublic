# 库存管理系统 — 文档驱动 × 多 Subagent 并行交付

> 一个完整的全栈库存管理系统，从业务需求 → 技术 spec → 26 个 subagent 并行实现 → 4 层金字塔测试 + 真浏览器 E2E 全绿。
>
> 整个系统由「人写 spec / agent 不审 src」的信任契约驱动：人类只审 BRD + spec + tests（小、慢变化），机器跑全绿即视为 src 正确。

---

## 仓库定位

```
t3/
├── README.md                            ← 你正在读
├── 库存管理系统-业务需求文档.md           ← BRD（业务唯一来源；spec-agent 的输入）
├── AI开发测试框架.md                    ← 测试理念活理论（4 道防线 + 4 层金字塔 + 双门禁）
│
├── server/                              ← 18 份技术文档（subagent 调度的总入口）
│   ├── README.md
│   ├── 00-技术约束.md                   ← 全局冻结量（版本/端口/账号/单号/错误码字面量/UI 文案/testid）
│   ├── 01-架构与Agent分工.md            ← 7 模块 × 3 角色 + 5 全局 = 26 agent 矩阵
│   ├── 02-数据库与Schema.md             ← Prisma + SQLite + 测试 reset/seed API
│   ├── 03-tRPC契约.md                   ← 全部 procedure 的 input/output/error/precondition
│   ├── 04-前端规范.md                   ← 路由表、表单字段、testid 目录、错误展示约定
│   ├── 05-测试架构.md                   ← unit/property/component/e2e 4 层 + 覆盖率/变异门禁
│   ├── 06-Playwright-CLI规范.md         ← 浏览器自动化的精确写法
│   ├── 07-质量门禁与流水线.md           ← 命令矩阵 + CI 模板 + ship-module 流程
│   ├── 08-Agent详细定义.md              ← 每个 agent 的 prompt + 读写边界 + 自检清单
│   └── specs/                           ← 7 模块 spec（test-agent 的唯一输入）
│       ├── _template.md
│       ├── auth.md / categories.md / suppliers.md / products.md
│       ├── purchase-orders.md / sales-orders.md / inventory-stats.md
│
├── demo/                                ← 活样本切片（products 模块的 spec + 4 层测试 + 实现）
│
└── inventory-app/                       ← 实际可运行的代码 + 测试（被 subagent 实现）
    ├── README.md                        ← 跑测/跑 E2E/跑 dev 的命令清单
    ├── prisma/schema.prisma + seed.ts
    ├── src/
    │   ├── app/                         ← Next.js 15 App Router
    │   ├── server/                      ← tRPC v11 + Prisma + JWT cookie
    │   ├── components/                  ← Antd 5 表单 + 共享组件
    │   └── lib/                         ← 工具（auth/format/order-no/trpc-client）
    └── tests/
        ├── unit/                        ← Vitest + 真 SQLite + tRPC createCaller — 75 tests
        ├── property/                    ← fast-check（30 random runs/property） — 17 tests
        ├── component/                   ← Testing Library + userEvent — 44 tests + 1 故意 skip
        └── e2e/                         ← chromium.launchPersistentContext (=playwright-cli 风格) — 34 tests + 1 故意 skip
```

---

## 技术栈（全部锁版）

```
前端           Next.js 15 (App Router) + React 18 + Antd 5 + dayjs
后端           tRPC v11 + Zod + bcryptjs + jsonwebtoken
数据库         Prisma 5 + SQLite（本地文件）
状态管理       @tanstack/react-query 5
单元/属性/组件 Vitest 2 + fast-check 3 + Testing Library 16 + jsdom
浏览器自动化   playwright 1.46（Node API；不引入 @playwright/test）
变异测试       Stryker 8（mutator-typescript + vitest-runner）
其它           TypeScript 5.4 strict / pnpm 9 / Node 20.12.2
```

---

## 一句话上手（克隆即用）

仓库带了**预先初始化好的 SQLite 数据库**（`inventory-app/prisma/dev.db` + `inventory-app/test-e2e.db`），admin 账号与演示数据已 seed，下载即用：

```bash
git clone https://github.com/zhengzhao1176/zhengPublic.git t3
cd t3/inventory-app
pnpm install
pnpm prisma generate         # 仅生成 @prisma/client 类型，不动 DB
pnpm dev                     # http://localhost:3000 → /login
                             # admin / admin123
```

如果想从空库重建：`pnpm db:reset`（drop → push → seed）。

完整跑测命令见 `inventory-app/README.md`。

---

## Agent 协作模型

```
[BRD]
  ↓
spec-agent      → server/specs/<m>.md
  ↓
schema-agent    → inventory-app/prisma/* + 共享底座 + 配置
  ↓
trpc-contract-agent → routers 骨架（Zod input + NOT_IMPLEMENTED throw）
  ↓
每模块并行（× 7）：
  <m>-e2e-test  → tests/{unit,property,component,e2e}/<m>/   ← 严禁读 src/<m>/
                  （冻结测试 → git tag tests-frozen-<m>）
  ↓
  <m>-backend-impl  + <m>-frontend-impl  → src/<m>/         ← 严禁写 tests/<m>/
                  （循环：写 → 跑测试 → 改 → 全绿）
  ↓
mutation-agent  → Stryker 验收变异 kill ≥ 95%
  ↓
integration-agent → tests/e2e/_integration.e2e.ts（跨模块）
```

26 个 agent 之间**仅通过文件系统**协作；hooks 由 `inventory-app/.claude/settings.json` 强制执行读写边界（spec 见 `server/08-Agent详细定义.md`）。

---

## 测试结果（已 commit 时的状态）

| 层 | 通过 | 备注 |
|---|---|---|
| `pnpm tsc --noEmit` | 0 errors | strict + noUncheckedIndexedAccess |
| `pnpm test:unit` | **75 / 75** | auth, categories, suppliers, products, purchase-orders, sales-orders, stats |
| `pnpm test:property` | **17 / 17** | products, purchase-orders, sales-orders；30 random runs/property |
| `pnpm test:component` | **44 + 1 skip** | 全部表单 + 字段错误文案断言 + 提交中状态 + onSubmit 调用断言 |
| `pnpm test:e2e` | **34 + 1 skip** | 真 Chromium headed + persistent profile；7 模块 + 1 跨模块 |

唯一两条 skip 都有注释解释（`stats.e2e 5.6` UI 不可达；`stats/component` 占位）。

---

## 重现实跑

```bash
# Terminal 1
cd inventory-app
pnpm install
pnpm prisma generate
pnpm exec playwright install chromium

DATABASE_URL=file:./test-e2e.db pnpm prisma db push --skip-generate
pnpm dev:test                 # = INV_TEST_API=1 PORT=3001 next dev -p 3001

# Terminal 2
pnpm tsc --noEmit             # 0 errors
pnpm test:unit                # 75
pnpm test:property            # 17
pnpm test:component           # 44 + 1 skip

# headed 模式（playwright-cli 等价）
pnpm test:e2e                 # 真 Chromium 35 次开窗

# headless（CI 模式）
CI=true pnpm test:e2e

# 手动打开浏览器（playwright-cli open --headed --persistent 字面等价）
pnpm e2e:open
```

---

## 关键设计决定

- **`/api/test/{reset,seed}`** 用 `INV_TEST_API=1` 环境变量门禁（不能用 `NODE_ENV=test` 因为 `next dev` 强制覆盖为 `development`）
- **SQLite autoincrement** 在 `/api/test/reset` 末尾 `DELETE FROM sqlite_sequence` 重置，让测试可以可靠预测 ID = 1
- **Antd `Modal.confirm` 静态 API** 在 React 18 + AppRouter 下不渲染 → 改用 `App.useApp().modal.confirm(...)` 钩子绑定（`makeConfirmDelete`/`makeConfirmAction`）
- **Antd 在 CJK 字符间自动加空格** 破坏按钮可读名 → `<ConfigProvider button={{ autoInsertSpace: false }}>`
- **Antd Select `aria-label` 同时挂在外层 div + 内部 input** → 测试 helper `selectAntd(page, label, optionText)` 用 `combobox` role + `.ant-select-item-option`
- **React Query 缓存压住 dashboard alert** → 商品 mutation 后 `utils.stats.invalidate()`
- **Next 15 `<Link>` 不再允许 `<a>` 子元素** → `data-testid` 直接挂 `<Link>`

详见 `inventory-app/issues/`（已解决项目中遇到的真实 bug 记录）。

---

## License

私人项目，未指定 license（默认 All Rights Reserved）。如需复用请联系作者。
