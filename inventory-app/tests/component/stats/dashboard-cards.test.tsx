import { describe, it } from 'vitest'

// Stats UI 主要由 E2E 兜底（见 tests/e2e/stats.e2e.ts），这里只挂一条占位用例，
// 让 `pnpm test:component:stats` 不为空。
describe('stats dashboard cards', () => {
  it.skip('dashboard cards rely on E2E only', () => {})
})
