# `<Module>` Module — Spec

> This file is the **single source of truth** for the `<module>` module.
> - The test agent reads ONLY this spec (and shared helpers/types it points to). It does NOT read the implementation.
> - The implementation MUST satisfy every assertion derivable from this spec.
> - If spec and impl disagree, spec wins. Update spec first, then re-derive tests.
> - Any literal must be **字字一致** with `server/00-技术约束.md` §6 / §7 / §8.

---

## 0. Scope (一句话)

`<一句话描述这个模块解决的业务问题>`

依赖（read-only）：`<列出依赖的模块，例如 categories, suppliers>`
被依赖（read-only）：`<列出依赖本模块的模块>`

---

## 1. Data shape

| Field | Type | Constraint |
|-------|------|------------|
| <fieldName> | <type> | <约束（与 Prisma schema + Zod input 一致）> |
| ... | | |

> 行的来源是 `02-数据库与Schema.md` §2 中对应 model 的字段；所有约束**机器可验证**。

---

## 2. Procedures (tRPC)

> 每个 procedure 一节。Input 一定写 Zod；Output 必填；Errors 列出全部 message 字面量；前置顺序必须明确。

### 2.1 `<router>.<op>` (mutation | query, public | protected)

- **Input** (Zod):
  ```ts
  z.object({ ... })
  ```
- **Output**: `<type 描述>`
- **Errors**: `<ERROR_CODE_1>` / `<ERROR_CODE_2>` / ...
- **Precondition order**: 1. Zod  2. <check A>  3. <check B>  4. <持久化>
- **副作用**: `<如：写 cookie / 写 StockLog / 启事务>`

---

## 3. Invariants

> 列出**编号**的不变量（I1..In）。每条对应 fast-check property test。

- **I1** `<例：code 全局唯一>`
- **I2** `<例：create(X) 后 byId(returned.id) 等于 X>`
- ...

---

## 4. UI

### 4.1 Routes & Pages

- 列表页：`/<route>` ← `src/app/(app)/<route>/page.tsx`
- 新增页：`/<route>/new` ← `src/app/(app)/<route>/new/page.tsx`
- ...

### 4.2 Form fields

| Label (中文 + aria-label) | Field name | Type | 约束（前端 Zod） | 错误文案 (字面量) |
|---|---|---|---|---|
| `编码` | `code` | text | `^[A-Za-z0-9-]{3,20}$` | `编码必须为3-20位字母数字或短横线` |
| ... | | | | |

### 4.3 Buttons

| 用途 | 文案 | 提交中文案 | testid（如适用） |
|---|---|---|---|
| 提交 | `保存` | `保存中...` | — |
| ... | | | |

### 4.4 testid catalog（仅本模块特有；通用见 04-前端规范.md §5）

| testid | 元素 | 何时出现 |
|---|---|---|
| `<module>-list` | Table | 列表页 |
| `row-<id>-confirm` | 行内确认按钮 | 仅 DRAFT 单（如适用） |
| ... | | |

### 4.5 服务端错误展示

| Error message | 中文 toast / page-level 文案 |
|---|---|
| `<CODE_X>` | `<中文文案 — 来自 00-技术约束.md §7.2>` |

### 4.6 Submit behavior

- 客户端校验失败 → **不**调 mutation；显示对应 `role="alert"` 文案；`onSubmit`（组件测试）`not.toHaveBeenCalled()`
- 服务端校验失败 → 顶部 page-level alert；URL 不变
- 成功 → toast `<操作>成功` + 跳转到 `<目标路由>`

---

## 5. E2E flow

> 浏览器自动化覆盖的端到端路径。每条路径列步骤；e2e-test-agent 据此写 `tests/e2e/<m>.e2e.ts`。

### 5.1 Happy path（必跑）

1. `await login(page)`
2. ...
3. `expect(page).toHaveURL(...)` & `expect.poll(getByText('...').count()).toBeGreaterThan(0)`

### 5.2 服务端错误路径（必跑）

1. ...

### 5.3 客户端校验"零网络调用"路径（必跑）

1. 监听 `**/api/trpc/<router>.<op>` 计数
2. 输入 invalid 值 → 提交 → 计数 == 0

### 5.4 其他路径（按需）

- ...

---

## 6. Out of scope（明确不做）

- `<列出此模块**不做**的事，避免 scope 蔓延>`
