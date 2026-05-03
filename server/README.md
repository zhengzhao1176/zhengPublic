# 库存管理系统 — 技术文档总入口

> **唯一目标**：让 6 类（共 25+ 个）独立 subagent 仅读各自被指派的文档即可完整交付一个生产可用的库存管理系统，零口头沟通、零跨文档协调。
>
> **业务来源**：`/Users/apple/Desktop/t3/库存管理系统-业务需求文档.md`（BRD，本目录之外，仅 spec-agent 与 schema-agent 阅读）。
> **测试理念来源**：`/Users/apple/Desktop/t3/AI开发测试框架.md`（活理论，所有 agent 都默读）。

---

## 1. 文档树（本目录 = 唯一权威）

```
server/
├── README.md                          ← 你正在读这里
├── 00-技术约束.md                     ← 全局冻结：技术栈/版本/端口/账号/编码规范/字面量
├── 01-架构与Agent分工.md              ← 仓库布局 + Agent 角色矩阵 + 边界 + 工作目录
├── 02-数据库与Schema.md               ← Prisma schema、迁移、seed、test reset
├── 03-tRPC契约.md                     ← 全部 procedure 的 input/output/error 契约
├── 04-前端规范.md                     ← 路由表、页面骨架、表单字段表、testid 目录
├── 05-测试架构.md                     ← 4 层金字塔、覆盖率/变异门禁、信任契约
├── 06-Playwright-CLI规范.md           ← 浏览器自动化具体写法 + 持久化 profile + headed 模式
├── 07-质量门禁与流水线.md             ← 模块完成判据、CI 矩阵、ship-module 流程
├── 08-Agent详细定义.md                ← 每个 agent 的 prompt/工具/读写边界/验收清单
└── specs/                             ← 每模块一个 spec，是 test-agent 的唯一输入
    ├── _template.md
    ├── auth.md
    ├── categories.md
    ├── suppliers.md
    ├── products.md
    ├── purchase-orders.md
    ├── sales-orders.md
    └── inventory-stats.md
```

---

## 2. 谁该读哪些文档？（Agent 阅读权限矩阵）

| Agent | 必读 | 选读 | 严禁读 |
|---|---|---|---|
| spec-agent | BRD、`AI开发测试框架.md`、`00-技术约束.md`、`specs/_template.md` | `02-数据库与Schema.md` | `src/`、`tests/` |
| schema-agent | BRD、`00-技术约束.md`、`02-数据库与Schema.md`、所有 `specs/*.md` | — | `src/`、`tests/` |
| trpc-contract-agent | `00-技术约束.md`、`03-tRPC契约.md`、所有 `specs/*.md` | `02-数据库与Schema.md` | `src/`、`tests/` |
| `<m>`-backend-impl-agent | `00-技术约束.md`、`03-tRPC契约.md`、`02-数据库与Schema.md`、`specs/<m>.md` | — | `tests/<m>/`、其他模块的 `src/server/routers/*` |
| `<m>`-frontend-impl-agent | `00-技术约束.md`、`04-前端规范.md`、`03-tRPC契约.md`、`specs/<m>.md` | — | `tests/<m>/`、其他模块的 `src/components/*` |
| `<m>`-e2e-test-agent | `00-技术约束.md`、`05-测试架构.md`、`06-Playwright-CLI规范.md`、`04-前端规范.md`、`specs/<m>.md` | — | `src/server/routers/<m>.ts`、`src/components/<m>/**`、其他测试 agent 的产物 |
| integration-agent | `00-技术约束.md`、`05-测试架构.md`、`06-Playwright-CLI规范.md`、所有 `specs/*.md` | — | `src/`（任意） |
| mutation-agent | `00-技术约束.md`、`07-质量门禁与流水线.md` | — | `tests/`（任意） |

> 边界由 `.claude/settings.json` 的 hooks 强制（见 `08-Agent详细定义.md`）。任何越界行为应立即被拦截并提示 agent 升级 issue 给人类，禁止自行越界。

---

## 3. 阅读顺序（人类首读建议）

1. `00-技术约束.md` — 5 分钟看完所有冻结量
2. `01-架构与Agent分工.md` — 看仓库长什么样、谁负责哪一块
3. `05-测试架构.md` + `06-Playwright-CLI规范.md` — 理解测试是怎么跑起来的
4. 抽一个 `specs/*.md`（例：`products.md`） — 体会 spec 的精度
5. `08-Agent详细定义.md` — 看 agent prompt 是怎么把上面几份串起来的

读完这五份就能完整审完整个系统的"信任契约"。

---

## 4. 核心信任契约

依据 `AI开发测试框架.md` §1.3：

```
人类审 (本目录所有 .md + tests/ 中所有测试代码)：
  - server/00-技术约束.md
  - server/specs/*.md
  - tests/{e2e,unit,property,component}/**

人类不审 (实现代码)：
  - src/**
```

如果 `tests/` 全绿 + 覆盖率达标 + 变异存活率达标 ⇒ `src/` 即被认为正确，无需逐行审。

---

## 5. 与早期 GraphQL 文档的关系

本目录的方案 **从零重新设计**，与项目根的早期 GraphQL/Apollo 文档无继承关系。本套技术栈是 **Next.js (App Router) + tRPC + SQLite + TypeScript**。如果根目录有冲突文档，**以本目录为准**。

---

## 6. 一句话上手

```bash
pnpm install
pnpm prisma migrate dev
pnpm dev          # 启动 Next.js dev server (http://localhost:3000)
# 另开终端
pnpm test:e2e     # Playwright-CLI 浏览器自动化测试套
```

具体每一条命令的语义见 `07-质量门禁与流水线.md` §3。
