export {
  makeTestDb,
  resetAll,
  seedAdmin,
  seedCategory,
  seedSupplier,
  seedProduct,
} from './db'

import type { PrismaClient } from '@prisma/client'
import { resetAll, seedAdmin, seedCategory, seedSupplier } from './db'

export async function setupBasic(db: PrismaClient) {
  await resetAll(db)
  const user = await seedAdmin(db)
  const cat = await seedCategory(db, '电子产品')
  const sup = await seedSupplier(db, '默认供应商')
  return { user, cat, sup }
}
