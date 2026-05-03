'use client'
import { useState } from 'react'
import { Card, Select, DatePicker, Button, Space, Spin, Empty } from 'antd'
import dayjs from 'dayjs'
import { trpc } from '@/lib/trpc-client'

const Line = require('@ant-design/plots').Line

export default function TrendsPage() {
  const [productId, setProductId] = useState<number | undefined>(undefined)
  const [range, setRange] = useState<[dayjs.Dayjs, dayjs.Dayjs]>([
    dayjs().subtract(30, 'day'),
    dayjs(),
  ])
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitted, setSubmitted] = useState<{
    productId: number
    dateFrom: string
    dateTo: string
  } | null>(null)

  const products = trpc.products.list.useQuery({ stockStatus: 'ALL', page: 1, pageSize: 50 })

  const trend = trpc.stats.trend.useQuery(
    submitted ?? { productId: 0, dateFrom: '', dateTo: '' },
    { enabled: submitted != null },
  )

  function onQuery() {
    const e: Record<string, string> = {}
    if (!productId) e['productId'] = '请选择商品'
    if (!range || !range[0] || !range[1]) e['range'] = '请选择日期范围'
    else if (range[0].isAfter(range[1])) e['range'] = '开始日期不能晚于结束日期'
    setErrors(e)
    if (Object.keys(e).length > 0) return
    setSubmitted({
      productId: productId!,
      dateFrom: range[0]!.startOf('day').toISOString(),
      dateTo: range[1]!.endOf('day').toISOString(),
    })
  }

  return (
    <Card title="库存趋势">
      <Space style={{ marginBottom: 16 }} wrap>
        <Select
          aria-label="商品"
          placeholder="选择商品"
          showSearch
          optionFilterProp="label"
          allowClear
          style={{ minWidth: 220 }}
          options={products.data?.items.map((p) => ({ label: `${p.code} - ${p.name}`, value: p.id })) ?? []}
          value={productId}
          onChange={setProductId}
        />
        <DatePicker.RangePicker
          aria-label="日期范围"
          value={range}
          onChange={(v) => setRange(v as [dayjs.Dayjs, dayjs.Dayjs])}
        />
        <Button type="primary" onClick={onQuery}>查询</Button>
      </Space>
      {errors['productId'] && <p role="alert" style={{ color: '#ff4d4f' }}>{errors['productId']}</p>}
      {errors['range'] && <p role="alert" style={{ color: '#ff4d4f' }}>{errors['range']}</p>}
      <div data-testid="stat-trend-chart" style={{ minHeight: 320 }}>
        {!submitted ? (
          <Empty data-testid="stats-trends-empty" description="选择商品并查询" />
        ) : trend.isLoading ? (
          <Spin />
        ) : trend.data && trend.data.length > 0 ? (
          <Line
            data={trend.data}
            xField="date"
            yField="quantity"
            point={{ shape: 'circle' }}
          />
        ) : (
          <Empty description="暂无数据" />
        )}
      </div>
    </Card>
  )
}
