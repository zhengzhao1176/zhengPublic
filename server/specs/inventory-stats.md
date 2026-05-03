# `inventory-stats` Module — Spec

## 0. Scope

库存统计 = 仪表板 + 库存预警 + 库存趋势 + 报表导出。**只读**模块，不写业务数据。

依赖：`auth`、`products`、`purchase-orders`、`sales-orders`（read-only via tRPC）
被依赖：— （叶子）

---

## 1. Data shape — 派生输出（无新增持久化模型）

> 本模块不引入新的 Prisma 模型；所有数据从 `Product` / `PurchaseOrder` / `SalesOrder` / `StockLog` 推导。

---

## 2. Procedures (tRPC)

### 2.1 `stats.overview` (query, protected)

- **Input**: `z.void()`
- **Output**:
  ```ts
  {
    totalProducts: number,         // count(Product)
    totalQuantity: number,         // Σ Product.quantity
    totalValue: number,            // round2(Σ Product.quantity * Product.costPrice)
    alertCount: number,            // count(Product WHERE quantity ≤ minStock OR quantity ≥ maxStock)
    periodStats: {
      todayPurchase: number,       // Σ PurchaseOrder.quantity WHERE status='CONFIRMED' AND confirmedAt ∈ today
      todaySales: number,
      weekPurchase: number,        // 周一 00:00 起到 confirmAt 现在
      weekSales: number,
      monthPurchase: number,       // 每月 1 日 00:00 起
      monthSales: number,
    }
  }
  ```
- **Errors**: `UNAUTHORIZED`
- **行为**: today / week / month 边界用 dayjs 本地时区

### 2.2 `stats.alerts` (query, protected)

- **Input**: `z.object({ type: z.enum(['ALL','LOW','OVER']).default('ALL') })`
- **Output**:
  ```ts
  Array<Product & {
    alertType: 'LOW' | 'OVER',
    category: { id, name },
    supplier: { id, name },
  }>
  ```
- **行为**: LOW 取 `quantity ≤ minStock`，OVER 取 `quantity ≥ maxStock`，ALL 取并集；按 `id` 升序
- **Errors**: `UNAUTHORIZED`

### 2.3 `stats.trend` (query, protected)

- **Input**:
  ```ts
  z.object({
    productId: z.number().int().positive(),
    dateFrom: z.string().datetime(),
    dateTo: z.string().datetime(),
  }).refine((d) => d.dateFrom <= d.dateTo, { path: ['dateTo'] })
  ```
- **Output**: `Array<{ date: 'YYYY-MM-DD'; quantity: number }>`，按 date 升序，每天一条
- **Errors**: `UNAUTHORIZED` / `PRODUCT_NOT_FOUND`
- **行为**:
  - 计算"日末库存"：`baseQty = product.quantity - Σ(StockLog.delta where createdAt > endOfDay(date))`，从 dateFrom 到 dateTo 每天求得
  - 等价表述（用于实现自由）：从 dateTo 当前 quantity 倒推；或从 dateFrom 累加 stockLog
  - 无变动的日期插值前一日

### 2.4 `stats.report` (query, protected)

- **Input**: `z.void()`
- **Output**:
  ```ts
  Array<{
    code: string,
    name: string,
    categoryName: string,
    quantity: number,
    unit: string,
    costPrice: number,
    stockValue: number,            // round2(quantity * costPrice)
    sellPrice: number,
    supplierName: string,
    minStock: number,
    maxStock: number,
  }>
  ```
- **Errors**: `UNAUTHORIZED`
- **行为**: 按 product.id 升序

---

## 3. Invariants

- **I1** Overview totals consistency — `totalQuantity = Σ Product.quantity`、`totalValue = Σ round2(quantity * costPrice)`、`alertCount = count(Product satisfying alert condition)`，对任意 DB 状态成立。
- **I2** Period stats use confirmedAt — `todayPurchase` 不计 DRAFT 单；不计未来日期；不计 `confirmedAt` 在区间外的 CONFIRMED 单。
- **I3** Alerts coverage — `stats.alerts(ALL)` 的结果 = `stats.alerts(LOW)` ∪ `stats.alerts(OVER)`，且无重复 id（因 G5 禁止 LOW 与 OVER 同时成立）。
- **I4** Trend boundary — `trend({productId, dateFrom, dateTo})` 末日的 `quantity` 等于 `dateTo` 当晚的 `product.quantity`（如果 dateTo 不在未来）。
- **I5** Trend monotonic dates — 输出 `date` 严格升序、无重复。
- **I6** Report monetary — `stockValue` = `round2(quantity * costPrice)`。
- **I7** Empty graceful — 无 product 时 overview 全部数值为 0；`alerts` 与 `report` 为空数组；`trend` 返回 `PRODUCT_NOT_FOUND`。

---

## 4. UI

### 4.1 Routes

| 路由 | 页面 |
|---|---|
| `/dashboard` | 仪表板 |
| `/stats/alerts` | 库存预警 |
| `/stats/trends` | 库存趋势 |
| `/stats/report` | 库存报表 + 导出 Excel |

### 4.2 Dashboard

四张卡片（横排）：

| 卡片 | 主数字 testid | 来源 |
|---|---|---|
| 总商品数 | `stat-total-products` | `overview.totalProducts` |
| 总库存数 | `stat-total-quantity` | `overview.totalQuantity` |
| 总库存价值 | `stat-total-value` | `overview.totalValue`（人民币 ¥ 格式） |
| 预警数 | `stat-alert-count` | `overview.alertCount` |

下方 1 张表格"周期统计"：

| 区段 | 进货数量 | 出货数量 |
|---|---|---|
| 今日 | `periodStats.todayPurchase` | `periodStats.todaySales` |
| 本周 | `periodStats.weekPurchase` | `periodStats.weekSales` |
| 本月 | `periodStats.monthPurchase` | `periodStats.monthSales` |

### 4.3 库存预警 `/stats/alerts`

- 顶部筛选：`Select` 全部/低库存/超容量
- 表格列：`编码` / `名称` / `分类` / `当前库存` / `最小库存` / `最大库存` / `状态（低库存/超容量）` / `供应商`
- 空态 testid: `stats-alerts-empty`
- 表格 testid: `stats-alerts-list`

### 4.4 库存趋势 `/stats/trends`

- 顶部：商品选择（搜索 by code/name），日期范围选择（默认最近 30 天），按钮 `查询`
- 主体：折线图（用 `@ant-design/plots` 的 `Line`），x=date, y=quantity
- 图表容器 testid: `stat-trend-chart`
- 空态 testid: `stats-trends-empty`

### 4.5 库存报表 `/stats/report`

- 顶部按钮 `导出 Excel`，testid: `report-export`
- 表格列同 §2.4 output
- 表格 testid: `stats-report-list`

### 4.6 服务端错误

| Error | 文案 |
|---|---|
| `PRODUCT_NOT_FOUND` | `商品不存在`（出现在 `/stats/trends` 当所选商品不存在时） |

### 4.7 Submit behavior

- /stats/trends 选商品 + 日期 → 客户端 zod（dateFrom ≤ dateTo）失败 → 字段 alert，**不**调 mutation/query

---

## 5. E2E flow

### 5.1 Dashboard 显示零

1. `resetBackend()` （仅 admin）
2. login → 自动进 `/dashboard`
3. expect `stat-total-products` 内文为 `0`、`stat-total-value` 为 `¥0.00`、`stat-alert-count` 为 `0`

### 5.2 Dashboard 显示真实数

1. seed: 2 个 product（P1 qty=100, costPrice=10；P2 qty=5, costPrice=2, minStock=10）
2. login → goto `/dashboard`
3. `stat-total-products`=`2`；`stat-total-quantity`=`105`；`stat-total-value`=`¥1010.00`；`stat-alert-count`=`1`（P2 低库存）

### 5.3 Alerts 表格内容

1. 同 §5.2 seed
2. login → goto `/stats/alerts`
3. expect 表格行数=1，可见 `P2`、`低库存`

### 5.4 Trends 折线图

1. seed P1 qty=100
2. 通过 trpc 直接 createOrder + confirm 几条进货/出货（或通过 UI；此条仅断"图表渲染")
3. goto `/stats/trends`，select P1，dateFrom=今天-30、dateTo=今天 → click `查询`
4. expect `stat-trend-chart` 元素存在
5. **不**断点像素，仅断章节存在与至少 1 个 `<g class="g2-tooltip-marker"` 之类元素（或检查 chart 内 `<canvas>` / `<svg>` 存在）

### 5.5 Report 导出 Excel

1. seed 1 个 product
2. login → goto `/stats/report`
3. 监听 `page.on('download')`
4. click `report-export`
5. expect download 触发
6. download.suggestedFilename() 以 `inventory-report-` 前缀开头，扩展名 `.xlsx`

### 5.6 客户端零调用 — trends 日期范围错误

1. login → goto `/stats/trends`
2. counter = `countTrpcCalls(page, 'stats.trend')`
3. select P1，dateFrom=2026-05-10、dateTo=2026-05-01 → click `查询`
4. expect 字段级 alert 提示日期范围
5. counter == 0

---

## 6. Out of scope

- 自定义报表 / 多种导出格式（PDF/CSV）
- 多时区
- 价值估算（FIFO/LIFO 假设）
- 邮件订阅
