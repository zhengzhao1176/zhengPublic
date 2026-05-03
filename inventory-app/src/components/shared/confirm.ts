import type { ModalFuncProps } from 'antd'

type ModalApi = { confirm: (props: ModalFuncProps) => unknown }

const okBtn = { 'data-testid': 'modal-confirm' } as never
const cancelBtn = { 'data-testid': 'modal-cancel' } as never

/** Returns a confirmDelete bound to the modal instance from `App.useApp()`. */
export function makeConfirmDelete(modal: ModalApi) {
  return function confirmDelete(
    onOk: () => void | Promise<void>,
    opts: { title?: string; content?: string } = {},
  ) {
    modal.confirm({
      title: opts.title ?? '确认删除？',
      content: opts.content ?? '删除后不可恢复，是否继续？',
      okText: '确认',
      cancelText: '取消',
      okButtonProps: okBtn,
      cancelButtonProps: cancelBtn,
      onOk,
    })
  }
}

export function makeConfirmAction(modal: ModalApi) {
  return function confirmAction(
    onOk: () => void | Promise<void>,
    opts: { title: string; content: string },
  ) {
    modal.confirm({
      title: opts.title,
      content: opts.content,
      okText: '确认',
      cancelText: '取消',
      okButtonProps: okBtn,
      cancelButtonProps: cancelBtn,
      onOk,
    })
  }
}
