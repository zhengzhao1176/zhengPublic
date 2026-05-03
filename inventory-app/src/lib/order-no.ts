import dayjs from 'dayjs'
import type { PrismaClient, Prisma } from '@prisma/client'

type Tx = Prisma.TransactionClient | PrismaClient

export async function nextPurchaseOrderNo(db: Tx, date: Date): Promise<string> {
  return generate(db, 'RH', date, 'purchaseOrder', 'purchaseDate')
}

export async function nextSalesOrderNo(db: Tx, date: Date): Promise<string> {
  return generate(db, 'CH', date, 'salesOrder', 'salesDate')
}

async function generate(
  db: Tx,
  prefix: 'RH' | 'CH',
  date: Date,
  table: 'purchaseOrder' | 'salesOrder',
  dateField: 'purchaseDate' | 'salesDate',
): Promise<string> {
  const dayStr = dayjs(date).format('YYYYMMDD')
  const start = dayjs(date).startOf('day').toDate()
  const end = dayjs(date).endOf('day').toDate()
  // Dynamically access prisma model — both delegates expose the same `.count` shape.
  const delegate = (db as unknown as Record<string, { count: (args: unknown) => Promise<number> }>)[table]!
  const count = await delegate.count({
    where: { [dateField]: { gte: start, lte: end } },
  })
  const seq = String(count + 1).padStart(4, '0')
  return `${prefix}${dayStr}${seq}`
}
