import type { ReactNode } from 'react'
import { ConfigProvider, App as AntdApp } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import 'antd/dist/reset.css'
import { TRPCProvider } from '@/lib/trpc-client'

export const metadata = { title: '库存管理系统' }

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN">
      <body suppressHydrationWarning>
        <TRPCProvider>
          <ConfigProvider locale={zhCN} button={{ autoInsertSpace: false }}>
            <AntdApp>{children}</AntdApp>
          </ConfigProvider>
        </TRPCProvider>
      </body>
    </html>
  )
}
