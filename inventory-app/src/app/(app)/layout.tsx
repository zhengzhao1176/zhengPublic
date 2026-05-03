'use client'
import { Layout, Menu, Spin, App as AntdApp } from 'antd'
import Link from 'next/link'
import { useRouter, usePathname } from 'next/navigation'
import { useEffect } from 'react'
import { trpc } from '@/lib/trpc-client'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname() ?? '/dashboard'
  const me = trpc.auth.me.useQuery(undefined, { staleTime: 60_000 })

  useEffect(() => {
    if (me.isFetched && me.data === null) {
      const redirect = encodeURIComponent(pathname)
      router.replace(`/login?redirect=${redirect}`)
    }
  }, [me.isFetched, me.data, router, pathname])

  if (!me.isFetched || !me.data) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <Spin />
      </div>
    )
  }
  const user = me.data

  // Determine selected menu key by pathname prefix
  const selected =
    pathname.startsWith('/products') ? 'products' :
    pathname.startsWith('/categories') ? 'categories' :
    pathname.startsWith('/suppliers') ? 'suppliers' :
    pathname.startsWith('/purchase-orders') ? 'purchase-orders' :
    pathname.startsWith('/sales-orders') ? 'sales-orders' :
    pathname.startsWith('/stats/alerts') ? 'stats-alerts' :
    pathname.startsWith('/stats/trends') ? 'stats-trends' :
    pathname.startsWith('/stats/report') ? 'stats-report' :
    'dashboard'

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Layout.Sider width={220} theme="dark">
        <div style={{ color: '#fff', textAlign: 'center', padding: '16px 0', fontSize: 16, fontWeight: 600 }}>
          库存管理系统
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[selected]}
          defaultOpenKeys={['stats']}
          items={[
            { key: 'dashboard', label: <Link href="/dashboard" data-testid="nav-dashboard">仪表板</Link> },
            { key: 'products', label: <Link href="/products" data-testid="nav-products">商品管理</Link> },
            { key: 'categories', label: <Link href="/categories" data-testid="nav-categories">分类管理</Link> },
            { key: 'suppliers', label: <Link href="/suppliers" data-testid="nav-suppliers">供应商管理</Link> },
            { key: 'purchase-orders', label: <Link href="/purchase-orders" data-testid="nav-purchase-orders">进货管理</Link> },
            { key: 'sales-orders', label: <Link href="/sales-orders" data-testid="nav-sales-orders">出货管理</Link> },
            {
              key: 'stats',
              label: '库存统计',
              children: [
                { key: 'stats-alerts', label: <Link href="/stats/alerts" data-testid="nav-stats-alerts">库存预警</Link> },
                { key: 'stats-trends', label: <Link href="/stats/trends" data-testid="nav-stats-trends">库存趋势</Link> },
                { key: 'stats-report', label: <Link href="/stats/report" data-testid="nav-stats-report">库存报表</Link> },
              ],
            },
          ]}
        />
      </Layout.Sider>
      <Layout>
        <Layout.Header
          style={{
            background: '#fff',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 12,
            alignItems: 'center',
            paddingRight: 24,
          }}
        >
          <span>{user.username}</span>
          <LogoutButton />
        </Layout.Header>
        <Layout.Content style={{ padding: 24, background: '#f5f5f5' }}>{children}</Layout.Content>
      </Layout>
    </Layout>
  )
}

function LogoutButton() {
  const router = useRouter()
  const utils = trpc.useUtils()
  const { message } = AntdApp.useApp()
  const logout = trpc.auth.logout.useMutation({
    onSuccess: async () => {
      message.success('已退出登录')
      await utils.auth.me.reset()
      router.replace('/login')
    },
  })
  return (
    <button
      data-testid="header-logout"
      onClick={() => logout.mutate()}
      style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#1677ff' }}
    >
      退出登录
    </button>
  )
}
