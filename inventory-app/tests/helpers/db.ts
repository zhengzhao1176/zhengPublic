import { PrismaClient } from '@prisma/client'
import { execSync } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import bcrypt from 'bcryptjs'

export function makeTestDb(): PrismaClient {
  const dir = mkdtempSync(join(tmpdir(), 'inv-test-'))
  const url = `file:${dir}/test.db`
  process.env.DATABASE_URL = url
  execSync('pnpm prisma db push --skip-generate --force-reset', {
    env: process.env,
    stdio: 'pipe',
  })
  return new PrismaClient({ datasources: { db: { url } } })
}

export async function resetAll(db: PrismaClient) {
  await db.stockLog.deleteMany()
  await db.purchaseOrder.deleteMany()
  await db.salesOrder.deleteMany()
  await db.product.deleteMany()
  await db.supplier.deleteMany()
  await db.category.deleteMany()
  await db.user.deleteMany()
}

export async function seedAdmin(db: PrismaClient) {
  const passwordHash = await bcrypt.hash('admin123', 10)
  return db.user.upsert({
    where: { username: 'admin' },
    update: {},
    create: { username: 'admin', passwordHash },
  })
}

let seqCount = 0
export async function seedCategory(
  db: PrismaClient,
  name = `Cat-${Date.now()}-${++seqCount}`,
) {
  return db.category.create({ data: { name } })
}

export async function seedSupplier(
  db: PrismaClient,
  name = `Sup-${Date.now()}-${++seqCount}`,
) {
  return db.supplier.create({ data: { name } })
}

export async function seedProduct(
  db: PrismaClient,
  overrides: Partial<{
    code: string
    name: string
    categoryId: number
    description: string
    costPrice: number
    sellPrice: number
    quantity: number
    unit: string
    supplierId: number
    minStock: number
    maxStock: number
  }> = {},
) {
  const cat = overrides.categoryId
    ? { id: overrides.categoryId }
    : await seedCategory(db)
  const sup = overrides.supplierId
    ? { id: overrides.supplierId }
    : await seedSupplier(db)
  const data = {
    code: overrides.code ?? `P-${Date.now()}-${++seqCount}`,
    name: overrides.name ?? 'Widget',
    categoryId: cat.id,
    costPrice: overrides.costPrice ?? 10,
    sellPrice: overrides.sellPrice ?? 20,
    quantity: overrides.quantity ?? 100,
    unit: overrides.unit ?? '件',
    supplierId: sup.id,
    minStock: overrides.minStock ?? 10,
    maxStock: overrides.maxStock ?? 1000,
    ...(overrides.description !== undefined ? { description: overrides.description } : {}),
  }
  return db.product.create({ data })
}
