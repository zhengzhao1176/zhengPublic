# `auth` Module — Spec

## 0. Scope

唯一 admin 用户的登录、登出与"当前登录态查询"。无注册、无找回密码、无角色细分。

依赖：— （seed 中 admin 由 schema-agent 注入）
被依赖：所有其他模块（protected procedure 通过 `ctx.user` 鉴权）

---

## 1. Data shape — `User`

| Field | Type | Constraint |
|---|---|---|
| id | int | auto-increment, > 0 |
| username | string | unique, trimmed length 1..50 |
| passwordHash | string | bcrypt(10 rounds) |
| createdAt | datetime | set on create |
| updatedAt | datetime | set on create, refreshed on update |

> seed 写入：`username='admin'`、明文密码 `admin123`。

---

## 2. Procedures (tRPC)

### 2.1 `auth.login` (mutation, public)

- **Input** (Zod):
  ```ts
  z.object({
    username: z.string().trim().min(1),
    password: z.string().min(1),
  })
  ```
- **Output**: `{ id: number; username: string }`
- **Errors**: `INVALID_CREDENTIALS`
- **Precondition order**: 1. Zod  2. 用户名（trim 后）查到行（否则 `INVALID_CREDENTIALS`）  3. `bcrypt.compare` 通过（否则 `INVALID_CREDENTIALS`）
- **副作用**: 颁发 JWT (`payload = { id, username }`, expiresIn=7d, secret=`process.env.JWT_SECRET`)，并通过 `Set-Cookie: inv_token=<jwt>; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800` 写入

### 2.2 `auth.logout` (mutation, public)

- **Input**: `z.void()`
- **Output**: `{ ok: true }`
- **Errors**: —
- **副作用**: 清 cookie：`Set-Cookie: inv_token=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`

### 2.3 `auth.me` (query, public)

- **Input**: `z.void()`
- **Output**: `{ id: number; username: string } | null`
- **Errors**: —（解析失败的 token 视作未登录，返回 null，**不抛错**）

---

## 3. Invariants

- **I1** 同一用户名永远只对应至多一行。
- **I2** 任意 `auth.me` 调用，`null` 仅当无 cookie 或 cookie 解析失败；其它情况必返回 `{id, username}`。
- **I3** `bcrypt.compare(明文, passwordHash)` 为真的明文有且仅有 seed 时设置的明文（即不会出现 hash 碰撞导致多个明文被接受）。（这一条由 bcryptjs 保证；测试**不**用 fast-check 反复 bcrypt，仅用一条 unit 验证）
- **I4** `auth.login` 错误 `INVALID_CREDENTIALS` 在"用户不存在"与"密码错"两种情形下文案一致（防用户名枚举）。
- **I5** `auth.logout` 后立即 `auth.me` 应返回 `null`（同一 cookie context）。

---

## 4. UI

### 4.1 Routes & Pages

- 登录页：`/login` ← `src/app/(auth)/login/page.tsx`
- 已登录后默认目标：`/dashboard`（若 `?redirect=...` 存在则跳那里，但**只允许同源相对路径**）

### 4.2 Form fields

| Label (中文 + aria-label) | Field name | Type | 约束 (前端 Zod) | 错误文案（字面量） |
|---|---|---|---|---|
| `用户名` | `username` | text | trim().min(1) | `请输入用户名` |
| `密码` | `password` | password | min(1) | `请输入密码` |

### 4.3 Buttons

| 用途 | 文案 | 提交中文案 |
|---|---|---|
| 提交 | `登录` | `登录中...` |

### 4.4 testid catalog

| testid | 元素 |
|---|---|
| `header-logout` | 顶栏退出登录按钮（在 (app)/layout.tsx 中） |

### 4.5 服务端错误展示

| Error message | page-level alert（顶部 `role="alert"`） |
|---|---|
| `INVALID_CREDENTIALS` | `用户名或密码错误` |

### 4.6 Submit behavior

- 客户端 Zod 失败 → 显示字段级 alert，**不**调 `auth.login`
- 成功 → toast `登录成功` + `router.replace('/dashboard')`（或 redirect 参数）
- 服务端 `INVALID_CREDENTIALS` → 顶部 page-level alert；停留在 `/login`

### 4.7 退出登录交互

- 顶栏点 `退出登录` → 调 `auth.logout` → toast `已退出登录` + 跳 `/login`

---

## 5. E2E flow

### 5.1 Happy path

1. `resetBackend()`
2. `page.goto('/login')`
3. fill `用户名=admin`, `密码=admin123`
4. click `登录`
5. expect URL `/dashboard`
6. expect text `admin` 可见（顶栏用户名）

### 5.2 服务端错误路径

1. `resetBackend()`
2. fill `用户名=admin`, `密码=wrong`
3. click `登录`
4. expect URL stays `/login`
5. expect text `用户名或密码错误` 可见（`role="alert"`）

### 5.3 客户端校验"零网络调用"

1. `resetBackend()`
2. `page.goto('/login')`
3. start counter `countTrpcCalls(page, 'auth.login')`
4. 不填任何字段 → click `登录`
5. expect text `请输入用户名` 可见
6. wait 300ms; expect counter == 0

### 5.4 未登录访问 `(app)` → 跳 `/login`

1. `resetBackend()`
2. 清空 cookie：`await context.clearCookies()`
3. `page.goto('/products')`
4. expect URL contains `/login`，且查询串 `redirect=%2Fproducts`

### 5.5 退出登录

1. login(page) → 在 `/dashboard`
2. click `header-logout` testid
3. expect URL `/login`
4. expect text `已退出登录` 可见

---

## 6. Out of scope

- 注册、忘记密码、修改密码
- 多用户 / 多角色 / RBAC
- 多端 token / 设备管理
- OAuth / SSO
- 二次验证
