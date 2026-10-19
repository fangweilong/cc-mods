import { expect, mock, test } from 'claude-code/testing'
import type { TimestampConfig, ToolTiming } from '../types'
import { DEFAULT_CONFIG, formatTimestamp, formatTokenCount, formatToolTiming, formatTps, normalizeConfig } from '../hooks/register'

test('merges tool start, end and duration into one line', () => {
  const start = new Date(2026, 0, 2, 12, 55, 10, 0).getTime()
  expect(formatToolTiming({ startedAt: start })).toBe('[12:55:10] → running')
  expect(formatToolTiming({ startedAt: start, finishedAt: start + 3200 })).toBe('[12:55:10] → [12:55:13] · 3.2s')
})

test('formats supported timestamp tokens', () => {
  const value = new Date(2026, 0, 2, 3, 4, 5, 678).getTime()
  expect(formatTimestamp(value, 'YYYY/YY-MM-DD HH:mm:ss.SSS')).toBe('2026/26-01-02 03:04:05.678')
})

test('keeps literal format text and normalizes invalid configuration', () => {
  const value = new Date(2026, 0, 2, 3, 4, 5, 678).getTime()
  expect(formatTimestamp(value, '[HH] HH:mm')).toBe('[03] 03:04')
  expect(normalizeConfig(undefined)).toEqual(DEFAULT_CONFIG)
  expect(normalizeConfig({ enabled: false, format: 'YYYY-MM-DD' })).toEqual({ ...DEFAULT_CONFIG, enabled: false, format: 'YYYY-MM-DD' })
  expect(normalizeConfig({ enabled: 'false', format: '', tps: false })).toEqual({ ...DEFAULT_CONFIG, tps: false })
  expect(normalizeConfig({}).autoExpandToolGroups).toBe(false)
  expect(normalizeConfig({ autoExpandToolGroups: true }).autoExpandToolGroups).toBe(true)
  expect(normalizeConfig({ autoExpandToolGroups: false }).autoExpandToolGroups).toBe(false)
  for (const autoExpandToolGroups of ['true', 'false', 0, 1, null]) {
    expect(normalizeConfig({ autoExpandToolGroups }).autoExpandToolGroups).toBe(false)
  }
})

test('formats tps and step token counts', () => {
  expect(formatTps(42, true)).toBe('≈42.0 tok/s')
  expect(formatTps(42, false)).toBe('42.0 tok/s')
  expect(formatTokenCount(0)).toBe('0')
  expect(formatTokenCount(12_400)).toBe('12.4k')
  expect(formatTokenCount(1_200_000)).toBe('1.2M')
})

function mockTimestampSession(on: import('claude-code').On, config: Partial<TimestampConfig> = {}) {
  mock.env(on, { HOME: '/test-home' })
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('fs.read', () => ({ value: JSON.stringify({ timestamp: { enabled: true, format: 'HH:mm:ss', tps: true, ...config } }) }))
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('turn.complete', ($, e) => ({ text: e.answer }))
  on('tool.call', ($, e) => ({ result: { ok: true } }))
  on('ui.render', { component: 'AssistantMessage' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    return Text({ children: [e.props.text] })
  })
  on('ui.render', { component: 'ToolUse' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    return Text({ children: [e.props.tool] })
  })
}

for (const surface of ['terminal', 'desktop'] as const) {
  for (const { name, config, autoExpands } of [
    { name: 'legacy configuration', config: {}, autoExpands: false },
    { name: 'auto expansion off', config: { autoExpandToolGroups: false }, autoExpands: false },
    { name: 'TPS off', config: { tps: false }, autoExpands: false },
    { name: 'auto expansion on', config: { autoExpandToolGroups: true }, autoExpands: true },
    { name: 'auto expansion on with TPS off', config: { autoExpandToolGroups: true, tps: false }, autoExpands: true },
    { name: 'timestamp disabled', config: { enabled: false, autoExpandToolGroups: true }, autoExpands: false },
  ]) {
    test(`preserves native ToolGroup state unless opted into expansion: ${name} (${surface})`, async ($, on) => {
      mockTimestampSession(on, config)
      const received: boolean[] = []
      on('ui.render', { component: 'ToolGroup' }, ($, e) => {
        received.push(e.props.isExpanded)
        const { Text } = $.ui.resolve(e)
        return Text({ children: [e.props.isExpanded ? 'expanded' : 'collapsed'] })
      })
      await $.session.start({ cwd: 'D:/project', surface, isInteractive: true })

      // 同一工具组从折叠到展开再收起；没有计时数据也必须保留原生行为。
      for (const isExpanded of [false, true, false]) {
        const group = await $.ui.mount({
          plugin: 'timestamp-mod', surface, component: 'ToolGroup', requestId: 'group-1',
          props: { calls: [], isActive: false, isExpanded },
        })
        expect(await group.find({ type: 'Text', text: autoExpands || isExpanded ? 'expanded' : 'collapsed' })).toBeDefined()
        await group.unmount()
      }
      expect(received).toEqual(autoExpands ? [true, true, true] : [false, true, false])
    })
  }
}

test('reloads tool group expansion after the shared configuration is saved', {
  plugins: [{
    name: 'test-config-saver',
    register(on) {
      on('command.run', { command: 'save-test-config' }, async ($, e) => {
        await $.fs.write('/test-home/.config/my-cc-mods/config.json', e.args)
        return { text: '' }
      })
    },
  }],
}, async ($, on) => {
  const config: Partial<TimestampConfig> = {}
  mockTimestampSession(on, config)
  on('fs.write', ($, e) => {
    Object.assign(config, JSON.parse(e.text).timestamp)
    return { value: undefined }
  })
  on('ui.render', { component: 'ToolGroup' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    return Text({ children: [e.props.isExpanded ? 'expanded' : 'collapsed'] })
  })
  await $.session.start({ cwd: 'D:/project', surface: 'terminal', isInteractive: true })

  for (const autoExpandToolGroups of [false, true, false]) {
    await $.command.run({
      command: 'save-test-config', args: JSON.stringify({ timestamp: { autoExpandToolGroups } }),
      origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 },
    })
    const group = await $.ui.mount({
      plugin: 'timestamp-mod', surface: 'terminal', component: 'ToolGroup', requestId: 'group-1',
      props: { calls: [], isActive: false, isExpanded: false },
    })
    expect(await group.find({ type: 'Text', text: autoExpandToolGroups ? 'expanded' : 'collapsed' })).toBeDefined()
    await group.unmount()
  }
})

test('keeps tool timing visible when native tool groups are expanded', async ($, on) => {
  mockTimestampSession(on)
  const startedAt = new Date(2026, 0, 2, 12, 55, 10).getTime()
  mock.clock(on, { now: startedAt })
  const writes: ToolTiming[] = []
  on('state.set', { plugin: 'timestamp-mod', key: 'toolTimings' }, ($, e, next) => {
    writes.push(e.value)
    return next(e)
  })
  await $.session.start({ cwd: 'D:/project', surface: 'terminal', isInteractive: true })
  await $.tool.call({ tool: 'Bash', tool_use_id: 'tool-1', command: 'pwd' })
  expect(writes).toEqual([{ startedAt }, { startedAt, finishedAt: startedAt }])

  const tool = await $.ui.mount({
    plugin: 'timestamp-mod', surface: 'terminal', component: 'ToolUse', requestId: 'tool-1',
    props: { tool_use_id: 'tool-1', tool: 'Bash', input: { command: 'pwd' }, isRunning: false, isErrored: false, isInterrupted: false },
  })
  expect((await tool.findAll({ type: 'Text' })).map(element => element.text)).toEqual([
    'Bash',
    '⏱ Bash · [12:55:10] → [12:55:10] · 0.0s',
  ])
  expect((await tool.find({ key: 'tool-timing-footer' }))?.props.paddingLeft).toBe(2)
  await tool.unmount()
})

for (const surface of ['terminal', 'desktop'] as const) {
  test(`renders retained host timing without observing the original tool call (${surface})`, async ($, on) => {
    mockTimestampSession(on)
    const startedAt = new Date(2026, 0, 2, 12, 55, 10).getTime()
    on('state.get', { plugin: 'timestamp-mod', key: 'toolTimings' }, ($, e) => ({
      value: {
        value: e.id === 'retained-tool' ? { startedAt, finishedAt: startedAt + 3200, usage: { input: 10, output: 20 } } : undefined,
        version: 1,
      },
    }))
    await $.session.start({ cwd: 'D:/project', surface, isInteractive: true })
    // 模拟热重载后的新模块：没有收到旧 tool.call，只能读取宿主保留的记录。
    const tool = await $.ui.mount({
      plugin: 'timestamp-mod', surface, component: 'ToolUse', requestId: 'retained-tool',
      props: { tool_use_id: 'retained-tool', tool: 'Read', input: { file_path: '/project/file.ts' }, isRunning: false, isErrored: false, isInterrupted: false },
    })
    expect((await tool.findAll({ type: 'Text' })).map(element => element.text)).toEqual([
      'Read',
      '⏱ Read · [12:55:10] → [12:55:13] · 3.2s · ↑10 ↓20',
    ])
    expect((await tool.find({ key: 'tool-timing-footer' }))?.props.paddingLeft).toBe(2)
    await tool.unmount()
  })
}

test('shows the answer timing, tokens and tps on its first block only', async ($, on) => {
  mockTimestampSession(on)
  const clock = mock.clock(on, { now: new Date(2026, 0, 2, 12, 55, 10).getTime() })
  on('turn.step', async function* ($, e) {
    yield { kind: 'text', index: 0, text: '你好' }
    return {
      turnId: e.turnId, index: e.index, answer: '你好世界', toolUses: [], stopReason: 'end_turn',
      usage: { model: 'M', input_tokens: 10, output_tokens: 100, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
    }
  })
  await $.session.start({ cwd: 'D:/project', surface: 'terminal', isInteractive: true })
  await $.turn.start({ text: 'go', turnId: 't1' })
  const stream = $.turn.step({ turnId: 't1', index: 0, model: 'M', messageCount: 1 })
  await stream.next()
  await clock.advance(1000)
  await stream.next()
  await $.session.append({
    door: 'response',
    origin: { kind: 'model', model: 'M' },
    uuid: 'response-1',
    message: { type: 'assistant', role: 'assistant', content: [{ type: 'text', text: '你好世界' }] },
  })

  const first = await $.ui.mount({
    plugin: 'timestamp-mod', surface: 'terminal', component: 'AssistantMessage', requestId: 'response-1',
    props: { text: '你好世界', isFirstOfReply: true },
  })
  expect(await first.find({ type: 'Text', text: /^\[12:55:10\] → \[12:55:11\] · 1\.0s · ↑10 ↓100 · ⚡ 100\.0 tok\/s$/ })).toBeDefined()
  await first.unmount()

  const later = await $.ui.mount({
    plugin: 'timestamp-mod', surface: 'terminal', component: 'AssistantMessage', requestId: 'response-1',
    props: { text: '你好世界', isFirstOfReply: false },
  })
  expect(await later.find({ type: 'Text', text: /tok\/s/ })).toBeUndefined()
  await later.unmount()
})

test('shows an estimated tps with the step start time while streaming', async ($, on) => {
  mockTimestampSession(on)
  const clock = mock.clock(on, { now: new Date(2026, 0, 2, 12, 55, 10).getTime() })
  let release: () => void = () => {}
  const gate = new Promise<void>(resolve => { release = resolve })
  on('turn.step', async function* ($, e) {
    yield { kind: 'text', index: 0, text: '你' }
    yield { kind: 'text', index: 0, text: '好' }
    await gate
    return {
      turnId: e.turnId, index: e.index, answer: '你好', toolUses: [], stopReason: 'end_turn',
      usage: { model: 'M', input_tokens: 10, output_tokens: 100, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
    }
  })
  await $.session.start({ cwd: 'D:/project', surface: 'terminal', isInteractive: true })
  await $.turn.start({ text: 'go', turnId: 't1' })
  const stream = $.turn.step({ turnId: 't1', index: 0, model: 'M', messageCount: 1 })
  await stream.next()
  await clock.advance(1000)
  await stream.next()

  const message = await $.ui.mount({
    plugin: 'timestamp-mod', surface: 'terminal', component: 'AssistantMessage',
    props: { text: '你好', isFirstOfReply: true },
  })
  expect(await message.find({ type: 'Text', text: /^\[12:55:10\] → running · ⚡ ≈2\.0 tok\/s$/ })).toBeDefined()
  await message.unmount()
  release()
  await stream.next()
})

test('shows the exact tps above the answer message matched by its id', async ($, on) => {
  mockTimestampSession(on)
  const clock = mock.clock(on, { now: 0 })
  on('turn.step', async function* ($, e) {
    yield { kind: 'text', index: 0, text: '你好' }
    return {
      turnId: e.turnId, index: e.index, answer: '你好世界', toolUses: [], stopReason: 'end_turn',
      usage: { model: 'M', input_tokens: 10, output_tokens: 100, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
    }
  })
  await $.session.start({ cwd: 'D:/project', surface: 'terminal', isInteractive: true })
  await $.turn.start({ text: 'go', turnId: 't1' })
  const stream = $.turn.step({ turnId: 't1', index: 0, model: 'M', messageCount: 1 })
  await stream.next()
  await clock.advance(1000)
  await stream.next()

  // 引擎在 step 结束后追加回答行；这里按同样的 uuid 让 step 与回答配对。
  const appended = await $.session.append({
    door: 'response',
    origin: { kind: 'model', model: 'M' },
    uuid: 'response-1',
    message: { type: 'assistant', role: 'assistant', content: [{ type: 'text', text: '你好世界' }] },
  })
  expect(appended.uuid).toBe('response-1')

  const message = await $.ui.mount({
    plugin: 'timestamp-mod', surface: 'terminal', component: 'AssistantMessage', requestId: 'response-1',
    props: { text: '你好世界', isFirstOfReply: true },
  })
  expect(await message.find({ type: 'Text', text: /⚡ 100\.0 tok\/s/ })).toBeDefined()
  expect(await message.find({ type: 'Text', text: /≈/ })).toBeUndefined()
  await message.unmount()
})
