import { router } from '../trpc'
import { authRouter } from './auth'
import { categoriesRouter } from './categories'
import { suppliersRouter } from './suppliers'
import { productsRouter } from './products'
import { purchaseOrdersRouter } from './purchase-orders'
import { salesOrdersRouter } from './sales-orders'
import { statsRouter } from './stats'

export const appRouter = router({
  auth: authRouter,
  categories: categoriesRouter,
  suppliers: suppliersRouter,
  products: productsRouter,
  purchaseOrders: purchaseOrdersRouter,
  salesOrders: salesOrdersRouter,
  stats: statsRouter,
})

export type AppRouter = typeof appRouter
