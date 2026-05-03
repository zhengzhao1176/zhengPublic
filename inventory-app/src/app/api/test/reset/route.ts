import { NextResponse } from 'next/server'
import { db } from '@/server/db'
import bcrypt from 'bcryptjs'

export async function POST() {
  if (process.env.NODE_ENV === 'production' || process.env.INV_TEST_API !== '1') {
    return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 })
  }
  await db.stockLog.deleteMany()
  await db.purchaseOrder.deleteMany()
  await db.salesOrder.deleteMany()
  await db.product.deleteMany()
  await db.supplier.deleteMany()
  await db.category.deleteMany()
  await db.user.deleteMany()
  // SQLite autoincrement counters survive deleteMany — reset so IDs start at 1
  // (only if sqlite_sequence exists; ignore if it doesn't yet)
  await db.$executeRawUnsafe('DELETE FROM sqlite_sequence').catch(() => {})
  const passwordHash = await bcrypt.hash('admin123', 10)
  await db.user.create({ data: { username: 'admin', passwordHash } })
  return NextResponse.json({ ok: true })
}
