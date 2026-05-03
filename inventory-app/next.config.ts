import type { NextConfig } from 'next'

const config: NextConfig = {
  reactStrictMode: true,
  // Antd 配色 / 兼容 React 18
  transpilePackages: ['antd', '@ant-design/icons', '@ant-design/plots', 'rc-util', 'rc-pagination', 'rc-picker'],
}

export default config
