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

  const full = normalizeConfig({ displayMode: 'full' })

  expect(stripAnsi(formatStatusLine(snapshot, full))).toBe(
    '🤖 claude-opus-5 | 🎯 Running | 🧩 (.venv) | 🌿 main ● | 📝 +42 -12 | 🧠 ctx ◕ 62% | 🧮 ↑12.0k ↓5.2k | 💾 cache 20% (3.0k) | ⏳ 5h 83% | 💰 $1.25 | 📂 …/other/cc-mods/statusline-mod',
  )

  expect(formatStatusLine(snapshot)).toContain('\u001b[38;2;78;201;176m')
  expect(formatStatusLine(snapshot)).toContain('\u001b[38;2;198;120;164m')
  expect(stripAnsi(formatStatusLine(snapshot))).toBe(uiStatusRows(snapshot, DEFAULT_CONFIG)[0].map(segment => segment.text).join(''))
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
  }, normalizeConfig({ displayMode: 'full' }))
  const text = rows.flat().map(segment => segment.text).join('')

  expect(text).toContain('gpt-6-sol')
  expect(text).not.toContain('statusline-mod:')
  expect(text).not.toContain('\u001b[')
  expect(rows.flat().some(segment => segment.text === '🤖 gpt-6-sol' && segment.color === '#4ec9b0' && segment.bold)).toBe(true)
  expect(rows.flat().some(segment => segment.text === '🧮 ↑0 ↓0' && segment.color === '#c678a4')).toBe(true)
  expect(rows.flat().filter(segment => segment.text === ' | ').every(segment => segment.dimColor)).toBe(true)
})

const compactSnapshot: StatusSnapshot = {
  model: 'Test Model', state: 'Idle', cwd: '/work/cc-mods', home: '/home/test',
  inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, rateLimits: [],
  gitBranch: 'feat/statusline-mod', gitDirty: true, gitInsertions: 0, gitDeletions: 0, subagents: [],
}

test('gives every populated main module an emoji icon', () => {
  const icons = {
    model: '🤖', state: '🎯', env: '🧩', git: '🌿', git_stat: '📝', context: '🧠',
    tokens: '🧮', cache: '💾', quota: '⏳', cost: '💰', cwd: '📂',
  }
  const snapshot = {
    ...compactSnapshot, env: 'node', gitInsertions: 42, gitDeletions: 12,
    contextPercent: 25, cacheReadTokens: 3000, costUsd: 1.25,
    rateLimits: [{ kind: 'five_hour', percentUsed: 17 }],
  }
  for (const [module, icon] of Object.entries(icons)) {
    const config = normalizeConfig({
      displayMode: 'full',
      modules: Object.fromEntries(DEFAULT_CONFIG.order.map(item => [item, item === module])),
    })
    const text = uiStatusRows(snapshot, config)[0].map(segment => segment.text).join('')
    expect(text.startsWith(`${icon} `)).toBe(true)
    expect(stripAnsi(formatStatusLine(snapshot, config))).toBe(text)
    const compact = { ...config, displayMode: 'compact' as const }
    const compactText = uiStatusRows(snapshot, compact)[0].map(segment => segment.text).join('')
    expect(compactText).toBe(text.slice(`${icon} `.length))
    expect(stripAnsi(formatStatusLine(snapshot, compact))).toBe(compactText)
  }
})

test('formats every compact module without icons while preserving data symbols and colors', () => {
  const snapshot = {
    ...compactSnapshot, env: 'node', gitInsertions: 42, gitDeletions: 12,
    contextPercent: 25, inputTokens: 12000, outputTokens: 5200, cacheReadTokens: 3000, costUsd: 1.25,
    rateLimits: [{ kind: 'five_hour', percentUsed: 17 }, { kind: 'seven_day', percentUsed: 90 }],
  }
  const config = normalizeConfig({ displayMode: 'compact' })
  const row = uiStatusRows(snapshot, config)[0]
  const text = row.map(segment => segment.text).join('')
  expect(text).toBe(
    'Test Model | Idle | node | feat/statusline-mod ● | +42 -12 | ctx ◔ 25% | ↑12.0k ↓5.2k | cache 20% (3.0k) | 5h 83% | 7d 10% | $1.25 | /work/cc-mods',
  )
  expect(stripAnsi(formatStatusLine(snapshot, config))).toBe(text)
  expect(row).toContainEqual({ text: 'Test Model', color: '#4ec9b0', bold: true })
  expect(row).toContainEqual({ text: 'feat/statusline-mod', color: '#61afef' })
  expect(row).toContainEqual({ text: ' ●', color: '#ffd700' })
  expect(row).toContainEqual({ text: '↑12.0k ↓5.2k', color: '#c678a4' })
  expect(row.filter(segment => segment.text === ' | ').every(segment => segment.dimColor)).toBe(true)
  expect(uiStatusRows({ ...snapshot, gitDirty: false }, config)[0]).toContainEqual({ text: ' ✓', color: '#50dc8c' })
})

test('only hides decorative prefixes without stripping icons from actual values or subagents', () => {
  const snapshot: StatusSnapshot = {
    ...compactSnapshot, model: '🤖 Custom', env: '🧩 node', gitBranch: 'feature/🌿', cwd: '/work/📂project',
    subagents: [{ id: 'worker', description: '🧠 Inspect', name: '🤖 Worker', type: 'general-purpose', status: 'running', inputTokens: 0, outputTokens: 0 }],
  }
  const full = uiStatusRows(snapshot, normalizeConfig({ displayMode: 'full' }))
  const compact = uiStatusRows(snapshot, DEFAULT_CONFIG)
  const text = compact[0].map(segment => segment.text).join('')
  expect(text).toContain('🤖 Custom | Idle | 🧩 node | feature/🌿 ●')
  expect(text).toContain('/work/📂project')
  expect(compact[1]).toEqual(full[1])
})

test('formats insertion-only or deletion-only changes without leftover icon spaces in either mode', () => {
  for (const displayMode of ['full', 'compact'] as const) {
    const config = normalizeConfig({
      displayMode,
      modules: Object.fromEntries(DEFAULT_CONFIG.order.map(item => [item, item === 'git_stat'])),
    })
    for (const [gitInsertions, gitDeletions, expected] of [[42, 0, '+42'], [0, 12, '-12'], [0, 0, '']] as const) {
      const prefix = expected && displayMode === 'full' ? '📝 ' : ''
      expect(stripAnsi(formatStatusLine({ ...compactSnapshot, gitInsertions, gitDeletions }, config))).toBe(`${prefix}${expected}`)
    }
  }
})

test('keeps branch text blue and colors its dirty or clean marker independently', () => {
  for (const gitDirty of [true, false]) {
    const rows = uiStatusRows({ ...compactSnapshot, gitDirty }, normalizeConfig({ displayMode: 'full' }))
    expect(rows[0]).toContainEqual({ text: '🌿 feat/statusline-mod', color: '#61afef' })
    expect(rows[0]).toContainEqual({ text: gitDirty ? ' ●' : ' ✓', color: gitDirty ? '#ffd700' : '#50dc8c' })
  }
})

test('preserves custom module order and hides disabled or unavailable fields without extra separators', () => {
  const config = normalizeConfig({
    displayMode: 'full',
    order: ['model', 'cwd', 'git', 'tokens'],
    modules: { state: false, env: false, git_stat: false, context: false, cache: false, quota: false, cost: false },
  })
  expect(stripAnsi(formatStatusLine(compactSnapshot, config))).toBe(
    '🤖 Test Model | 📂 /work/cc-mods | 🌿 feat/statusline-mod ● | 🧮 ↑0 ↓0',
  )
  expect(stripAnsi(formatStatusLine({ ...compactSnapshot, cwd: '', gitBranch: undefined }, config))).toBe(
    '🤖 Test Model | 🧮 ↑0 ↓0',
  )
  const compact = { ...config, displayMode: 'compact' as const }
  expect(stripAnsi(formatStatusLine(compactSnapshot, compact))).toBe(
    'Test Model | /work/cc-mods | feat/statusline-mod ● | ↑0 ↓0',
  )
  expect(stripAnsi(formatStatusLine({ ...compactSnapshot, cwd: '', gitBranch: undefined }, compact))).toBe(
    'Test Model | ↑0 ↓0',
  )
  for (const displayMode of ['full', 'compact'] as const) {
    const empty = normalizeConfig({ displayMode, modules: Object.fromEntries(DEFAULT_CONFIG.order.map(item => [item, false])) })
    expect(uiStatusRows(compactSnapshot, empty)[0]).toEqual([])
    expect(formatStatusLine(compactSnapshot, empty)).toBe('')
  }
})

test('keeps native and ANSI formatting consistent across modes, languages, quotas, and context warning levels', () => {
  for (const displayMode of ['full', 'compact'] as const) {
    for (const language of ['en', 'zh'] as const) {
      for (const contextPercent of [0, 65, 85, 100]) {
        const snapshot = { ...compactSnapshot, contextPercent, cacheReadTokens: 3000, rateLimits: [
          { kind: 'five_hour', percentUsed: 17 }, { kind: 'seven_day', percentUsed: 90 },
        ] }
        const config = normalizeConfig({ language, displayMode })
        const row = uiStatusRows(snapshot, config)[0]
        expect(stripAnsi(formatStatusLine(snapshot, config))).toBe(row.map(segment => segment.text).join(''))
        const label = language === 'zh' ? '上下文' : 'ctx'
        const ring = contextPercent === 0 ? '◯' : contextPercent < 85 ? '◕' : '●'
        expect(row).toContainEqual({
          text: `${displayMode === 'full' ? '🧠 ' : ''}${label} ${ring} ${contextPercent}%`,
          color: contextPercent >= 85 ? '#ff5a64' : contextPercent >= 65 ? '#ffd700' : '#50dc8c',
        })
        const state = language === 'zh' ? '就绪' : 'Idle'
        expect(row.map(segment => segment.text).join('')).toContain(`${displayMode === 'full' ? '🎯 ' : ''}${state}`)
      }
    }
  }
})

for (const surface of ['terminal', 'desktop'] as const) {
  test(`separates the mode and status text with an explicit newline on ${surface}`, async $ => {
    const ui = await $.ui.mount({
      plugin: 'statusline-mod',
      surface,
      component: 'SessionMode',
      props: { modes: ['accept edits on'] },
    })

    expect(await ui.find({ type: 'Text', text: /⏵⏵ accept edits on\n/ })).toBeDefined()
    const model = await ui.find({ type: 'Text', text: /^Agent$/ })
    const dividers = await ui.findAll({ type: 'Text', text: /^ \| $/ })
    expect(model?.props.color).toBe('#4ec9b0')
    expect(model?.props.bold).toBe(true)
    expect(dividers.length).toBeGreaterThan(0)
    expect(dividers.every(divider => divider.props.dimColor === true)).toBe(true)
    expect(await ui.find({ type: 'Text', text: /^↑0 ↓0$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^Idle$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^ctx ◯ 0%$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /🤖/ })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: /\u001b\[/ })).toBeUndefined()
    await ui.unmount()
  })

  test(`does not add a blank mode row when there are no modes on ${surface}`, async $ => {
    const ui = await $.ui.mount({
      plugin: 'statusline-mod',
      surface,
      component: 'SessionMode',
      props: { modes: [] },
    })

    expect(await ui.find({ type: 'Text', text: /Agent/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /\n/ })).toBeUndefined()
    await ui.unmount()
  })
}

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

test('normalizes statusline positions and keeps the legacy position as the default', () => {
  for (const position of ['session-mode', 'below-prompt'] as const) {
    expect(normalizeConfig({ position }).position).toBe(position)
  }
  for (const value of [undefined, null, {}, { position: 'unknown' }, { position: 1 }, { position: null }]) {
    expect(normalizeConfig(value).position).toBe('session-mode')
  }
})

test('normalizes display modes and defaults legacy or invalid settings to compact', () => {
  expect(DEFAULT_CONFIG.displayMode).toBe('compact')
  for (const displayMode of ['full', 'compact'] as const) {
    expect(normalizeConfig({ displayMode }).displayMode).toBe(displayMode)
  }
  for (const value of [undefined, null, {}, { language: 'zh' }, { displayMode: 'unknown' }, { displayMode: 1 }, { displayMode: null }, { displayMode: false }]) {
    expect(normalizeConfig(value).displayMode).toBe('compact')
  }
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
  mock.env(on, { HOME: '/test-home' })
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
  on('ui.render', { component: 'SessionMode' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    return Text({ children: [e.props.modes.join(' & ')] })
  })
  on('ui.render', { component: 'PromptHint' }, ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    return Box({
      key: 'native-hint-row',
      children: [
        Text({ dimColor: true, children: [e.props.hint] }),
        ...(e.props.tail ? [Text({ children: [e.props.tail] })] : []),
      ],
    })
  })
  return world
}

for (const surface of ['terminal', 'desktop'] as const) {
  for (const position of ['session-mode', 'below-prompt'] as const) {
    test(`switches display modes after saves in ${position} on ${surface}`, { plugins: [configWriter] }, async ($, on) => {
      const world = mockStatusSession(on)
      world.file = JSON.stringify({ ...DEFAULT_CONFIG, position })
      await $.session.start({ cwd: '/work/project', surface, isInteractive: true })
      const ui = position === 'session-mode'
        ? await $.ui.mount({ plugin: 'statusline-mod', surface, viewport: { columns: 12, rows: 24 }, component: 'SessionMode', props: { modes: ['accept edits on'] } })
        : await $.ui.mount({ plugin: 'statusline-mod', surface, viewport: { columns: 12, rows: 24 }, component: 'PromptHint', props: { hint: '? for shortcuts', isDraft: false, isWorking: false } })
      for (const displayMode of ['full', 'compact', 'full', 'compact'] as const) {
        await writeConfigFile($, { path: '/test-home/.config/my-cc-mods/config.json', text: JSON.stringify({ ...DEFAULT_CONFIG, position, displayMode }) })
        const model = await ui.find({ type: 'Text', text: displayMode === 'full' ? /^🤖 Test Model$/ : /^Test Model$/ })
        expect(model).toBeDefined()
        expect(model?.props.color).toBe('#4ec9b0')
        expect(model?.props.bold).toBe(true)
        expect(model?.props.wrap).toBe('wrap')
        expect(await ui.find({ type: 'Text', text: displayMode === 'full' ? '🧮 ↑0 ↓0' : '↑0 ↓0' })).toBeDefined()
        expect(await ui.find({ type: 'Text', text: displayMode === 'full' ? '🎯 Idle' : 'Idle' })).toBeDefined()
        expect(await ui.find({ type: 'Text', text: displayMode === 'full' ? '🧠 ctx ◔ 25%' : 'ctx ◔ 25%' })).toBeDefined()
        expect(Boolean(await ui.find({ type: 'Text', text: /🤖/ }))).toBe(displayMode === 'full')
        expect(await ui.find({ type: 'Text', text: position === 'session-mode' ? /accept edits on/ : /shortcuts/ })).toBeDefined()
      }
      world.denied = true
      await writeConfigFile($, { path: '/test-home/.config/my-cc-mods/config.json', text: JSON.stringify({ ...DEFAULT_CONFIG, position, displayMode: 'full' }) })
      expect(await ui.find({ type: 'Text', text: /^Test Model$/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /🤖/ })).toBeUndefined()
      await ui.unmount()
    })

    test(`keeps complete token text and wrapping enabled in ${position} on ${surface}`, async ($, on) => {
      const world = mockStatusSession(on)
      world.file = JSON.stringify({ ...DEFAULT_CONFIG, position, displayMode: 'full' })
      on('turn.start', ($, e) => ({ turnId: e.turnId }))
      on('turn.complete', ($, e) => ({ text: e.answer }))
      await $.session.start({ cwd: 'D:/project', surface, isInteractive: true })
      await $.turn.complete({
        turnId: 'previous', answer: '', durationMs: 100, isAborted: false, reason: 'answer',
        usage: {
          model: 'Test Model', input_tokens: 123456789, output_tokens: 9876543,
          cache_read_input_tokens: 0, cache_creation_input_tokens: 0,
        },
      })
      for (const columns of [12, 40, 120]) {
        const viewport = { columns, rows: 24 }
        const ui = position === 'session-mode'
          ? await $.ui.mount({ plugin: 'statusline-mod', surface, viewport, component: 'SessionMode', props: { modes: ['accept edits on'] } })
          : await $.ui.mount({ plugin: 'statusline-mod', surface, viewport, component: 'PromptHint', props: { hint: '? for shortcuts', isDraft: false, isWorking: false } })
        expect(await ui.find({ type: 'Text', text: /^🧮 ↑123\.5M ↓9\.9M$/ })).toBeDefined()
        await $.turn.start({ text: 'continue', turnId: `active-${columns}` })
        expect(await ui.find({ type: 'Text', text: /^🧮 ↑123\.5M ↓9\.9M$/ })).toBeDefined()
        expect(await ui.find({ type: 'Text', text: /^🎯 Thinking$/ })).toBeDefined()
        const tokenContainers = await ui.findAll({ type: 'Text', text: /🧮/ })
        expect(tokenContainers.length).toBeGreaterThan(0)
        expect(tokenContainers.every(node => node.props.wrap === 'wrap')).toBe(true)
        await ui.unmount()
      }
    })
  }
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
    await writeConfigFile($, { path: '/test-home/.config/my-cc-mods/config.json', text: JSON.stringify(next) })
    expect(await ui.find({ type: 'Text', text: /Test Model/ })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: /就绪/ })).toBeDefined()
    expect(world.reads).toBe(2)
    await ui.unmount()
  })
}

for (const surface of ['terminal', 'desktop'] as const) {
  for (const props of [
    { hint: '? for shortcuts', isDraft: false, isWorking: false },
    { hint: 'esc to interrupt', isDraft: true, isWorking: true, tail: 'native tail' },
  ]) {
    test(`keeps the native ${props.hint} row above the statusline on ${surface}`, async ($, on) => {
      const world = mockStatusSession(on)
      world.file = JSON.stringify({ ...DEFAULT_CONFIG, position: 'below-prompt' })
      await $.session.start({ cwd: 'D:/project', surface, isInteractive: true })
      const ui = await $.ui.mount({ plugin: 'statusline-mod', surface, component: 'PromptHint', props })
      const layout = await ui.find({ type: 'Box' })
      const native = await ui.find({ key: 'native-hint-row' })

      expect(layout?.props.flexDirection).toBe('column')
      expect(layout?.children[0]).toEqual({
        type: native?.type,
        props: native?.props,
        children: native?.children,
      })
      expect(layout?.children).toHaveLength(2)
      expect(native?.text).toContain(props.hint)
      expect((await ui.find({ type: 'Text', text: props.hint }))?.props.dimColor).toBe(true)
      expect(await ui.find({ type: 'Text', text: /Test Model/ })).toBeDefined()
      if (props.tail) expect(native?.text).toContain(props.tail)
      await ui.unmount()
    })
  }

  for (const position of ['session-mode', 'below-prompt'] as const) {
    test(`renders status only in the configured ${position} slot on ${surface}`, async ($, on) => {
      const world = mockStatusSession(on)
      world.file = JSON.stringify({ ...DEFAULT_CONFIG, position })
      await $.session.start({ cwd: 'D:/project', surface, isInteractive: true })
      const mode = await $.ui.mount({ plugin: 'statusline-mod', surface, component: 'SessionMode', props: { modes: ['accept edits on'] } })
      const hint = await $.ui.mount({ plugin: 'statusline-mod', surface, component: 'PromptHint', props: { hint: '? for shortcuts', isDraft: false, isWorking: false } })
      const selected = position === 'session-mode' ? mode : hint
      const other = position === 'session-mode' ? hint : mode
      expect(await selected.find({ type: 'Text', text: /Test Model/ })).toBeDefined()
      expect(await selected.find({ type: 'Text', text: /Idle/ })).toBeDefined()
      expect(await other.find({ type: 'Text', text: /Test Model/ })).toBeUndefined()
      expect(await mode.find({ type: 'Text', text: /accept edits on/ })).toBeDefined()
      expect(Boolean(await hint.find({ type: 'Text', text: /shortcuts/ }))).toBe(position === 'below-prompt')
      expect(await selected.find({ type: 'Text', text: /\u001b\[/ })).toBeUndefined()
      expect(await selected.find({ type: 'Text', text: /statusline-mod:/ })).toBeUndefined()
      await mode.unmount()
      await hint.unmount()
    })
  }

  test(`moves status between mounted slots after config saves on ${surface}`, { plugins: [configWriter] }, async ($, on) => {
    const world = mockStatusSession(on)
    await $.session.start({ cwd: 'D:/project', surface, isInteractive: true })
    const mode = await $.ui.mount({ plugin: 'statusline-mod', surface, component: 'SessionMode', props: { modes: ['accept edits on'] } })
    const hint = await $.ui.mount({ plugin: 'statusline-mod', surface, component: 'PromptHint', props: { hint: 'esc to interrupt', isDraft: true, isWorking: true } })
    for (const position of ['below-prompt', 'session-mode', 'below-prompt'] as const) {
      await writeConfigFile($, { path: '/test-home/.config/my-cc-mods/config.json', text: JSON.stringify({ ...DEFAULT_CONFIG, position, language: 'zh' }) })
      const selected = position === 'session-mode' ? mode : hint
      const other = position === 'session-mode' ? hint : mode
      expect(await selected.find({ type: 'Text', text: /Test Model/ })).toBeDefined()
      expect(await selected.find({ type: 'Text', text: /就绪/ })).toBeDefined()
      expect(await other.find({ type: 'Text', text: /Test Model/ })).toBeUndefined()
      expect(await mode.find({ type: 'Text', text: /accept edits on/ })).toBeDefined()
      expect(Boolean(await hint.find({ type: 'Text', text: /esc to interrupt/ }))).toBe(position === 'below-prompt')
    }
    world.denied = true
    await writeConfigFile($, { path: '/test-home/.config/my-cc-mods/config.json', text: JSON.stringify(DEFAULT_CONFIG) })
    expect(await hint.find({ type: 'Text', text: /Test Model/ })).toBeDefined()
    expect(await mode.find({ type: 'Text', text: /Test Model/ })).toBeUndefined()
    await mode.unmount()
    await hint.unmount()
  })
}

test('does not refresh the statusline on unrelated or denied file writes', { plugins: [configWriter] }, async ($, on) => {
  const world = mockStatusSession(on)
  await $.session.start({ cwd: 'D:/project', surface: 'terminal', isInteractive: true })
  await writeConfigFile($, { path: 'D:/unrelated.json', text: '{}' })
  expect(world.reads).toBe(1)
  world.denied = true
  const result = await writeConfigFile($, { path: '/test-home/.config/my-cc-mods/config.json', text: '{"language":"zh"}' })
  expect(result.text).toBe('disk write refused')
  expect(world.reads).toBe(1)
})
