import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [react()],
  test: {
    globals: false,
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
    fileParallelism: false,
    setupFiles: ['./tests/helpers/vitest.setup.ts'],
    environmentMatchGlobs: [
      ['tests/component/**', 'jsdom'],
    ],
    environment: 'node',
    testTimeout: 20_000,
    hookTimeout: 30_000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json'],
      include: [
        'src/server/routers/**/*.ts',
        'src/lib/order-no.ts',
        'src/lib/auth.ts',
        'src/lib/format.ts',
        'src/components/**/*.tsx',
        'src/app/**/*.tsx',
      ],
      exclude: [
        'src/server/routers/_app.ts',
        'src/app/layout.tsx',
        'src/app/page.tsx',
        'src/app/api/**',
        'src/components/layout/**',
        'src/lib/trpc-client.tsx',
      ],
      thresholds: {
        lines: 80,
        branches: 80,
        functions: 80,
        statements: 80,
      },
    },
    reporters: process.env.CI ? ['default', ['junit', { outputFile: 'junit.xml' }]] : ['default'],
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@tests': fileURLToPath(new URL('./tests', import.meta.url)),
    },
  },
})
