'use client'
import { useState } from 'react'
import Link from 'next/link'
import { Table, Button, Input, Space, Alert, App as AntdApp } from 'antd'
import { trpc } from '@/lib/trpc-client'
import { translateError, formatDate } from '@/lib/format'
import { makeConfirmDelete } from '@/components/shared/confirm'

export default function CategoriesPage() {
  const { message, modal } = AntdApp.useApp()
  const confirmDelete = makeConfirmDelete(modal)
  const [keyword, setKeyword] = useState('')
  const [serverError, setServerError] = useState<string | null>(null)
  const list = trpc.categories.list.useQuery({ keyword })
  const utils = trpc.useUtils()

  const del = trpc.categories.delete.useMutation({
    onSuccess: () => {
      message.success('删除成功')
      utils.categories.list.invalidate()
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
          placeholder="搜索分类名"
          aria-label="搜索"
          data-testid="categories-search"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          allowClear
        />
        <Link href="/categories/new">
          <Button type="primary" data-testid="categories-create">新增分类</Button>
        </Link>
      </Space>

      <Table
        data-testid="categories-list"
        rowKey="id"
        loading={list.isLoading}
        dataSource={list.data ?? []}
        pagination={false}
        onRow={(r) => ({ 'data-testid': `row-${r.id}` } as React.HTMLAttributes<HTMLElement>)}
        columns={[
          { title: '分类名称', dataIndex: 'name', key: 'name' },
          { title: '描述', dataIndex: 'description', key: 'description' },
          { title: '创建时间', key: 'createdAt', render: (_v, r) => formatDate(r.createdAt, true) },
          {
            title: '操作',
            key: 'action',
            render: (_v, r) => (
              <Space>
                <Link href={`/categories/${r.id}/edit`} data-testid={`row-${r.id}-edit`}>
                  编辑
                </Link>
                <a
                  data-testid={`row-${r.id}-delete`}
                  onClick={() =>
                    confirmDelete(async () => { await del.mutateAsync({ id: r.id }) })
                  }
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
