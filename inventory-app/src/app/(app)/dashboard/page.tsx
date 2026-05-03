'use client'
import { Card, Col, Row, Statistic, Spin, Table } from 'antd'
import { trpc } from '@/lib/trpc-client'
import { formatMoney } from '@/lib/format'

export default function DashboardPage() {
  const overview = trpc.stats.overview.useQuery()

  if (overview.isLoading || !overview.data) return <Spin />
  const o = overview.data

  return (
    <div>
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic
              title="总商品数"
              value={o.totalProducts}
              valueRender={(node) => <span data-testid="stat-total-products">{node}</span>}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic
              title="总库存数"
              value={o.totalQuantity}
              valueRender={(node) => <span data-testid="stat-total-quantity">{node}</span>}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic
              title="总库存价值"
              valueRender={() => <span data-testid="stat-total-value">{formatMoney(o.totalValue)}</span>}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic
              title="预警数量"
              value={o.alertCount}
              valueRender={(node) => <span data-testid="stat-alert-count">{node}</span>}
              valueStyle={o.alertCount > 0 ? { color: '#ff4d4f' } : {}}
            />
          </Card>
        </Col>
      </Row>

      <Card title="周期统计">
        <Table
          rowKey="period"
          pagination={false}
          dataSource={[
            { period: '今日', purchase: o.periodStats.todayPurchase, sales: o.periodStats.todaySales },
            { period: '本周', purchase: o.periodStats.weekPurchase, sales: o.periodStats.weekSales },
            { period: '本月', purchase: o.periodStats.monthPurchase, sales: o.periodStats.monthSales },
          ]}
          columns={[
            { title: '区段', dataIndex: 'period', key: 'period' },
            { title: '进货数量', dataIndex: 'purchase', key: 'purchase' },
            { title: '出货数量', dataIndex: 'sales', key: 'sales' },
          ]}
        />
      </Card>
    </div>
  )
}
