import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'
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

const configWriter = {
  name: 'test-config-writer',
  register(on: On) {
    on('command.run', { command: 'test-write-config' }, async ($, e) => {
      const { path, text } = JSON.parse(e.args) as { path: string; text: string }
      try {
        await $.fs.write(path, text)
        return { text: 'saved' }
      } catch {
        return { text: 'disk write refused' }
      }
    })
  },
}

async function writeConfigFile($: Engine, file: { path: string; text: string }) {
  return $.command.run({
    command: 'test-write-config', args: JSON.stringify(file),
    origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 },
  })
}

function mockStatusSession(on: On) {
  const world = { file: JSON.stringify(DEFAULT_CONFIG), denied: false, reads: 0, commands: [] as string[] }
  mock.env(on, { HOME: 'D:/test-home' })
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('session.model', () => ({ value: 'Test Model' }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200000, percent: 25 }, rateLimits: [] } }))
  on('command.register', ($, e) => {
    world.commands.push(e.name)
    return { value: { command: e.name } }
  })
  on('fs.read', () => {
    world.reads += 1
    return { value: world.file }
  })
  on('fs.write', ($, e) => {
    if (world.denied) return { deny: 'disk write refused' }
    world.file = e.text
    return { value: undefined }
  })
  on('fs.exists', () => ({ value: false }))
  on('process.run', () => ({ value: { exitCode: 0, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }))
  on('agent.list', () => ({ value: [] }))
  return world
}

for (const surface of ['terminal', 'desktop'] as const) {
  test(`runs without registering config commands and refreshes saved config on ${surface}`, { plugins: [configWriter] }, async ($, on) => {
    const world = mockStatusSession(on)
    await $.session.start({ cwd: 'D:/project', surface, isInteractive: true })
    expect(world.commands).toEqual([])
    const ui = await $.ui.mount({ plugin: 'statusline-mod', surface, component: 'SessionMode', props: { modes: [] } })
    expect(await ui.find({ type: 'Text', text: /Test Model/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Idle/ })).toBeDefined()
    const next = { ...DEFAULT_CONFIG, language: 'zh', modules: { ...DEFAULT_CONFIG.modules, model: false } }
    await writeConfigFile($, { path: 'D:/test-home/.config/my-cc-mods/config.json', text: JSON.stringify(next) })
    expect(await ui.find({ type: 'Text', text: /Test Model/ })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: /就绪/ })).toBeDefined()
    expect(world.reads).toBe(2)
    await ui.unmount()
  })
}

test('does not refresh the statusline on unrelated or denied file writes', { plugins: [configWriter] }, async ($, on) => {
  const world = mockStatusSession(on)
  await $.session.start({ cwd: 'D:/project', surface: 'terminal', isInteractive: true })
  await writeConfigFile($, { path: 'D:/unrelated.json', text: '{}' })
  expect(world.reads).toBe(1)
  world.denied = true
  const result = await writeConfigFile($, { path: 'D:/test-home/.config/my-cc-mods/config.json', text: '{"language":"zh"}' })
  expect(result.text).toBe('disk write refused')
  expect(world.reads).toBe(1)
})
