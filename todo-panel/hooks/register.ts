import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { TodoItem, TodoStatus } from '../types'

const PANE_ID = 'todo-panel'
const todos = atom({ plugin: 'todo-panel', key: 'todos' } as const, [] as TodoItem[])

const STATUS_LABELS: Record<TodoStatus, string> = {
  pending: '待处理',
  in_progress: '进行中',
  completed: '已完成',
}

const STATUS_ICONS: Record<TodoStatus, string> = {
  pending: '○',
  in_progress: '●',
  completed: '✓',
}

function isTodoStatus(value: unknown): value is TodoStatus {
  return value === 'pending' || value === 'in_progress' || value === 'completed'
}

export function normalizeTodos(value: unknown): TodoItem[] | undefined {
  if (!Array.isArray(value)) return undefined

  const normalized: TodoItem[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object') return undefined
    const record = item as Record<string, unknown>
    if (typeof record.content !== 'string' || !isTodoStatus(record.status) || typeof record.activeForm !== 'string') {
      return undefined
    }
    normalized.push({
      content: record.content,
      status: record.status,
      activeForm: record.activeForm,
    })
  }
  return normalized
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object'
}

/** Reads TodoWrite's successful output from either the typed result or a direct result shape. */
export function extractNewTodos(value: unknown): TodoItem[] | undefined {
  if (!isRecord(value) || 'deny' in value || value.isError === true) return undefined

  const nested = normalizeTodos(value.result && isRecord(value.result) ? value.result.newTodos : undefined)
  if (nested) return nested
  return normalizeTodos(value.newTodos)
}

export function completionRate(items: readonly TodoItem[]): number {
  if (items.length === 0) return 0
  return Math.round((items.filter(item => item.status === 'completed').length / items.length) * 100)
}

export function currentTodo(items: readonly TodoItem[]): TodoItem | undefined {
  return items.find(item => item.status === 'in_progress') ?? items.find(item => item.status === 'pending')
}

export function formatPanelHeader(items: readonly TodoItem[]): string {
  const completed = items.filter(item => item.status === 'completed').length
  return `任务进度 · ${completed}/${items.length} · ${completionRate(items)}%`
}

function renderPanel($: Parameters<Register>[0] extends never ? never : any, e: any, items: readonly TodoItem[]): any {
  const { Box, Text } = $.ui.resolve(e)
  const current = currentTodo(items)
  const children: any[] = [
    Text({ color: '#50c8ff', weight: 'bold', children: [formatPanelHeader(items)] }),
    Text({
      color: '#ffd700',
      wrap: 'truncate-end',
      children: [current ? `当前项：${current.content}` : '当前项：无'],
    }),
  ]

  if (items.length === 0) {
    children.push(Text({ color: '#8791a0', children: ['暂无任务'] }))
  } else {
    children.push(...items.map((item, index) => Text({
      key: `todo-${index}`,
      color: item.status === 'completed' ? '#50dc8c' : item.status === 'in_progress' ? '#50c8ff' : '#d7dce2',
      wrap: 'truncate-end',
      children: [`${STATUS_ICONS[item.status]} ${item.content} · ${STATUS_LABELS[item.status]}`],
    })))
  }

  return Box({ flexDirection: 'column', children })
}

async function openPane($: any): Promise<void> {
  const existing = await $.ui.panes()
  if (existing.some((pane: { id: string }) => pane.id === PANE_ID)) return

  const result = await $.ui.open({ id: PANE_ID, title: 'Todo 任务' })
  if (!result.isPlaced) $.ui.toast('Todo 面板将在终端宽度足够时显示。')
}

export const register: Register = on => {
  on('ui.render', { component: 'Pane', requestId: PANE_ID }, async ($, e) => {
    const items = await read($, todos)
    return renderPanel($, e, items)
  })

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'todo-panel',
      description: '打开 Todo 任务面板；可用 clear 清空、close 关闭。',
      argumentHint: '[clear|close]',
    })
    return next(e)
  })

  on('command.run', { command: 'todo-panel' }, async ($, e) => {
    const command = e.args.trim().toLowerCase()
    if (command === 'clear') {
      await update($, todos, () => [])
      $.ui.invalidate('ui.render')
      return { text: 'Todo 任务已清空。' }
    }
    if (command === 'close') {
      await $.ui.close({ id: PANE_ID })
      return { text: 'Todo 面板已关闭。' }
    }

    await openPane($)
    return { text: 'Todo 面板已打开。' }
  })

  on('tool.call', { tool: 'TodoWrite' }, async ($, e, next) => {
    const result = await next(e)
    const nextTodos = extractNewTodos(result)
    if (nextTodos) {
      await update($, todos, () => nextTodos)
      await openPane($)
      $.ui.invalidate('ui.render')
    }
    return result
  })
}
