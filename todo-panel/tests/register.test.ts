import { expect, test } from 'claude-code/testing'
import {
  completionRate,
  currentTodo,
  extractNewTodos,
  formatPanelHeader,
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

test('opens and refreshes a standalone pane after a successful TodoWrite', async ($, on) => {
  const opened: string[] = []
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('command.register', () => ({ value: { command: 'todo-panel' } }))
  on('ui.panes', () => ({ value: [] }))
  on('ui.open', ($, e) => {
    opened.push(e.id)
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
