import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const db = new PrismaClient()

async function main() {
  const passwordHash = await bcrypt.hash('admin123', 10)
  await db.user.upsert({
    where: { username: 'admin' },
    update: {},
    create: { username: 'admin', passwordHash },
  })

  if (process.env.NODE_ENV !== 'test') {
    const cat = await db.category.upsert({
      where: { name: '电子产品' },
      update: {},
      create: { name: '电子产品', description: '默认演示分类' },
    })
    const sup = await db.supplier.upsert({
      where: { name: '默认供应商' },
      update: {},
      create: { name: '默认供应商' },
    })
    await db.product.upsert({
      where: { code: 'DEMO001' },
      update: {},
      create: {
        code: 'DEMO001',
        name: '示例商品',
        categoryId: cat.id,
        costPrice: 10,
        sellPrice: 20,
        quantity: 100,
        unit: '件',
        supplierId: sup.id,
        minStock: 10,
        maxStock: 1000,
      },
    })
  }
}

main()
  .then(() => console.log('seed done'))
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
