import { expect, test } from 'claude-code/testing'
import { formatLogEntry, formatPanelHeader, isFinishedAgentStatus } from '../hooks/register'

const paneProps = {
  title: 'Subagents',
  isFocused: false,
  bodyColumns: 72,
  placement: 'dock',
  scroll: { offset: 0, bodyRows: 30 },
  view: {},
} as const

test('recognizes terminal Subagent statuses', () => {
  expect(isFinishedAgentStatus('completed')).toBe(true)
  expect(isFinishedAgentStatus('failed')).toBe(true)
  expect(isFinishedAgentStatus('running')).toBe(false)
})

test('formats the panel header with tracked and running counts', () => {
  expect(formatPanelHeader(3, 2)).toBe('Subagents · 2 running · 3 tracked')
})

test('formats execution log entries with readable markers', () => {
  expect(formatLogEntry({ kind: 'tool', text: 'Read README.md' })).toBe('▶ Read README.md')
  expect(formatLogEntry({ kind: 'result', text: 'done' })).toBe('✓ done')
})

test('keeps a completed subagent available for transcript review', async ($, on) => {
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('command.register', () => ({ value: { command: 'subagent-view' } }))
  on('agent.list', () => ({ value: [] }))
  on('agent.spawn', () => ({ model: 'Test Model', agentId: 'agent-1' }))
  on('turn.complete', ($, e) => ({ text: e.answer }))
  on('ui.open', () => ({ value: { isPlaced: true } }))

  await $.session.start({ cwd: '/work/project', surface: 'terminal', isInteractive: true })
  await $.agent.spawn({ prompt: 'finish the test', description: 'test task' })
  const ui = await $.ui.mount({
    plugin: 'subagent-split-view',
    surface: 'terminal',
    component: 'Pane',
    requestId: 'subagent-split-view',
    props: paneProps,
  })

  expect(await ui.find({ type: 'Text', text: /Subagents · 1 running · 1 tracked/ })).toBeDefined()
  await $.turn.complete({
    agentId: 'agent-1',
    turnId: 'agent-turn',
    answer: 'done',
    durationMs: 10,
    isAborted: false,
    reason: 'answer',
  })
  expect(await ui.find({ type: 'Text', text: /Subagents · 0 running · 1 tracked/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /已结束，可点击「查看转录」/ })).toBeDefined()
  const agentOneButton = ['view', 'agent', 'agent-1'].join('-')
  expect(await ui.find({ type: 'Button', key: agentOneButton })).toBeDefined()
  await ui.unmount()
})

test('opens the native transcript from an explicit per-agent button', async ($, on) => {
  const views: Array<{ agentId?: string }> = []
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('command.register', () => ({ value: { command: 'subagent-view' } }))
  on('agent.list', () => ({ value: [] }))
  on('agent.spawn', () => ({ model: 'Test Model', agentId: 'agent-detail' }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.view', ($, e) => {
    views.push('agentId' in e ? { agentId: e.agentId } : {})
    return { value: {} }
  })

  await $.session.start({ cwd: '/work/project', surface: 'terminal', isInteractive: true })
  await $.agent.spawn({ prompt: 'inspect the project', description: 'detail test' })
  const ui = await $.ui.mount({
    plugin: 'subagent-split-view',
    surface: 'terminal',
    component: 'Pane',
    requestId: 'subagent-split-view',
    props: paneProps,
  })

  expect(await ui.find({ type: 'Button', key: 'view-agent-agent-detail' })).toBeDefined()
  expect(await ui.find({ type: 'Button', key: 'view-main-transcript' })).toBeDefined()
  await ui.press({ key: 'view-agent-agent-detail' })
  await ui.press({ key: 'view-main-transcript' })
  expect(views).toEqual([{ agentId: 'agent-detail' }, {}])
  await ui.unmount()
})

test('clears tracked agents from the pane', async ($, on) => {
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('command.register', () => ({ value: { command: 'subagent-view' } }))
  on('agent.list', () => ({ value: [] }))
  on('agent.spawn', () => ({ model: 'Test Model', agentId: 'agent-clear' }))
  on('ui.open', () => ({ value: { isPlaced: true } }))

  await $.session.start({ cwd: '/work/project', surface: 'terminal', isInteractive: true })
  await $.agent.spawn({ prompt: 'clear the test', description: 'clear test' })
  const ui = await $.ui.mount({
    plugin: 'subagent-split-view',
    surface: 'terminal',
    component: 'Pane',
    requestId: 'subagent-split-view',
    props: paneProps,
  })

  await ui.press({ key: 'clear-subagents' })
  expect(await ui.find({ type: 'Text', text: /Subagents · 0 running · 0 tracked/ })).toBeDefined()
  await ui.unmount()
})

test('renders the empty Subagent pane', async $ => {
  const ui = await $.ui.mount({
    plugin: 'subagent-split-view',
    surface: 'terminal',
    component: 'Pane',
    requestId: 'subagent-split-view',
    props: paneProps,
  })

  expect(await ui.find({ type: 'Text', text: /Subagents · 0 running · 0 tracked/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /No subagents have started yet/ })).toBeDefined()
  await ui.unmount()
})
