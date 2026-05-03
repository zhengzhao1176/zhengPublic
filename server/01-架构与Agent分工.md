# 01 — 架构与 Agent 分工

> 本文回答两个问题：(a) 系统由哪些**模块**构成、它们如何在仓库中落地；(b) 哪些**agent**负责哪部分、彼此的边界如何由工具/hook 强制。
>
> 读者必读前置：`00-技术约束.md`。

---

## 1. 系统模块清单

按 BRD 拆分为以下 **7 个业务模块** + **1 个基础设施模块**。每个模块独立可测、独立可交付，是 agent 调度的最小单位。

| # | 模块 ID | 中文名 | 主要职责 | 路由前缀 | 依赖（read-only） |
|---|---|---|---|---|---|
| M0 | `auth` | 认证 | admin 登录、JWT 颁发与校验、登出 | `/login` | — |
| M1 | `categories` | 分类管理 | 分类 CRUD | `/categories` | M0 |
| M2 | `suppliers` | 供应商管理 | 供应商 CRUD | `/suppliers` | M0 |
| M3 | `products` | 商品管理 | 商品 CRUD、批量删除、列表搜索/筛选/分页 | `/products` | M0, M1, M2 |
| M4 | `purchase-orders` | 进货管理 | 进货单 CRUD + 确认（增加库存） | `/purchase-orders` | M0, M2, M3 |
| M5 | `sales-orders` | 出货管理 | 出货单 CRUD + 确认（减少库存） | `/sales-orders` | M0, M3 |
| M6 | `inventory-stats` | 库存统计 | 仪表板、库存预警、库存趋势、报表导出 | `/dashboard`, `/stats/*` | M3, M4, M5（read-only via tRPC） |

> "依赖" 仅意味着 **该模块的 tRPC procedure 与/或前端页面会通过公开契约调用其它模块**，不意味着 import 实现代码。跨模块 import 仍受 `00-技术约束.md` §13 限制。

---

## 2. 仓库目录布局（按模块切片）

```
inventory-app/
├── prisma/
│   ├── schema.prisma                # 由 schema-agent 维护
│   └── seed.ts                      # 由 schema-agent 维护
│
├── src/
│   ├── app/
│   │   ├── layout.tsx               # 根 layout（HTML 骨架 + Provider）
│   │   ├── (auth)/
│   │   │   └── login/
│   │   │       └── page.tsx         # ← M0 frontend-impl
│   │   ├── (app)/
│   │   │   ├── layout.tsx           # 主布局（侧栏 + 顶栏） — shared
│   │   │   ├── dashboard/page.tsx   # ← M6
│   │   │   ├── products/...         # ← M3
│   │   │   ├── categories/...       # ← M1
│   │   │   ├── suppliers/...        # ← M2
│   │   │   ├── purchase-orders/...  # ← M4
│   │   │   ├── sales-orders/...     # ← M5
│   │   │   └── stats/...            # ← M6
│   │   └── api/
│   │       ├── trpc/[trpc]/route.ts # tRPC handler（共享，由 trpc-contract-agent 创建）
│   │       └── test/
│   │           ├── reset/route.ts   # 测试用（schema-agent 创建）
│   │           └── seed/route.ts    # 测试用（schema-agent 创建）
│   │
│   ├── server/
│   │   ├── db.ts                    # Prisma 实例（共享）
│   │   ├── context.ts               # tRPC context（共享）
│   │   ├── trpc.ts                  # tRPC base + middleware（共享）
│   │   └── routers/
│   │       ├── _app.ts              # 由 trpc-contract-agent 维护
│   │       ├── auth.ts              # ← M0 backend-impl
│   │       ├── categories.ts        # ← M1
│   │       ├── suppliers.ts         # ← M2
│   │       ├── products.ts          # ← M3
│   │       ├── purchase-orders.ts   # ← M4
│   │       ├── sales-orders.ts      # ← M5
│   │       └── stats.ts             # ← M6
│   │
│   ├── components/
│   │   ├── layout/                  # 共享：侧栏、顶栏、面包屑
│   │   ├── shared/                  # 共享：Confirm、EmptyState、Loading 等
│   │   ├── auth/                    # ← M0
│   │   ├── categories/              # ← M1
│   │   ├── suppliers/               # ← M2
│   │   ├── products/                # ← M3
│   │   ├── purchase-orders/         # ← M4
│   │   ├── sales-orders/            # ← M5
│   │   └── stats/                   # ← M6
│   │
│   ├── lib/
│   │   ├── trpc-client.ts           # 共享
│   │   ├── auth.ts                  # 共享：JWT 工具
│   │   ├── format.ts                # 共享：金额/日期格式化
│   │   └── order-no.ts              # 共享：单号生成（M4/M5 都用）
│   │
│   └── types/                       # 共享类型（仅类型，无运行时）
│
├── tests/
│   ├── unit/
│   │   ├── auth/                    # ← M0 e2e-test-agent (unit 子集)
│   │   ├── categories/
│   │   ├── ...
│   ├── property/
│   │   ├── products/
│   │   ├── purchase-orders/
│   │   └── sales-orders/            # 跨库存不变量在此
│   ├── component/
│   │   ├── auth/
│   │   ├── categories/
│   │   └── ...
│   ├── e2e/                         # Playwright-CLI（持久化 profile）
│   │   ├── _setup.ts                # 共享 helpers
│   │   ├── auth.e2e.ts
│   │   ├── categories.e2e.ts
│   │   ├── suppliers.e2e.ts
│   │   ├── products.e2e.ts
│   │   ├── purchase-orders.e2e.ts
│   │   ├── sales-orders.e2e.ts
│   │   ├── stats.e2e.ts
│   │   └── _integration.e2e.ts      # 跨模块端到端（integration-agent）
│   └── helpers/
│       ├── db.ts                    # 测试 DB 工厂
│       ├── caller.ts                # tRPC createCaller 包装
│       └── seed.ts                  # 业务数据 seed helper（不含商业逻辑）
│
├── docs/specs/                      # ← spec-agent 镜像 server/specs
└── .claude/
    ├── agents/                      # 每个 agent 一个 .md（详见 08-Agent详细定义.md）
    ├── commands/
    │   └── ship-module.md
    └── settings.json                # hooks 强制边界
```

---

## 3. Agent 角色矩阵

> 每个 agent 是一个**独立工作单元**，仅依据被允许读的文档产出被允许写的文件，互不依赖运行时通讯。每个模块同时存在 3 个 agent（backend / frontend / e2e-test），它们共同 "完成" 该模块。

### 3.1 全局 agent（仅 1 份，跨所有模块）

| Agent ID | 职责 | 读 | 写 | 主要工具 |
|---|---|---|---|---|
| `spec-agent` | 把 BRD 翻译成 7 份 spec.md（每模块 1 份） | BRD、`AI开发测试框架.md`、`server/00-技术约束.md`、`server/specs/_template.md` | `server/specs/<m>.md`、`inventory-app/docs/specs/<m>.md` | Read, Write, Glob |
| `schema-agent` | 初始化仓库骨架；写 `prisma/schema.prisma`、`prisma/seed.ts`、`/api/test/reset`、`/api/test/seed`、根级配置文件 | `server/00-技术约束.md`、`server/02-数据库与Schema.md`、所有 `server/specs/*.md` | `inventory-app/{prisma,package.json,tsconfig.json,next.config.ts,vitest.config.ts,stryker.conf.json,.nvmrc,.gitignore,.playwright-profile/.gitkeep}`、`src/server/{db.ts,context.ts,trpc.ts}`、`src/app/api/test/**` | Read, Write, Edit, Bash |
| `trpc-contract-agent` | 生成 `_app.ts` 与每个 router 的**空骨架**（仅声明 + Zod input + 占位 throw）；不实现业务 | `server/00-技术约束.md`、`server/03-tRPC契约.md`、所有 `server/specs/*.md` | `inventory-app/src/server/routers/*.ts`、`inventory-app/src/lib/trpc-client.ts` | Read, Write, Edit |
| `integration-agent` | 写跨模块 E2E（如：建分类 → 建供应商 → 建商品 → 进货 → 出货 → 看仪表板） | 全部 `server/specs/*.md`（read-only）、`server/06-Playwright-CLI规范.md` | `tests/e2e/_integration.e2e.ts` | Read, Write, Bash(playwright) |
| `mutation-agent` | 跑 Stryker 变异测试，输出报告，触发 test-agent 回退 | `server/07-质量门禁与流水线.md`、`stryker.conf.json` | 仅控制台 / mutation-report.html | Read, Bash(stryker) |

### 3.2 模块级 agent（每模块 3 份；M0..M6 共 7 × 3 = 21 个 agent）

> 命名规则：`<moduleId>-<role>`，如 `products-backend`、`products-frontend`、`products-e2e-test`。

#### `<m>-backend-impl`

| 项 | 值 |
|---|---|
| 输入 | `server/00-技术约束.md`、`server/03-tRPC契约.md`、`server/02-数据库与Schema.md`、`server/specs/<m>.md` |
| 输出 | `inventory-app/src/server/routers/<m>.ts` 的实现（覆盖 `trpc-contract-agent` 占位） |
| 严禁读 | `tests/<层>/<m>/`、其他模块的 `src/server/routers/<其他模块>.ts` |
| 严禁写 | `tests/`、其他模块的目录、`prisma/schema.prisma` |
| 工具 | Read, Edit, Bash(只允许 `pnpm test:unit:<m>` 和 `pnpm test:property:<m>`) |
| 完成判据 | `pnpm test:unit:<m>` 与 `pnpm test:property:<m>` 全绿、覆盖率 ≥ 90% 分支、变异存活 < 5% |

#### `<m>-frontend-impl`

| 项 | 值 |
|---|---|
| 输入 | `server/00-技术约束.md`、`server/04-前端规范.md`、`server/03-tRPC契约.md`、`server/specs/<m>.md` |
| 输出 | `inventory-app/src/app/<路由>/page.tsx` 等页面、`inventory-app/src/components/<m>/**` |
| 严禁读 | `tests/<层>/<m>/`、其他模块的 `src/components/<其他模块>/**` |
| 严禁写 | `tests/`、`src/server/`、`prisma/`、其他模块的目录 |
| 工具 | Read, Edit, Bash(只允许 `pnpm test:component:<m>` 与 `pnpm dev`) |
| 完成判据 | `pnpm test:component:<m>` 全绿 + 覆盖率达标 |

#### `<m>-e2e-test`

| 项 | 值 |
|---|---|
| 输入 | `server/00-技术约束.md`、`server/05-测试架构.md`、`server/06-Playwright-CLI规范.md`、`server/04-前端规范.md`、`server/specs/<m>.md` |
| 输出 | `tests/unit/<m>/`、`tests/property/<m>/`、`tests/component/<m>/`、`tests/e2e/<m>.e2e.ts` |
| 严禁读 | `inventory-app/src/server/routers/<m>.ts`、`inventory-app/src/components/<m>/**`、`inventory-app/src/app/<m 路由>/**` |
| 严禁写 | `src/`（任意） |
| 工具 | Read, Write, Glob, Bash(只允许 `pnpm test:*:<m>`、`pnpm dev:test`、`pnpm tsx tests/e2e/<m>.e2e.ts`) |
| 完成判据 | 所有测试断言都派生自 spec；运行后**应该全红**（impl 还没写）；TS 编译通过 |

---

## 4. Agent 协作流（无运行时通讯，由调度脚本串起来）

```
[阶段 0] 仓库初始化（一次性）
   schema-agent
       ├─ 写 prisma/schema.prisma（read all specs）
       ├─ 写 src/server/{db,context,trpc}.ts（共享底座）
       ├─ 写 src/app/api/test/{reset,seed}/route.ts
       └─ 写 package.json / tsconfig.json / vitest.config.ts / stryker.conf.json / next.config.ts
   trpc-contract-agent
       └─ 写 src/server/routers/<m>.ts（每个 router 仅 Zod input + 占位 throw）
   spec-agent
       └─ 写 server/specs/<m>.md（每模块 1 份）

[阶段 1] 模块测试先行（每模块独立并行）
   <m>-e2e-test
       ├─ 读 spec
       ├─ 写 tests/unit/<m>/*.test.ts
       ├─ 写 tests/property/<m>/*.test.ts
       ├─ 写 tests/component/<m>/*.test.tsx
       └─ 写 tests/e2e/<m>.e2e.ts
   ⇒ 所有测试应该 RED（impl 还没写）
   ⇒ 此时 git tag 测试快照：tests-frozen-<m>-v1（之后任何修改需 PR）

[阶段 2] 模块实现（每模块独立并行）
   <m>-backend-impl
       └─ 实现 src/server/routers/<m>.ts，循环跑 unit + property 直到全绿
   <m>-frontend-impl
       └─ 实现 src/app/<m>/** 与 src/components/<m>/**，循环跑 component 直到全绿

[阶段 3] 端到端 + 变异
   <m>-e2e-test 跑 E2E（也可以由调度脚本直接跑）
   mutation-agent 跑 Stryker
   ⇒ 任一红 → 调度脚本退回对应 agent

[阶段 4] 跨模块（最后）
   integration-agent
       └─ 写 tests/e2e/_integration.e2e.ts（M3+M4+M5+M6 串起来）
   ⇒ 跨模块 E2E 全绿 = 系统通过
```

> **关键约束**：阶段 1 完成后 `tests/<m>/` 目录在 git 中标记冻结（`.gitattributes` + CODEOWNERS 或 hook 拦截）。阶段 2 期间 backend/frontend impl agent 不能修改 `tests/`（hook 强制）。如果实现 agent 认为某条测试错误，必须**升级 issue 给人类**，不能自改。

---

## 5. 边界强制（hooks）

由 `.claude/settings.json` 配置；详细 prompt 与 hook 定义见 `08-Agent详细定义.md`。

| Hook 类别 | 触发 | 检查 |
|---|---|---|
| PreToolUse / Read | 任意 agent 读文件 | 路径是否在该 agent 的 "允许读" 列表内？否则拒绝 |
| PreToolUse / Glob, Grep | 同上 | 同上 |
| PreToolUse / Edit, Write | 任意 agent 写文件 | 路径是否在该 agent 的 "允许写" 列表内？否则拒绝 |
| PreToolUse / Edit, Write | impl agent 写 src/ | 检查内容是否 import 了 `00-技术约束.md` §13 白名单之外的跨模块路径，是则拒绝 |
| PostToolUse / Edit, Write | impl agent 写完一个 src 文件 | 自动跑该模块对应层测试，结果反馈给 agent |
| PreToolUse / Bash | 任意 agent 跑命令 | 命令是否在 frontmatter `tools` 的白名单内？否则拒绝 |

---

## 6. 启动顺序与脚本约定

人类操控 agent 的"调度脚本"由用户外部维护（见 `feedback_subagent_independence` 记忆）。本文档对外只承诺：**只要按以下顺序触发各 agent 一次，系统即可自洽完成**。

```bash
# 调度脚本伪代码
run_agent("spec-agent")
run_agent("schema-agent")
run_agent("trpc-contract-agent")

for m in M0..M6:
  run_agent("$m-e2e-test")
  git tag tests-frozen-$m-v1
  parallel:
    run_agent("$m-backend-impl")
    run_agent("$m-frontend-impl")
  run_agent("mutation-agent", scope=$m)

run_agent("integration-agent")
run_agent("mutation-agent", scope=full)
```

> 任意一步失败 ⇒ 该步骤对应 agent 回退执行，最多 N 轮（建议 N=5）；超过 N 轮自动升级 issue 给人类。

---

## 7. 何时需要"换 agent"？

agent 的"模块化分工"还要求：当一个 agent 因为上下文/记忆累积过深时，调度脚本应起新会话。具体触发：

- 单 agent 一次性输出 > 10 个文件 → 换会话
- 单 agent 修改超过 3 个之前已完成的模块 → 拒绝，必须改写为升级 issue
- backend 与 frontend 必须**永远不复用同一会话**（同会话 = 共谋作弊风险）

---

## 8. agent 验收清单

每个 agent 在自己的 frontmatter / prompt 末尾必须列出"自检清单"。下游调度脚本可读这一清单决定是否 ship。详见 `08-Agent详细定义.md` 各小节末尾的 `### Self-check`。
