import dayjs from 'dayjs'

export function round2(n: number): number {
  return Math.round(n * 100) / 100
}

export function formatMoney(n: number): string {
  return `¥${(Math.round(n * 100) / 100).toFixed(2)}`
}

export function formatDate(d: Date | string | null | undefined, withTime = false): string {
  if (!d) return ''
  return dayjs(d).format(withTime ? 'YYYY-MM-DD HH:mm:ss' : 'YYYY-MM-DD')
}

export function translateError(message: string): string {
  const map: Record<string, string> = {
    UNAUTHORIZED: '登录已失效，请重新登录',
    FORBIDDEN: '没有操作权限',
    INVALID_CREDENTIALS: '用户名或密码错误',
    CODE_EXISTS: '商品编码已存在',
    CATEGORY_NOT_FOUND: '所选分类不存在',
    SUPPLIER_NOT_FOUND: '所选供应商不存在',
    PRODUCT_NOT_FOUND: '商品不存在',
    PRODUCT_HAS_STOCK: '库存量大于0的商品不能删除，请先清空库存',
    CATEGORY_IN_USE: '该分类下还有商品，不能删除',
    SUPPLIER_IN_USE: '该供应商被商品或订单引用，不能删除',
    CATEGORY_NAME_EXISTS: '分类名称已存在',
    SUPPLIER_NAME_EXISTS: '供应商名称已存在',
    INSUFFICIENT_STOCK: '库存不足，无法出货',
    EXCEEDS_MAX_STOCK: '进货后将超过最大库存容量',
    ORDER_NOT_FOUND: '单据不存在',
    ORDER_NOT_DRAFT: '仅草稿状态的单据可以编辑或删除',
    ORDER_ALREADY_CONFIRMED: '该单据已确认，不能重复操作',
  }
  return map[message] ?? '操作失败'
}
