import { expect, test } from 'claude-code/testing'
import {
  DEFAULT_CONFIG,
  formatStatusLine,
  formatSubagentLine,
  formatTokenCount,
  normalizeConfig,
  stripAnsi,
  uiStatusRows,
  type StatusSnapshot,
} from '../hooks/register'

test('formats token counts like the Python statusline', () => {
  expect(formatTokenCount(10240)).toBe('10.2k')
  expect(formatTokenCount(1_000_000)).toBe('1.0M')
  expect(formatTokenCount(0)).toBe('0')
  expect(formatTokenCount(undefined)).toBe('?')
})

test('formats all configured main modules with icons and colors', () => {
  const snapshot: StatusSnapshot = {
    model: 'claude-opus-5',
    state: 'Running',
    cwd: 'D:/Codes/other/cc-mods/statusline-mod',
    home: 'D:/Users/test',
    env: '(.venv)',
    contextPercent: 62,
    inputTokens: 12000,
    outputTokens: 5200,
    cacheReadTokens: 3000,
    costUsd: 1.25,
    rateLimits: [{ kind: 'five_hour', percentUsed: 17.4 }],
    gitBranch: 'main',
    gitDirty: true,
    gitInsertions: 42,
    gitDeletions: 12,
    subagents: [],
  }

  expect(stripAnsi(formatStatusLine(snapshot))).toBe(
    'claude-opus-5 │ Running │ (.venv) │ main ● │ +42 -12 │ ctx ◕ 62% │ ↑12.0k ↓5.2k │ ⚡cache 20% (3.0k) │ 5h 83% │ $1.25 │ …/other/cc-mods/statusline-mod',
  )

  expect(formatStatusLine(snapshot)).toContain('\u001b[38;2;80;200;255m')
  expect(formatStatusLine(snapshot)).toContain('⚡cache')
})

test('builds native UI segments without ANSI escape characters or plugin labels', () => {
  const rows = uiStatusRows({
    model: 'gpt-6-sol',
    state: 'Idle',
    cwd: 'D:/work/project',
    home: 'D:/Users/test',
    contextPercent: 0,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    rateLimits: [],
    gitDirty: false,
    gitInsertions: 0,
    gitDeletions: 0,
    subagents: [],
  }, DEFAULT_CONFIG)
  const text = rows.flat().map(segment => segment.text).join('')

  expect(text).toContain('gpt-6-sol')
  expect(text).not.toContain('statusline-mod:')
  expect(text).not.toContain('\u001b[')
  expect(rows.flat().some(segment => segment.color === '#50c8ff')).toBe(true)
})

test('renders the left-aligned status row from the SessionMode slot', async $ => {
  const ui = await $.ui.mount({
    plugin: 'statusline-mod',
    surface: 'terminal',
    component: 'SessionMode',
    props: {
      modes: ['accept edits on'],
    },
  })

  expect(await ui.find({ type: 'Text', text: /accept edits on/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Agent/ })).toBeDefined()
  expect((await ui.findAll({ type: 'Text' })).length).toBeGreaterThan(1)
  expect(await ui.find({ type: 'Text', text: /\u001b\[/ })).toBeUndefined()
  await ui.unmount()
})

test('renders the interactive config pane', async $ => {
  const ui = await $.ui.mount({
    plugin: 'statusline-mod',
    surface: 'terminal',
    component: 'Pane',
    requestId: 'my-cc-mods-config',
    props: {
      title: 'Statusline Config',
      isFocused: true,
      bodyColumns: 120,
      placement: 'inline',
      scroll: { offset: 0, bodyRows: 30 },
      view: {},
    },
  })

  expect(await ui.find({ type: 'Text', text: /Statusline Configuration/ })).toBeDefined()
  expect(await ui.find({ type: 'Button', text: /Language/ })).toBeDefined()
  expect(await ui.find({ type: 'Button', text: /Save configuration/ })).toBeDefined()
  await ui.unmount()
})

test('keeps config order and fills omitted modules with defaults', () => {
  const current = normalizeConfig({
    language: 'zh',
    order: ['cwd', 'model'],
    modules: { context: false },
  })

  expect(current.language).toBe('zh')
  expect(current.order.slice(0, 3)).toEqual(['cwd', 'model', 'state'])
  expect(current.modules.context).toBe(false)
  expect(current.modules.git).toBe(true)
  expect(current.order).toHaveLength(DEFAULT_CONFIG.order.length)
})

test('formats subagent lines with status, context, tokens, and task text', () => {
  const line = formatSubagentLine({
    id: 'active',
    description: 'Inspect files',
    type: 'Explore',
    status: 'running',
    model: 'Opus 5',
    contextPercent: 68,
    inputTokens: 1200,
    outputTokens: 5400,
  }, 'en')

  expect(stripAnsi(line)).toBe(
    '↳ Opus 5 │ Explore │ running │ ctx ◕ 68% │ ↑1.2k ↓5.4k │ Inspect files',
  )
})
