import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object'
}

/** 取出工具结果主体；拒绝、错误和未包装的结果都归一为对象或 undefined。 */
function unwrapped(value: unknown): Record<string, unknown> | undefined {
  if (!isRecord(value) || 'deny' in value || value.isError === true) return undefined
  return isRecord(value.result) ? value.result : value
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

/** Reads TodoWrite's successful output from either the typed result or a direct result shape. */
export function extractNewTodos(value: unknown): TodoItem[] | undefined {
  return normalizeTodos(unwrapped(value)?.newTodos)
}

/** TaskList 的整表结果；任务顺序保持宿主返回顺序。 */
export function normalizeTasks(value: unknown): TodoItem[] | undefined {
  const result = unwrapped(value)
  if (!result || !Array.isArray(result.tasks)) return undefined

  const normalized: TodoItem[] = []
  for (const task of result.tasks) {
    if (!isRecord(task) || typeof task.id !== 'string' || typeof task.subject !== 'string' || !isTodoStatus(task.status)) {
      return undefined
    }
    normalized.push({ id: task.id, content: task.subject, status: task.status, activeForm: task.subject })
  }
  return normalized
}

/** TaskCreate 只返回 id 和标题，新任务按 pending 追加。 */
export function applyTaskCreate(items: readonly TodoItem[], value: unknown): TodoItem[] | undefined {
  const result = unwrapped(value)
  const task = result && isRecord(result.task) ? result.task : undefined
  if (!task || typeof task.id !== 'string' || typeof task.subject !== 'string') return undefined
  if (items.some(item => item.id === task.id)) return [...items]
  return [...items, { id: task.id, content: task.subject, status: 'pending', activeForm: task.subject }]
}

/**
 * TaskUpdate 的结果只带 taskId 与 statusChange，修改内容需读输入。
 * `status: 'deleted'` 表示从面板移除；未知 id 不新增占位项。
 */
export function applyTaskUpdate(
  items: readonly TodoItem[],
  input: unknown,
  value: unknown,
): TodoItem[] | undefined {
  const result = unwrapped(value)
  if (!result || result.success !== true) return undefined

  const record = isRecord(input) ? input : {}
  const taskId = typeof result.taskId === 'string'
    ? result.taskId
    : typeof record.taskId === 'string' ? record.taskId : undefined
  if (!taskId || !items.some(item => item.id === taskId)) return undefined

  const rawStatus = record.status ?? (isRecord(result.statusChange) ? result.statusChange.to : undefined)
  if (rawStatus === 'deleted') return items.filter(item => item.id !== taskId)

  const status = isTodoStatus(rawStatus) ? rawStatus : undefined
  const subject = typeof record.subject === 'string' ? record.subject : undefined
  const activeForm = typeof record.activeForm === 'string' ? record.activeForm : subject

  return items.map(item => item.id === taskId
    ? {
        ...item,
        status: status ?? item.status,
        content: subject ?? item.content,
        activeForm: activeForm ?? item.activeForm,
      }
    : item)
}

/** TaskGet 返回单个任务的完整快照，已知 id 就地更新，未知 id 追加。 */
export function applyTaskGet(items: readonly TodoItem[], value: unknown): TodoItem[] | undefined {
  const result = unwrapped(value)
  const task = result && isRecord(result.task) ? result.task : undefined
  if (!task || typeof task.id !== 'string' || typeof task.subject !== 'string') return undefined

  const item: TodoItem = {
    id: task.id,
    content: task.subject,
    status: isTodoStatus(task.status) ? task.status : 'pending',
    activeForm: typeof task.activeForm === 'string' ? task.activeForm : task.subject,
  }
  return items.some(existing => existing.id === task.id)
    ? items.map(existing => existing.id === task.id ? item : existing)
    : [...items, item]
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

function renderPanel($: EngineInterface, e: any, items: readonly TodoItem[]): any {
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
      key: `todo-${item.id ?? index}`,
      color: item.status === 'completed' ? '#50dc8c' : item.status === 'in_progress' ? '#50c8ff' : '#d7dce2',
      wrap: 'truncate-end',
      children: [`${STATUS_ICONS[item.status]} ${item.content} · ${STATUS_LABELS[item.status]}`],
    })))
  }

  return Box({ flexDirection: 'column', children })
}

async function openPane($: EngineInterface): Promise<void> {
  const existing = await $.ui.panes()
  if (existing.some(pane => pane.id === PANE_ID)) return

  const result = await $.ui.open({ id: PANE_ID, title: 'Todo 任务' })
  if (!result.isPlaced) $.ui.toast('Todo 面板将在终端宽度足够时显示。')
}

/** 以当前快照为基础应用一次变更；返回 undefined 表示结果不可用，保持原状态。 */
async function commit($: EngineInterface, change: (items: readonly TodoItem[]) => TodoItem[] | undefined): Promise<void> {
  const next = change(await read($, todos))
  if (!next) return
  await update($, todos, () => next)
  if (next.length > 0) await openPane($)
  $.ui.invalidate('ui.render')
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

  // 新的 Task 工具是带 id 的任务系统；TodoWrite 作为旧接口继续兼容。
  on('tool.call', { tool: 'TaskList' }, async ($, e, next) => {
    const result = await next(e)
    if (!e.agentId) await commit($, () => normalizeTasks(result))
    return result
  })

  on('tool.call', { tool: 'TaskCreate' }, async ($, e, next) => {
    const result = await next(e)
    if (!e.agentId) await commit($, items => applyTaskCreate(items, result))
    return result
  })

  on('tool.call', { tool: 'TaskUpdate' }, async ($, e, next) => {
    const result = await next(e)
    if (!e.agentId) await commit($, items => applyTaskUpdate(items, e, result))
    return result
  })

  on('tool.call', { tool: 'TaskGet' }, async ($, e, next) => {
    const result = await next(e)
    if (!e.agentId) await commit($, items => applyTaskGet(items, result))
    return result
  })

  on('tool.call', { tool: 'TodoWrite' }, async ($, e, next) => {
    const result = await next(e)
    if (e.agentId) return result
    await commit($, () => extractNewTodos(result))
    return result
  })
}
