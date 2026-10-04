import { expect, test } from 'claude-code/testing'
import { formatLogEntry, formatPanelHeader, isFinishedAgentStatus } from '../hooks/register'

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

test('renders the empty Subagent pane', async $ => {
  const ui = await $.ui.mount({
    plugin: 'subagent-split-view',
    surface: 'terminal',
    component: 'Pane',
    requestId: 'subagent-split-view',
    props: {
      title: 'Subagents',
      isFocused: false,
      bodyColumns: 72,
      placement: 'dock',
      scroll: { offset: 0, bodyRows: 30 },
      view: {},
    },
  })

  expect(await ui.find({ type: 'Text', text: /Subagents · 0 running · 0 tracked/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /No subagents have started yet/ })).toBeDefined()
  await ui.unmount()
})
