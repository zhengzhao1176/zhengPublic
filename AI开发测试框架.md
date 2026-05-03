# AI 全自动开发的 TDD 测试框架

> 适用场景：任何由 AI 全自动开发、无人工 code review 的 Web 项目。
> 默认技术栈：Next.js (App Router) + tRPC + Prisma + SQLite/PostgreSQL + TypeScript。
> 同样适用：Remix / Nuxt / SvelteKit / Express + Vue 等任何"前后端一体 + 强类型"组合。

---

## 1. 核心理念：测试通过 = 可信

### 1.1 风险

让单一 AI 既写实现又写测试 → **共谋作弊**：buggy 实现 + "刚好让该 buggy 实现通过"的测试 → 全绿但全错。这是「AI 写代码、人不审」最大的隐患。

### 1.2 四道独立防线

| # | 防线 | 它打掉哪种作弊 |
|---|---|---|
| **D1** | test-agent ≠ impl-agent，且 test-agent 禁读 impl | 测试不能基于 buggy 代码"反推"温柔断言 |
| **D2** | 属性测试用随机输入打不变量 | 实现无法预测输入，只能真的实现该不变量 |
| **D3** | 变异测试 (Stryker 等) 自动改源码看测试是否报警 | 揪出"空断言"、漏分支、字面量错误 |
| **D4** | 真浏览器 E2E (Playwright/Cypress) | 真渲染、真 HTTP、真 DB，无法 mock 走捷径 |

四道全过 ⇒ 实现做的就是 spec 描述的事。

### 1.3 信任契约

```
人类审：spec.md (~100-300 行) + tests/ (~500-1500 行)
人类不审：src/ (实现代码)
```

人类只对 spec 和 tests 负责。这两份产物体量小、变更慢，可严格审。

---

## 2. 测试架构

### 2.1 金字塔

```
                ┌──────────────┐
                │   E2E (3-5)   │   真浏览器
              ┌─┴──────────────┴─┐
              │  Component (~10)  │   组件隔离测试
            ┌─┴───────────────────┴─┐
            │   Property (3-6)       │   不变量 + 随机输入
          ┌─┴───────────────────────-─┴─┐
          │       Unit (~20)             │   API/handler + 真 DB
          └─────────────────────────────-┘
                       ↑
            ┌──────────┴──────────┐
            │  Coverage 门禁       │   ≥ 90% 分支
            │  Mutation 门禁       │   < 5% 存活
            └─────────────────────┘
```

数字是单模块的典型量级。

### 2.2 四层 × 工具

| 层 | 推荐工具 | 测试端 | 测什么 |
|---|---|---|---|
| Unit | Vitest / Jest + 真 DB | 后端 | API handler 在固定输入下的行为 |
| Property | fast-check / hypothesis | 后端 | 随机输入下的不变量 |
| Component | RTL / Vue Test Utils + userEvent | 前端 | 组件交互、表单校验 |
| E2E | Playwright / Cypress | 全栈 | 真浏览器跑用户流程 |

### 2.3 两道门禁

| 门禁 | 阈值 | 不达标后果 |
|---|---|---|
| 行/分支覆盖率 (v8/c8) | ≥ 90% 分支，≥ 95% 行 | 漏覆盖 = 漏测的行为 |
| 变异存活率 (Stryker) | < 5% | 高存活率 = 测试断言不严格 |

任意一项不达标 ⇒ 模块判定未完成 ⇒ 自动退回。

---

## 3. Agent 角色分离

### 3.1 五种 agent

```
[需求文档 BRD]
   ↓
spec-agent          ─→ docs/specs/<module>.md
   ↓
schema-agent        ─→ db schema 文件（Prisma / SQL）
   ↓
   ┌─── 每模块并行 ─────────────────────────┐
   │  <module>-test-agent                   │
   │     输入: spec + 共享类型              │
   │     输出: tests/{...}/<module>/        │
   │     约束: 禁读 src/<module>/            │
   │     ↓ (测试冻结)                        │
   │  <module>-impl-agent                   │
   │     输入: spec + tests/<module>/        │
   │     输出: src/<module>/**               │
   │     约束: 禁改 tests/<module>/          │
   │     门禁: 全绿 + 覆盖率 + 变异          │
   └────────────────────────────────────────┘
   ↓
integration-agent   ─→ tests/e2e/_integration.* (跨模块)
   ↓
mutation-agent      ─→ Stryker 报告
```

### 3.2 上下文规模

每个 agent 只看自己需要的部分：

| Agent | 上下文 |
|---|---|
| spec-agent | BRD |
| schema-agent | BRD + 已有 specs |
| `<module>`-test-agent | 1 个 spec + 共享类型 |
| `<module>`-impl-agent | 1 个 spec + 自己的测试 |
| integration-agent | 全部 specs（只读） + e2e 测试 |

### 3.3 边界

由 hook 强制（见 §9）：

- test-agent 禁 Read `src/<其管辖 module>/`
- impl-agent 禁 Edit/Write `tests/<其管辖 module>/`
- 任何 agent 禁跨模块 import（例外白名单：DB schema、UI 基础组件、共享布局）

---

## 4. 推荐技术栈

```
运行时:
  前后端一体框架（Next.js/Remix/Nuxt/SvelteKit）   单仓单语言
  类型安全 RPC（tRPC/zod-router/Hono RPC）          类型即契约，无 OpenAPI
  Schema-first ORM（Prisma/Drizzle）                数据是唯一真理
  本地 DB（SQLite for dev/test）                    零运维
  TypeScript strict + Zod                           AI 第一道护栏

测试:
  Vitest                                            快、内置覆盖率
  fast-check                                        属性测试
  Testing Library + userEvent                       组件测试
  Playwright                                        E2E
  Stryker (mutator-typescript)                      变异测试
```

不强求这套；任何"强类型 + schema-first + 一体化"的栈都适用。但**测试工具链建议保持**——这套是当前最经济的覆盖。

---

## 5. Spec 文档规范

Spec 是 test-agent 的唯一输入。**spec 写不好 → 整条流水线崩。**

### 5.1 必备小节

1. **Data shape** — 字段、类型、约束（表格）
2. **Procedures / API** — 每个端点的 input / output / error codes / precondition order
3. **Invariants** — 编号的不变量列表（I1, I2, …）
4. **UI** — 组件 props、字段标签、错误文案（精确字面量）、提交行为
5. **E2E flow** — 关键用户路径（步骤化）

### 5.2 模板（保存到 `docs/specs/_template.md`）

```markdown
# <Module> Module — Spec

## 1. Data shape
| Field | Type | Constraint |
|-------|------|------------|

## 2. Procedures
### 2.1 `<module>.<op>` (mutation|query)
- Input (Zod): ...
- Output: ...
- Errors: `BAD_REQUEST` / `<CODE> w/ <MSG>` / ...
- Precondition order: 1. Zod  2. <check>  3. <persist>

## 3. Invariants
- I1 ...
- I2 ...

## 4. UI
- Path / Component / Props
- Fields & labels
- Error messages (字面量)
- Submit behavior

## 5. E2E flow
1. ...
```

### 5.3 写 spec 的 6 条铁律

1. **错误文案用精确字面量**（不写"提示格式错误"）
2. **不变量必须可机器化**（写 `quantity ≥ 0`，不写"合理"）
3. **precondition 写顺序**（多检查时报哪一个，必须确定）
4. **数值约束写边界**（`> 0`、`length 1..100`，不写"非负"、"合理"）
5. **错误码用枚举字面量**（`USER_NOT_FOUND`，不写"用户不存在"）
6. **不写实现细节**（说"返回创建的行"，不说"用 ORM.create"）

---

## 6. 四层测试编写规范

每层 = 目的 + 必须覆盖 + 极简模板。完整可运行示例见 `demo/`。

### 6.1 单元测试

**目的**：验证后端 procedure / handler 在固定输入下的行为。

**关键**：直接调 handler（tRPC `createCaller` 或 Express supertest 等），用真 DB（SQLite 临时文件），**不 mock**。

**必须覆盖**：
- 每条 Zod / 输入约束的拒绝用例
- 每个错误码
- precondition order（多处错时报哪一个）
- 成功路径的持久化往返

```ts
describe('<module>.<op> — input', () => {
  it.each(invalidInputs)('rejects %s', async (bad) => {
    await expect(caller.x.op(bad)).rejects.toThrow()
  })
})

describe('<module>.<op> — business rules', () => {
  it('throws <ERROR_CODE> when <condition>', async () => {
    await expect(caller.x.op(bad)).rejects.toThrow(/<ERROR_CODE>/)
  })
  it('checks A before B before C', async () => {
    // 同时构造 A、B、C 三处都错的输入，断言报 A
  })
})

describe('<module>.<op> — round trip', () => {
  it('persists exactly what was sent', async () => {
    const created = await caller.x.op(input)
    expect(await caller.x.byId({ id: created.id })).toMatchObject(input)
  })
})
```

### 6.2 属性测试

**目的**：用随机输入打 spec 中的不变量。这是抗 D2 作弊的核心。

**关键**：
- arbitrary 必须**从 spec 约束精确派生**（spec 说 `regex /X/` → `fc.stringMatching(/X/)`）
- 每条不变量 ≥ 30 runs
- 每个模块 ≥ 1 个 anti-property（违法输入必须被拒）

```ts
const validInputArb = () => fc.record({ ... })  // 派生自 spec

it('I<N>: <invariant description>', async () => {
  await fc.assert(
    fc.asyncProperty(validInputArb(), async (raw) => {
      // 1. reset state  2. apply ops  3. assert invariant
    }),
    { numRuns: 30 },
  )
})

it('any input violating <X> is rejected (anti-property)', async () => {
  await fc.assert(
    fc.asyncProperty(invalidInputArb(), async (bad) => {
      await expect(caller.x.op(bad)).rejects.toThrow()
    }),
    { numRuns: 20 },
  )
})
```

### 6.3 组件测试

**目的**：组件隔离环境下的交互、校验、可访问性。

**关键**：
- 用 `userEvent`（真模拟键盘点击），不要 `fireEvent`
- 用 `getByLabel` / `getByRole`，不要 CSS 选择器
- 错误信息要有 `role="alert"`

**必须覆盖**：
- 每条 spec 错误文案的精确字面量
- **每个 invalid case 必须断言 `onSubmit` 未被调用**
- 提交中按钮 disabled、文案变化（防双提交）

```tsx
it('shows <精确文案> when invalid, blocks submit', async () => {
  const onSubmit = vi.fn()
  render(<Form onSubmit={onSubmit} />)
  const user = userEvent.setup()
  // 输入 invalid 值
  await user.click(screen.getByRole('button', { name: /保存/ }))
  expect(await screen.findByText('<精确文案>')).toBeInTheDocument()
  expect(onSubmit).not.toHaveBeenCalled()
})

it('calls onSubmit with parsed values on valid input', async () => { /* ... */ })
it('disables submit while submitting', async () => { /* ... */ })
```

### 6.4 E2E 测试

**目的**：真浏览器跑端到端用户流程。打掉 D4 作弊。

**关键**：
- 测试环境暴露 `/api/test/reset` 和 `/api/test/seed`（仅 `NODE_ENV=test`）
- 用 `getByLabel` / `getByRole`，重构后仍稳定
- 至少一条断言"客户端校验时网络请求 = 0"

**必须覆盖**：
- happy path
- 至少一个错误路径
- 客户端校验的"零请求"断言

```ts
test.beforeEach(async ({ request }) => {
  await request.post('/api/test/reset')
  await request.post('/api/test/seed', { data: { ... } })
})

test('happy path', async ({ page }) => {
  await page.goto('/<module>/new')
  // fill form
  await page.getByRole('button', { name: '保存' }).click()
  await expect(page).toHaveURL('/<module>')
})

test('client-side validation makes 0 network calls', async ({ page }) => {
  let calls = 0
  await page.route('**/api/<endpoint>**', (r) => { calls++; r.continue() })
  await page.goto('/<module>/new')
  // 输入非法值并提交
  expect(calls).toBe(0)
})
```

---

## 7. 质量门禁

### 7.1 阈值

```
Branch coverage  ≥ 90%
Line coverage    ≥ 95%
Function coverage ≥ 95%
Mutation survival < 5%
```

### 7.2 模块通过条件

```bash
pnpm vitest run --coverage tests/{unit,property,component}/<module>/**
pnpm playwright test tests/e2e/<module>**
pnpm stryker run --mutate "src/<module>/**/*.ts"
```

四条全过 ⇒ 模块判定完成。

变异测试通常**只覆盖核心业务逻辑层**（API handler / service），避免对 UI 跑全量变异（代价过高、收益低）。UI 层由严格的 component test + E2E 兜底。

---

## 8. TDD 工作流

```
[1] spec-agent      → docs/specs/<module>.md
                       (含 invariants + 错误文案字面量)
[2] schema-agent    → 更新 DB schema 文件
[3] <m>-test-agent  → tests/{unit,property,component,e2e}/<m>/
                       (TS 编译应该通过；测试应该全红——impl 还没写)
[4] <m>-impl-agent  → src/<m>/**
                       循环：写 → 跑测试 → 读失败 → 改 → 直到全绿
[5] 门禁验证        → coverage ≥ 90% 分支 + 变异存活率 < 5%
                       任一不达标：
                         - 覆盖率不够 → 退回 test-agent 补测
                         - 变异活太多 → 退回 test-agent 加严断言
                       全过 ⇒ 模块完成
```

**关键约束**：Step 3 完成后 `tests/<m>/` 被 git 标记冻结。Step 4 期间 impl-agent 不能改测试（hook 拦截）。如果 impl-agent 认为某测试错误，必须**升级**给人（提 issue），不能自改。

---

## 9. Claude Code 集成要点

### 9.1 Agent 配置

`.claude/agents/<name>.md`，每个 agent 一个文件，frontmatter 用 `tools` 字段限制工具。例：

```markdown
---
name: <module>-test-agent
description: 为 <module> 写 unit/property/component/e2e 测试
tools: [Read, Write, Glob, Bash(pnpm test:<module>:*)]
---
允许读: docs/specs/<module>.md, 共享类型, demo/tests/**
禁止读: src/<module>/**
输出目录: tests/{unit,property,component,e2e}/<module>/
```

### 9.2 Hooks

`.claude/settings.json` 配三类 hook：
- **PreToolUse Read/Glob/Grep**：按 agent 类型校验读取边界
- **PreToolUse Edit/Write**：按 agent 类型校验写入边界 + 跨模块 import 拦截
- **PostToolUse Edit/Write**：自动跑被改文件所属模块的测试，失败立刻反馈

### 9.3 Slash command

`.claude/commands/ship-module.md` 一键串起完整流水线，参数为模块名。

---

## 10. 反模式（必须避免）

| 反模式 | 为什么坏 |
|---|---|
| 同一 agent 写测试和实现 | 共谋作弊（D1 失效） |
| 测试中 mock 数据库 | mock/真实分歧导致测试假绿 |
| 只用固定输入测试 | 边界覆盖不到，AI 容易凑数 |
| 仅看覆盖率不看变异 | 100% 覆盖率 + 空断言依然能过 |
| spec 用模糊语言 | test-agent 没法机器化 |
| impl-agent 改 tests/ 让测试通过 | 直接破坏信任契约 |
| E2E 用 CSS 选择器 | 易碎，重构就坏 |
| 错误文案在测试和实现里各写一份 | 不同步 → 假绿 |
| 测试间共享大量 fixture state | 一个污染所有 |
| 跨模块直接 import 内部实现 | agent 边界失守 |

---

## 11. 模块完成清单

### Spec
- [ ] 含 Data / Procedures / Invariants / UI / E2E 五节
- [ ] 错误文案是精确字面量
- [ ] 不变量都可机器化

### Tests
- [ ] unit 覆盖每条输入约束、每个错误码、precondition order
- [ ] property 每条不变量 ≥ 1 个测试，每个 ≥ 30 runs
- [ ] property 含 ≥ 1 个 anti-property
- [ ] component 每条错误文案有断言
- [ ] component 每个 invalid case 都有 `onSubmit` 未调用断言
- [ ] e2e 至少 happy path + 1 个错误路径
- [ ] e2e 至少 1 条"网络请求 = 0"断言

### 门禁
- [ ] 测试全绿
- [ ] 分支覆盖 ≥ 90%
- [ ] 变异存活率 < 5%

### 边界
- [ ] tests/ 中 0 个 import 来自 `src/<本模块>/`（除类型）
- [ ] src/ 中 0 个跨模块业务 import（仅 schema + ui 基础组件 + 布局）

---

## 附录：常见不变量速查

写 spec 时可勾选适用的标准不变量：

| 名字 | 形式 |
|---|---|
| ROUND_TRIP | `create(X)` → `byId(returned.id)` 等于 X |
| UNIQUENESS | `create(X)` 后再 `create(X)` 抛 CONFLICT |
| FOREIGN_KEY | 引用不存在 ID 抛 NOT_FOUND |
| NON_NEG | 数值字段 ≥ 0 |
| RANGE | low < high 始终成立 |
| TRIM | 字符串字段被 trim |
| NO_LEAK | `delete(X)` 后 `byId(X.id)` 抛 NOT_FOUND |
| TRANSACTION | 多步操作中途失败 → 全部回滚 |
| COUNT_BALANCE | create n + delete n → count 不变 |
| ORDER | list 查询结果顺序符合声明 |
| MONOTONIC | id / 单号始终递增 |
| AUTH | 未授权用户无法触发任何 mutation |
| RATE_LIMIT | 超过阈值的请求被拒 |
| IDEMPOTENT | 同一 idempotency-key 多次调用结果一致 |

---

## 附录 B：参考实现位置

本仓库提供一份完整切片作为活样本（位置随项目变化，本框架与具体业务无关）：

```
demo/
  docs/specs/<module>.md
  src/<...>/<module>.<ts|tsx>
  tests/{unit,property,component,e2e}/<module>.test.<ts|tsx>
```

读 spec + 4 个测试文件即可验证 impl 正确性，无需读 impl 代码。这是本框架的"活规范"。
