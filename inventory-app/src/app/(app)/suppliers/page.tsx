'use client'
import { useState } from 'react'
import Link from 'next/link'
import { Table, Button, Input, Space, Alert, App as AntdApp } from 'antd'
import { trpc } from '@/lib/trpc-client'
import { translateError, formatDate } from '@/lib/format'
import { makeConfirmDelete } from '@/components/shared/confirm'

export default function SuppliersPage() {
  const { message, modal } = AntdApp.useApp()
  const confirmDelete = makeConfirmDelete(modal)
  const [keyword, setKeyword] = useState('')
  const [serverError, setServerError] = useState<string | null>(null)
  const list = trpc.suppliers.list.useQuery({ keyword })
  const utils = trpc.useUtils()

  const del = trpc.suppliers.delete.useMutation({
    onSuccess: () => {
      message.success('删除成功')
      utils.suppliers.list.invalidate()
    },
    onError: (e) => {
      const msg = translateError(e.message)
      message.error(msg)
      setServerError(msg)
    },
  })

  return (
    <div>
      {serverError && (
        <Alert role="alert" type="error" showIcon message={serverError} closable onClose={() => setServerError(null)} style={{ marginBottom: 16 }} />
      )}
      <Space style={{ marginBottom: 16 }}>
        <Input
          placeholder="搜索供应商名"
          aria-label="搜索"
          data-testid="suppliers-search"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          allowClear
        />
        <Link href="/suppliers/new">
          <Button type="primary" data-testid="suppliers-create">新增供应商</Button>
        </Link>
      </Space>

      <Table
        data-testid="suppliers-list"
        rowKey="id"
        loading={list.isLoading}
        dataSource={list.data ?? []}
        pagination={false}
        onRow={(r) => ({ 'data-testid': `row-${r.id}` } as React.HTMLAttributes<HTMLElement>)}
        columns={[
          { title: '供应商名称', dataIndex: 'name', key: 'name' },
          { title: '联系电话', dataIndex: 'contact', key: 'contact' },
          { title: '地址', dataIndex: 'address', key: 'address' },
          { title: '创建时间', key: 'createdAt', render: (_v, r) => formatDate(r.createdAt, true) },
          {
            title: '操作',
            key: 'action',
            render: (_v, r) => (
              <Space>
                <Link href={`/suppliers/${r.id}/edit`} data-testid={`row-${r.id}-edit`}>
                  编辑
                </Link>
                <a
                  data-testid={`row-${r.id}-delete`}
                  onClick={() => confirmDelete(async () => { await del.mutateAsync({ id: r.id }) })}
                >
                  删除
                </a>
              </Space>
            ),
          },
        ]}
      />
    </div>
  )
}
