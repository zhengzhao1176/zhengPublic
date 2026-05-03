import { PrismaClient } from '@prisma/client'
import { execSync } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export function makeTestDb() {
  const dir = mkdtempSync(join(tmpdir(), 'inv-test-'))
  const url = `file:${dir}/test.db`
  process.env.DATABASE_URL = url
  execSync('pnpm prisma db push --skip-generate --force-reset', {
    env: process.env,
    stdio: 'pipe',
  })
  return new PrismaClient({ datasources: { db: { url } } })
}

export async function reset(db: PrismaClient) {
  await db.product.deleteMany()
  await db.supplier.deleteMany()
  await db.category.deleteMany()
}

export async function seedCategory(db: PrismaClient, name = `Cat-${Date.now()}-${Math.random()}`) {
  return db.category.create({ data: { name } })
}

export async function seedSupplier(db: PrismaClient, name = `Sup-${Date.now()}-${Math.random()}`) {
  return db.supplier.create({ data: { name } })
}
