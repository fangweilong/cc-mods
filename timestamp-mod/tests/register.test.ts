import { expect, mock, test } from 'claude-code/testing'
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
  expect(normalizeConfig({ enabled: false, format: 'YYYY-MM-DD' })).toEqual({ enabled: false, format: 'YYYY-MM-DD', tps: true })
  expect(normalizeConfig({ enabled: 'false', format: '', tps: false })).toEqual({ ...DEFAULT_CONFIG, tps: false })
})

test('formats tps and step token counts', () => {
  expect(formatTps(42, true)).toBe('≈42.0 tok/s')
  expect(formatTps(42, false)).toBe('42.0 tok/s')
  expect(formatTokenCount(0)).toBe('0')
  expect(formatTokenCount(12_400)).toBe('12.4k')
  expect(formatTokenCount(1_200_000)).toBe('1.2M')
})

function mockTimestampSession(on: import('claude-code').On) {
  mock.env(on, { HOME: '/test-home' })
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('fs.read', () => ({ value: JSON.stringify({ timestamp: { enabled: true, format: 'HH:mm:ss', tps: true } }) }))
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
