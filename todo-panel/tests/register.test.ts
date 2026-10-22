import { expect, test } from 'claude-code/testing'
import {
  applyTaskCreate,
  applyTaskGet,
  applyTaskUpdate,
  completionRate,
  currentTodo,
  extractNewTodos,
  formatPanelHeader,
  normalizeTasks,
  normalizeTodos,
} from '../hooks/register'

const sampleTodos = [
  { content: '读取现有 pane 示例', status: 'completed' as const, activeForm: '正在读取现有 pane 示例' },
  { content: '实现 Todo 面板', status: 'in_progress' as const, activeForm: '正在实现 Todo 面板' },
  { content: '运行验证', status: 'pending' as const, activeForm: '正在运行验证' },
]

test('extracts TodoWrite todos from nested and direct successful results', () => {
  expect(extractNewTodos({ result: { newTodos: sampleTodos } })).toEqual(sampleTodos)
  expect(extractNewTodos({ newTodos: sampleTodos })).toEqual(sampleTodos)
  expect(extractNewTodos({ result: { newTodos: sampleTodos }, isError: true })).toBeUndefined()
  expect(extractNewTodos({ deny: 'blocked', newTodos: sampleTodos })).toBeUndefined()
})

test('validates and formats task progress', () => {
  expect(normalizeTodos(sampleTodos)).toEqual(sampleTodos)
  expect(normalizeTodos([{ content: 'bad', status: 'unknown', activeForm: 'bad' }])).toBeUndefined()
  expect(completionRate(sampleTodos)).toBe(33)
  expect(currentTodo(sampleTodos)?.content).toBe('实现 Todo 面板')
  expect(formatPanelHeader(sampleTodos)).toBe('任务进度 · 1/3 · 33%')
})

test('normalizes TaskList tasks and applies Task tool results', () => {
  expect(normalizeTasks({ result: { tasks: [{ id: '1', subject: '任务 A', status: 'pending', blockedBy: [] }] } }))
    .toEqual([{ id: '1', content: '任务 A', status: 'pending', activeForm: '任务 A' }])
  expect(normalizeTasks({ tasks: [{ id: '1', subject: '任务 A', status: 'unknown' }] })).toBeUndefined()

  const created = applyTaskCreate([], { result: { task: { id: '1', subject: '任务 A' } } })
  expect(created).toEqual([{ id: '1', content: '任务 A', status: 'pending', activeForm: '任务 A' }])
  expect(applyTaskCreate(created!, { result: { task: { id: '1', subject: '任务 A' } } })).toHaveLength(1)
  expect(applyTaskCreate([], { result: { task: { id: 1, subject: 'bad' } } })).toBeUndefined()

  const started = applyTaskUpdate(created!, { taskId: '1', status: 'in_progress' }, {
    result: { success: true, taskId: '1', updatedFields: ['status'], statusChange: { from: 'pending', to: 'in_progress' } },
  })
  expect(started?.[0]).toMatchObject({ id: '1', status: 'in_progress', content: '任务 A' })

  const renamed = applyTaskUpdate(started!, { taskId: '1', subject: '任务 B' }, {
    result: { success: true, taskId: '1', updatedFields: ['subject'] },
  })
  expect(renamed?.[0]).toEqual({ id: '1', content: '任务 B', status: 'in_progress', activeForm: '任务 B' })

  expect(applyTaskUpdate(renamed!, { taskId: '1', status: 'deleted' }, {
    result: { success: true, taskId: '1', updatedFields: ['status'], statusChange: { from: 'in_progress', to: 'deleted' } },
  })).toEqual([])
  expect(applyTaskUpdate(renamed!, { taskId: '1', status: 'completed' }, { result: { success: false, taskId: '1', updatedFields: [] } })).toBeUndefined()
  expect(applyTaskUpdate(renamed!, { taskId: 'missing', status: 'completed' }, { result: { success: true, taskId: 'missing', updatedFields: ['status'] } })).toBeUndefined()

  const fetched = applyTaskGet(renamed!, { result: { task: { id: '2', subject: '任务 C', status: 'pending', blockedBy: [] } } })
  expect(fetched?.map(item => item.id)).toEqual(['1', '2'])
  const refreshed = applyTaskGet(fetched!, { result: { task: { id: '1', subject: '任务 B', status: 'completed', blockedBy: [] } } })
  expect(refreshed?.[0]).toMatchObject({ status: 'completed' })
  expect(applyTaskGet(refreshed!, { result: { task: null } })).toBeUndefined()
})

test('opens and refreshes a standalone pane after a successful TodoWrite', async ($, on) => {
  const opened: string[] = []
  let paneOpen = false
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('command.register', () => ({ value: { command: 'todo-panel' } }))
  on('ui.panes', () => ({
    value: paneOpen ? [{ id: 'todo-panel', title: 'Todo 任务', isShown: true, isFocused: false, isPlaced: true }] : [],
  }))
  on('ui.open', ($, e) => {
    opened.push(e.id)
    paneOpen = true
    return { value: { isPlaced: true } }
  })
  on('tool.call', { tool: 'TodoWrite' }, () => ({ result: { newTodos: sampleTodos } }))

  await $.session.start({ cwd: '/work/project', surface: 'terminal', isInteractive: true })
  await $.tool.call({
    tool: 'TodoWrite',
    tool_use_id: 'todo-write-1',
    todos: sampleTodos,
  })

  expect(opened).toEqual(['todo-panel'])
  const ui = await $.ui.mount({
    plugin: 'todo-panel',
    surface: 'terminal',
    component: 'Pane',
    requestId: 'todo-panel',
    props: {
      title: 'Todo 任务',
      isFocused: false,
      bodyColumns: 72,
      placement: 'dock',
      scroll: { offset: 0, bodyRows: 30 },
      view: {},
    },
  })
  expect(await ui.find({ type: 'Text', text: /任务进度 · 1\/3 · 33%/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /当前项：实现 Todo 面板/ })).toBeDefined()
  await ui.unmount()
})

test('tracks TaskCreate, TaskUpdate and TaskList calls', async ($, on) => {
  const opened: string[] = []
  let paneOpen = false
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('command.register', () => ({ value: { command: 'todo-panel' } }))
  on('ui.panes', () => ({
    value: paneOpen ? [{ id: 'todo-panel', title: 'Todo 任务', isShown: true, isFocused: false, isPlaced: true }] : [],
  }))
  on('ui.open', ($, e) => {
    opened.push(e.id)
    paneOpen = true
    return { value: { isPlaced: true } }
  })
  on('tool.call', { tool: 'TaskCreate' }, () => ({ result: { task: { id: '1', subject: '实现 Task 面板' } } }))
  on('tool.call', { tool: 'TaskUpdate' }, () => ({
    result: { success: true, taskId: '1', updatedFields: ['status'], statusChange: { from: 'pending', to: 'in_progress' } },
  }))
  on('tool.call', { tool: 'TaskList' }, () => ({
    result: {
      tasks: [
        { id: '1', subject: '实现 Task 面板', status: 'in_progress', blockedBy: [] },
        { id: '2', subject: '运行验证', status: 'pending', blockedBy: [] },
      ],
    },
  }))

  await $.session.start({ cwd: '/work/project', surface: 'terminal', isInteractive: true })
  await $.tool.call({ tool: 'TaskCreate', subject: '实现 Task 面板', description: '实现面板', activeForm: '正在实现 Task 面板' })
  await $.tool.call({ tool: 'TaskUpdate', taskId: '1', status: 'in_progress' })
  await $.tool.call({ tool: 'TaskList' })

  expect(opened).toEqual(['todo-panel'])
  const ui = await $.ui.mount({
    plugin: 'todo-panel',
    surface: 'terminal',
    component: 'Pane',
    requestId: 'todo-panel',
    props: {
      title: 'Todo 任务',
      isFocused: false,
      bodyColumns: 72,
      placement: 'dock',
      scroll: { offset: 0, bodyRows: 30 },
      view: {},
    },
  })
  expect(await ui.find({ type: 'Text', text: /任务进度 · 0\/2 · 0%/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /当前项：实现 Task 面板/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /运行验证/ })).toBeDefined()
  await ui.unmount()
})

test('supports clear and close commands', async ($, on) => {
  let closed = false
  on('command.register', () => ({ value: { command: 'todo-panel' } }))
  on('ui.panes', () => ({ value: [] }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.close', () => {
    closed = true
    return { value: undefined }
  })

  const clear = await $.command.run({
    command: 'todo-panel', args: 'clear', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 },
  })
  expect(clear.text).toBe('Todo 任务已清空。')

  const close = await $.command.run({
    command: 'todo-panel', args: 'close', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 },
  })
  expect(close.text).toBe('Todo 面板已关闭。')
  expect(closed).toBe(true)
})
