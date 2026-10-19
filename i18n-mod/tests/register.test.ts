import { expect, test } from 'claude-code/testing'
import type { ConfigSetInput, ConfigSetResult, ConfigValue, EngineInterface, On, PluginOptions, RenderElement, RenderInput } from 'claude-code'
import type { LanguageSelection, TurnDurationConfig } from '../types'
import { register } from '../hooks/register'
import { parseLanguagePack } from '../hooks/language'
import { ORIGINAL_SELECTION } from '../hooks/original'
import type { Engine, Plugin, TestRest } from 'claude-code/testing'
import { mockWorld, JA_DATA, ZH_DATA, JA_DURATION_DATA, ZH_DURATION_DATA } from './fixtures'

const COMMAND_CONTEXT = {
  origin: { kind: 'composer' },
  presentation: { isFullscreen: false, columns: 100 },
} as const

async function start($: Engine): Promise<void> {
  await $.session.start({ cwd: 'D:/work/project', surface: 'terminal', isInteractive: true })
}

function renderProps(on: On): void {
  on('ui.render', ($, e) => ({ type: 'Text', children: [JSON.stringify(e.props)] }))
}

for (const surface of ['terminal', 'desktop'] as const) {
  test(`translates a single plain hint on ${surface} without dropping metadata`, async ($, on) => {
    mockWorld(on)
    renderProps(on)
    await start($)
    const ui = await $.ui.mount({
      plugin: 'i18n-mod', surface, component: 'PromptHint', requestId: 'hint',
      props: { hint: 'esc to interrupt', isDraft: true, isWorking: true },
    })
    expect(JSON.parse((await ui.find({ type: 'Text' }))!.text)).toEqual({
      hint: 'esc 中断', isDraft: true, isWorking: true,
    })
    await ui.unmount()
  })

  test(`preserves compound hint controls on ${surface}`, {
    plugins: [{
      name: 'native-hint-fixture',
      tier: 'builtin',
      register(on) {
        // 模拟宿主契约：hint 一旦变化，原生按钮行就被整行纯文本替换。
        on('ui.render', { component: 'PromptHint' }, ($, e) => {
          const { Box, Button, Text } = $.ui.resolve(e)
          if (e.props.hint !== '2 background tasks · esc to interrupt') {
            return Text({ dimColor: true, wrap: 'truncate', children: e.props.hint })
          }
          return Box({ flexDirection: 'row', children: [
            Button({ key: 'native-tasks', label: '2 background tasks', onPress: () => $.ui.toast('tasks opened') }),
            Text({ dimColor: true, children: ' · esc to interrupt' }),
          ] })
        })
      },
    }],
  }, async ($, on) => {
    const world = mockWorld(on)
    const hint = '2 background tasks · esc to interrupt'
    await start($)
    const ui = await $.ui.mount({
      plugin: 'i18n-mod', surface, component: 'PromptHint',
      props: { hint, isDraft: false, isWorking: true },
    })
    expect(await ui.find({ key: 'native-tasks' })).toBeDefined()
    await ui.press({ plugin: 'native-hint-fixture', key: 'native-tasks' })
    expect(world.toasts).toEqual(['tasks opened'])
    await ui.redraw({ hint: 'esc to interrupt', isDraft: false, isWorking: true })
    expect((await ui.find({ type: 'Text' }))?.text).toBe('esc 中断')
    await ui.redraw({ hint, isDraft: false, isWorking: true })
    expect(await ui.find({ key: 'native-tasks' })).toBeDefined()
    await ui.press({ plugin: 'native-hint-fixture', key: 'native-tasks' })
    expect(world.toasts).toEqual(['tasks opened', 'tasks opened'])
    await ui.unmount()
  })

  for (const [hint, translated] of [
    ['(shift+tab to cycle) · install gh for PR status · esc to interrupt · ← for agents', '(shift+tab 切换模式) · install gh for PR status · esc 中断 · ← for agents'],
    ['install gh for PR status · esc to interrupt · ← for agents', 'install gh for PR status · esc 中断 · ← for agents'],
    ['gh auth login for PR status · esc to interrupt · ← for agents', 'gh auth login for PR status · esc 中断 · ← for agents'],
    ['? for shortcuts · esc to interrupt', '? 查看快捷键 · esc 中断'],
    ['ctrl+o to expand  esc to interrupt', 'ctrl+o 展开  esc 中断'],
  ] as const) {
    test(`translates a verified plain compound hint ${hint} on ${surface}`, async ($, on) => {
      mockWorld(on)
      renderProps(on)
      await start($)
      const props = { hint, isDraft: false, isWorking: true }
      const ui = await $.ui.mount({ plugin: 'i18n-mod', surface, component: 'PromptHint', props })
      expect(JSON.parse((await ui.find({ type: 'Text' }))!.text)).toEqual({ ...props, hint: translated })
      await ui.unmount()
    })
  }

  for (const hint of [
    'install gh for PR status · 1 shell · esc to interrupt · ← for agents',
    'PR #123 · esc to interrupt · ← for agents',
    'custom hint | esc to interrupt',
    '2 background tasks esc to interrupt',
    'esc to interrupt\n2 background tasks',
  ]) {
    test(`leaves compound hint ${JSON.stringify(hint)} unchanged on ${surface}`, async ($, on) => {
      mockWorld(on)
      renderProps(on)
      await start($)
      const props = { hint, isDraft: false, isWorking: true }
      const ui = await $.ui.mount({ plugin: 'i18n-mod', surface, component: 'PromptHint', props })
      expect(JSON.parse((await ui.find({ type: 'Text' }))!.text)).toEqual(props)
      await ui.unmount()
    })
  }

  for (const tail of ['', 'custom tail']) {
    test(`leaves hints with tail ${JSON.stringify(tail)} unchanged on ${surface}`, async ($, on) => {
      mockWorld(on)
      renderProps(on)
      await start($)
      const props = { hint: '? for shortcuts', isDraft: false, isWorking: false, tail }
      const ui = await $.ui.mount({ plugin: 'i18n-mod', surface, component: 'PromptHint', props })
      expect(JSON.parse((await ui.find({ type: 'Text' }))!.text)).toEqual(props)
      const compound = { ...props, hint: 'install gh for PR status · esc to interrupt · ← for agents' }
      await ui.redraw(compound)
      expect(JSON.parse((await ui.find({ type: 'Text' }))!.text)).toEqual(compound)
      await ui.unmount()
    })
  }

  test(`rewrites spinner props on ${surface} and keeps dynamic messages intact`, async ($, on) => {
    mockWorld(on)
    renderProps(on)
    await start($)
    const ui = await $.ui.mount({
      plugin: 'i18n-mod', surface, component: 'Spinner',
      props: { word: 'Sauteing', message: 'Reading D:/work/Thinking.ts', suffix: '…', mode: 'tool-use' },
    })
    expect(JSON.parse((await ui.find({ type: 'Text' }))!.text)).toEqual({
      word: '处理中', message: 'Reading D:/work/Thinking.ts', suffix: '…', mode: 'tool-use',
    })
    await ui.redraw({ word: 'FutureSpinner', message: 'Thinking…', suffix: '~', mode: 'thinking' })
    expect(JSON.parse((await ui.find({ type: 'Text' }))!.text)).toEqual({
      word: 'FutureSpinner', message: '思考中…', suffix: '~', mode: 'thinking',
    })
    await ui.unmount()
  })

  test(`localizes mode labels on ${surface} without removing unknown modes`, async ($, on) => {
    mockWorld(on)
    renderProps(on)
    await start($)
    const ui = await $.ui.mount({
      plugin: 'i18n-mod', surface, component: 'SessionMode',
      props: { modes: ['focus', 'memory paused', 'custom-mode'] },
    })
    expect(JSON.parse((await ui.find({ type: 'Text' }))!.text)).toEqual({
      modes: ['专注模式', '记忆已暂停', 'custom-mode'],
    })
    await ui.unmount()
  })
}

test('keeps an existing tail visible under the terminal hint replacement contract', async ($, on) => {
  mockWorld(on)
  const hint = '? for shortcuts'
  on('ui.render', { component: 'PromptHint' }, ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    if (e.props.hint !== hint) return Text({ dimColor: true, wrap: 'truncate', children: e.props.hint })
    return Box({ flexDirection: 'row', children: [
      Text({ children: e.props.hint }),
      Text({ dimColor: true, children: e.props.tail ?? '' }),
    ] })
  })
  await start($)
  const ui = await $.ui.mount({
    plugin: 'i18n-mod', surface: 'terminal', component: 'PromptHint',
    props: { hint, isDraft: false, isWorking: false, tail: 'custom tail' },
  })
  expect((await ui.find({ type: 'Text', text: hint }))?.text).toBe(hint)
  expect((await ui.find({ type: 'Text', text: 'custom tail' }))?.text).toBe('custom tail')
  await ui.unmount()
})

test('localizes background hint without changing the tool identity', async ($, on) => {
  mockWorld(on)
  renderProps(on)
  await start($)
  const ui = await $.ui.mount({
    plugin: 'i18n-mod', surface: 'terminal', component: 'ToolProgress', requestId: 'tool-1',
    props: { kind: 'background_hint', tool_use_id: 'tool-1', hint: '(alt+r to run in background)' },
  })
  expect(JSON.parse((await ui.find({ type: 'Text' }))!.text)).toEqual({
    kind: 'background_hint', tool_use_id: 'tool-1', hint: '(alt+r 转入后台运行)',
  })
  await ui.unmount()
})

test('localizes known notices without changing slash commands or visibility', async ($, on) => {
  mockWorld(on)
  renderProps(on)
  await start($)
  const ui = await $.ui.mount({
    plugin: 'i18n-mod', surface: 'terminal', component: 'InfoNotice',
    props: { text: 'Update available', command: '/help', onScreen: null },
  })
  expect(JSON.parse((await ui.find({ type: 'Text' }))!.text)).toEqual({
    text: '有可用更新', command: '/help', onScreen: null,
  })
  await ui.redraw({ text: 'Update available for D:/work/project', command: null })
  expect(JSON.parse((await ui.find({ type: 'Text' }))!.text).text).toBe('有可用更新 for D:/work/project')
  await ui.unmount()
})

// 复用公共耗时模板 fixture，旧包 fixture 仍保留无模板兼容覆盖。
const DURATION_DATA = ZH_DURATION_DATA

function mockDurationWorld(on: On) {
  const world = mockWorld(on)
  world.files['locales/zh-CN.json'] = JSON.stringify(DURATION_DATA)
  return world
}

test('passes duration props through unchanged even when the language pack provides translations', async ($, on) => {
  mockDurationWorld(on)
  renderProps(on)
  await start($)
  const props = { word: 'Baked', durationMs: 64000, onScreen: null }
  const ui = await $.ui.mount({
    plugin: 'i18n-mod', surface: 'terminal', component: 'TurnDuration', props,
  })
  expect(await ui.find({ type: 'Box' })).toBeUndefined()
  expect(JSON.parse((await ui.find({ type: 'Text' }))!.text)).toEqual(props)
  const visible = { word: 'Baked', durationMs: 3500, onScreen: { first: 0, last: 1, of: 2 } }
  await ui.redraw(visible)
  expect(JSON.parse((await ui.find({ type: 'Text' }))!.text)).toEqual(visible)
  const unknown = { word: 'FutureVerb', durationMs: 3500 }
  await ui.redraw(unknown)
  expect(JSON.parse((await ui.find({ type: 'Text' }))!.text)).toEqual(unknown)
  await ui.unmount()
})

for (const [scenario, marginTop, text] of [
  ['completion without margin', 0, 'Baked for 1m 4s'],
  ['completion with margin', 1, 'Baked for 1m 4s'],
  ['pending background agents', 0, 'Waiting for 2 background agents to finish'],
  ['pending workflows', 0, 'Waiting for 1 dynamic workflow to finish'],
  ['hidden duration without statistics', 0, ''],
  ['budget without duration', 0, '5k / 10k (50%)'],
  ['hidden messages without duration', 0, '2 messages hidden (/focus to show)'],
  ['completion with statistics', 1, 'Baked for 1m 4s · done 15:20 · 5k / 10k (50%) · 2 messages hidden (/focus to show) · 1 still running'],
] as const) {
  test(`preserves the native duration output for ${scenario}`, async ($, on) => {
    mockWorld(on)
    const props = { word: 'Baked', durationMs: 64000, onScreen: null }
    // 模拟原生分支的输出；内部状态不在公开 props 中，Mod 不应替它做判断。
    const native: RenderElement = {
      type: 'Box', props: { marginTop },
      children: text ? [{ type: 'Text', props: { dimColor: true }, children: [text] }] : [],
    }
    let nativeCalls = 0
    on('ui.render', { component: 'TurnDuration' }, ($, e) => {
      expect(e.props).toEqual(props)
      nativeCalls += 1
      return native
    })
    await start($)
    const ui = await $.ui.mount({
      plugin: 'i18n-mod', surface: 'terminal', component: 'TurnDuration', props,
    })
    expect(nativeCalls).toBeGreaterThan(0)
    expect(await ui.drawn()).toEqual({ ...native, part: { plugin: 'test' } })
    await ui.unmount()
  })
}

for (const missing of ['completed', 'duration'] as const) {
  test(`preserves the native duration line when the language pack omits ${missing}`, async ($, on) => {
    const world = mockWorld(on)
    const pack: Partial<typeof ZH_DATA> = { ...ZH_DATA }
    delete pack[missing]
    world.files['locales/zh-CN.json'] = JSON.stringify(pack)
    renderProps(on)
    await start($)
    const props = { word: 'Baked', durationMs: 64000, onScreen: null }
    const ui = await $.ui.mount({ plugin: 'i18n-mod', surface: 'terminal', component: 'TurnDuration', props })
    expect(await ui.find({ type: 'Box' })).toBeUndefined()
    expect(JSON.parse((await ui.find({ type: 'Text' }))!.text)).toEqual(props)
    await ui.unmount()
  })
}

for (const mode of ['native', 'custom'] as const) {
  for (const visible of [true, false]) {
    for (const spacing of ['compact', 'separated'] as const) {
      test(`English preserves native duration before ${mode}/${visible}/${spacing} settings`, {
        options: { language: 'en', turnDurationMode: mode, turnDurationVisible: visible, turnDurationSpacing: spacing },
      }, async ($, on) => {
        mockDurationWorld(on)
        let durationReads = 0
        on('state.get', { plugin: 'i18n-mod', key: 'turnDuration' }, async ($, e, next) => {
          durationReads++
          return next(e)
        })
        const props = { word: 'FutureVerb', durationMs: 64000, onScreen: null }
        let nativeCalls = 0
        on('ui.render', { component: 'TurnDuration' }, ($, e) => {
          nativeCalls++
          expect(e.props).toEqual(props)
          expect(e.requestId).toBe('english-duration')
          return { type: 'Text', children: ['native duration fixture'] }
        })
        await start($)
        const before = durationReads
        const ui = await $.ui.mount({
          plugin: 'i18n-mod', surface: 'terminal', component: 'TurnDuration', requestId: 'english-duration', props,
        })
        expect((await ui.find({ type: 'Text' }))?.text).toBe('native duration fixture')
        expect(nativeCalls).toBeGreaterThan(0)
        expect(durationReads).toBe(before)
        await ui.unmount()
      })
    }
  }
}

for (const [spacing, marginTop] of [['compact', 0], ['separated', 1]] as const) {
  for (const hasTemplate of [true, false]) {
    test(`custom hidden ${spacing} duration stays empty with template=${hasTemplate}, even for invalid elapsed`, {
      options: { turnDurationMode: 'custom', turnDurationVisible: false, turnDurationSpacing: spacing },
    }, async ($, on) => {
      if (hasTemplate) mockDurationWorld(on)
      else mockWorld(on)
      let nativeCalls = 0
      on('ui.render', { component: 'TurnDuration' }, () => {
        nativeCalls++
        return { type: 'Text', children: ['native duration must not reappear'] }
      })
      await start($)
      const props = { word: 'FutureVerb', durationMs: 64000, onScreen: null }
      const ui = await $.ui.mount({ plugin: 'i18n-mod', surface: 'terminal', component: 'TurnDuration', props })
      expect(await ui.drawn()).toEqual({ type: 'Box', children: [], part: { plugin: 'i18n-mod' } })
      await ui.redraw({ ...props, durationMs: -1, onScreen: { first: 0, last: 1, of: 2 } })
      expect(await ui.find({ type: 'Text' })).toBeUndefined()
      expect(await ui.drawn()).toEqual({ type: 'Box', children: [], part: { plugin: 'i18n-mod' } })
      expect(nativeCalls).toBe(0)
      await ui.unmount()
    })
  }

  for (const word of ['Baked', 'FutureVerb']) {
    for (const onScreen of [undefined, null, { first: 0, last: 1, of: 2 }]) {
      test(`custom ${spacing} duration uses elapsed only for ${word}, onScreen=${JSON.stringify(onScreen)}`, {
        options: { turnDurationMode: 'custom', turnDurationSpacing: spacing },
      }, async ($, on) => {
        mockDurationWorld(on)
        let nativeCalls = 0
        on('ui.render', { component: 'TurnDuration' }, () => {
          nativeCalls++
          return { type: 'Text', children: ['native for 12m 38s · done 15:53 · budget · waiting · all complete'] }
        })
        await start($)
        const props = { word, durationMs: 758000, ...(onScreen === undefined ? {} : { onScreen }) }
        const ui = await $.ui.mount({ plugin: 'i18n-mod', surface: 'terminal', component: 'TurnDuration', props })
        // 精确树断言排除 engine 引用、额外统计、完成时刻与后台语义。
        expect(await ui.drawn()).toEqual({
          type: 'Box', props: { width: '100%', flexDirection: 'row', marginTop },
          children: [
            { type: 'Box', props: { width: 2, minWidth: 2, flexShrink: 0 }, children: [{ type: 'Text', children: ['✻'] }] },
            { type: 'Text', props: { dimColor: true }, children: ['本轮用时 12m 38s'] },
          ],
          part: { plugin: 'i18n-mod' },
        })
        await ui.redraw({ ...props, durationMs: 64000 })
        expect((await ui.find({ type: 'Text', text: '本轮用时 1m 4s' }))?.text).toBe('本轮用时 1m 4s')
        expect(nativeCalls).toBe(0)
        await ui.unmount()
      })
    }
  }
}

for (const namespace of [undefined, {}]) {
  test(`custom duration without an elapsed template (${JSON.stringify(namespace)}) preserves the whole native line`, {
    options: { turnDurationMode: 'custom', turnDurationSpacing: 'separated' },
  }, async ($, on) => {
    const world = mockWorld(on)
    world.files['locales/zh-CN.json'] = JSON.stringify({ ...ZH_DATA, turnDuration: namespace })
    const props = { word: 'Baked', durationMs: 64000, onScreen: null }
    const native: RenderElement = { type: 'Text', children: ['Baked for 1m 4s · done 15:53'] }
    let nativeCalls = 0
    on('ui.render', { component: 'TurnDuration' }, ($, e) => {
      nativeCalls++
      expect(e.props).toEqual(props)
      return native
    })
    await start($)
    const ui = await $.ui.mount({ plugin: 'i18n-mod', surface: 'terminal', component: 'TurnDuration', props })
    expect(await ui.drawn()).toEqual({ ...native, part: { plugin: 'test' } })
    expect(nativeCalls).toBeGreaterThan(0)
    await ui.unmount()
  })
}

// 直接调用注册 hook，验证 next 接收到同一事件对象；不从 JSON 序列化推断 NaN/Infinity 或对象身份。
function durationRenderHarness(config: TurnDurationConfig, selection: LanguageSelection) {
  type DurationInput = RenderInput<'TurnDuration', 'terminal'>
  type RenderHook = ($: EngineInterface, e: DurationInput, next: (e: DurationInput) => Promise<RenderElement>) => Promise<RenderElement>
  let hook: RenderHook | undefined
  const capture = ((event: string, matcher: unknown, handler: unknown) => {
    if (event === 'ui.render') hook = handler as RenderHook
    return { catch() {} }
  }) as unknown as On
  register(capture, {})
  expect(hook).toBeDefined()
  const reads: string[] = []
  const forwarded: DurationInput[] = []
  const native: RenderElement = { type: 'Text', children: ['opaque native fixture'] }
  const host = { state: { get: async (ref: { key: string }) => {
    reads.push(ref.key)
    return { value: ref.key === 'selection' ? selection : config, version: 1 }
  } } } as unknown as EngineInterface
  return {
    reads, forwarded, native,
    render: (input: DurationInput) => hook!(host, input, async e => { forwarded.push(e); return native }),
  }
}

function frozenDurationInput(durationMs: number, onScreen?: { first: number; last: number; of: number } | null): RenderInput<'TurnDuration', 'terminal'> {
  if (onScreen) Object.freeze(onScreen)
  return Object.freeze({
    component: 'TurnDuration', surface: 'terminal', requestId: 'unrelated-to-turn-id',
    props: Object.freeze({ word: 'FutureVerb', durationMs, ...(onScreen === undefined ? {} : { onScreen }) }),
  })
}

for (const visible of [true, false]) {
  for (const spacing of ['compact', 'separated'] as const) {
    test(`native duration forwards the identical event before visibility=${visible}/${spacing}`, async () => {
      const selection = { source: 'zh-CN', pack: parseLanguagePack(JSON.stringify(DURATION_DATA)) }
      const harness = durationRenderHarness({ mode: 'native', visible, spacing }, selection)
      const input = frozenDurationInput(-1, null)
      expect(await harness.render(input)).toBe(harness.native)
      expect(harness.forwarded.length).toBe(1)
      expect(harness.forwarded[0]).toBe(input)
    })
  }
}

for (const onScreen of [undefined, null, { first: 0, last: 1, of: 2 }]) {
  test(`English forwards the identical duration event without reading component config, onScreen=${JSON.stringify(onScreen)}`, async () => {
    const harness = durationRenderHarness({ mode: 'custom', visible: false, spacing: 'separated' }, ORIGINAL_SELECTION)
    const input = frozenDurationInput(-1, onScreen)
    expect(await harness.render(input)).toBe(harness.native)
    expect(harness.forwarded[0]).toBe(input)
    expect(harness.reads).toEqual(['selection'])
  })
}

for (const durationMs of [-1, NaN, Infinity, -Infinity]) {
  test(`custom invalid duration ${String(durationMs)} forwards the identical event and native tree`, async () => {
    const selection = { source: 'zh-CN', pack: parseLanguagePack(JSON.stringify(DURATION_DATA)) }
    const harness = durationRenderHarness({ mode: 'custom', visible: true, spacing: 'compact' }, selection)
    const input = frozenDurationInput(durationMs, { first: 0, last: 1, of: 2 })
    expect(await harness.render(input)).toBe(harness.native)
    expect(harness.forwarded.length).toBe(1)
    expect(harness.forwarded[0]).toBe(input)
    expect(Object.is(input.props.durationMs, durationMs)).toBe(true)
  })
}

for (const elapsed of [undefined, '', '   ', '{duration} {word}']) {
  test(`custom invalid or missing template ${JSON.stringify(elapsed)} forwards the identical event`, async () => {
    // 无效模板无法通过语言包解析；此处模拟防御性处理未经解析的 state 值。
    const selection = { source: 'zh-CN', pack: { ...parseLanguagePack(JSON.stringify(DURATION_DATA)), turnDuration: { elapsed } } }
    const harness = durationRenderHarness({ mode: 'custom', visible: true, spacing: 'separated' }, selection)
    const input = frozenDurationInput(64000, null)
    expect(await harness.render(input)).toBe(harness.native)
    expect(harness.forwarded.length).toBe(1)
    expect(harness.forwarded[0]).toBe(input)
  })
}

test('English passes through every supported UI component unchanged', { options: { language: 'en' } }, async ($, on) => {
  mockWorld(on)
  renderProps(on)
  await start($)
  const inputs = [
    { component: 'PromptHint', props: { hint: '? for shortcuts', isDraft: false, isWorking: false } },
    { component: 'Spinner', props: { word: 'Sauteing', message: null, suffix: '…', mode: 'thinking' } },
    { component: 'SessionMode', props: { modes: ['focus'] } },
    { component: 'ToolProgress', props: { kind: 'background_hint', tool_use_id: 'tool-2', hint: '(ctrl+b to run in background)' } },
    { component: 'InfoNotice', props: { text: 'Update available', command: '/help' } },
    { component: 'TurnDuration', props: { word: 'Baked', durationMs: 3500 } },
  ] as const
  for (const input of inputs) {
    const ui = await $.ui.mount({ plugin: 'i18n-mod', surface: 'terminal', ...input })
    expect(JSON.parse((await ui.find({ type: 'Text' }))!.text)).toEqual(input.props)
    await ui.unmount()
  }
})

test('does not translate user messages, assistant text or command output', async ($, on) => {
  mockWorld(on)
  renderProps(on)
  await start($)
  const inputs = [
    { component: 'UserMessage', props: { text: '? for shortcuts', origin: { kind: 'composer' }, isExpanded: false } },
    { component: 'AssistantMessage', props: { text: 'Thinking…', isFirstOfReply: true } },
    { component: 'CommandOutput', props: { text: 'Welcome back!', command: 'custom', args: '', isErrored: false } },
  ] as const
  for (const input of inputs) {
    const ui = await $.ui.mount({ plugin: 'i18n-mod', surface: 'terminal', ...input })
    expect(JSON.parse((await ui.find({ type: 'Text' }))!.text)).toEqual(input.props)
    await ui.unmount()
  }
})


test('lists discovered JSON files without loading them or writing configuration', async ($, on) => {
  const world = mockWorld(on)
  world.files['locales/ja.json'] = '{ invalid unselected data'
  await start($)
  const result = await $.command.run({ ...COMMAND_CONTEXT, command: 'i18n', args: 'list' })
  expect(result.text).toContain('当前界面语言：zh-CN')
  expect(result.text).toContain('en, ja, zh-CN')
  expect(result.text).toContain('zh-CN')
  expect(world.reads).toEqual(['locales/zh-CN.json'])
  expect(world.saves).toEqual([])
})

test('loads only once at startup and never reads files during redraws', async ($, on) => {
  const world = mockWorld(on)
  renderProps(on)
  await start($)
  const ui = await $.ui.mount({
    plugin: 'i18n-mod', surface: 'terminal', component: 'PromptHint',
    props: { hint: '? for shortcuts', isDraft: false, isWorking: false },
  })
  await ui.redraw({ hint: 'esc to interrupt', isDraft: true, isWorking: true })
  await ui.redraw({ hint: '? for shortcuts', isDraft: false, isWorking: false })
  expect(world.reads).toEqual(['locales/zh-CN.json'])
  expect(world.lists).toBe(0)
  await ui.unmount()
})

test('English startup has no language-file dependency', { options: { language: 'en' } }, async ($, on) => {
  const world = mockWorld(on)
  world.files = {}
  await start($)
  expect(world.reads).toEqual([])
  expect(world.toasts).toEqual([])
  expect(world.description).toBe('Select the UI language or a JSON language pack')
})

test('switches between Chinese and original English and redraws subscribed hints', async ($, on) => {
  const world = mockWorld(on)
  renderProps(on)
  await start($)
  const ui = await $.ui.mount({
    plugin: 'i18n-mod', surface: 'terminal', component: 'PromptHint',
    props: { hint: '? for shortcuts', isDraft: false, isWorking: false },
  })
  expect(JSON.parse((await ui.find({ type: 'Text' }))!.text).hint).toBe('? 查看快捷键')
  expect((await $.command.run({ ...COMMAND_CONTEXT, command: 'i18n', args: 'EN' })).text).toContain('UI language set to en')
  expect(JSON.parse((await ui.find({ type: 'Text' }))!.text).hint).toBe('? for shortcuts')
  expect(world.reads).toEqual(['locales/zh-CN.json'])
  expect((await $.command.run({ ...COMMAND_CONTEXT, command: 'i18n', args: 'zh-cn' })).text).toContain('界面语言已切换为 zh-CN')
  expect(JSON.parse((await ui.find({ type: 'Text' }))!.text).hint).toBe('? 查看快捷键')
  expect(world.reads).toEqual(['locales/zh-CN.json', 'locales/zh-CN.json'])
  expect(world.saves).toEqual([
    { key: 'i18n-mod.language', value: 'en' }, { key: 'i18n-mod.language', value: 'zh-CN' },
  ])
  await ui.unmount()
})

for (const source of ['locales/ja.json', 'D:/Language packs/ja.json', '/opt/lang/ja.json']) {
  test(`loads and persists external JSON source ${source}`, async ($, on) => {
    const world = mockWorld(on)
    world.files[source] = JSON.stringify(JA_DATA)
    renderProps(on)
    await start($)
    const result = await $.command.run({ ...COMMAND_CONTEXT, command: 'i18n', args: source })
    expect(result.text).toContain('UI language set to ja')
    expect(world.saves).toEqual([{ key: 'i18n-mod.language', value: source }])
    const ui = await $.ui.mount({
      plugin: 'i18n-mod', surface: 'terminal', component: 'PromptHint',
      props: { hint: '? for shortcuts', isDraft: false, isWorking: false },
    })
    expect(JSON.parse((await ui.find({ type: 'Text' }))!.text).hint).toBe('? ショートカット')
    await ui.unmount()
  })
}

test('loads a newly added language code without a static import or enum', async ($, on) => {
  const world = mockWorld(on)
  world.files['locales/ja.json'] = JSON.stringify(JA_DATA)
  await start($)
  expect((await $.command.run({ ...COMMAND_CONTEXT, command: 'i18n', args: 'ja' })).text).toContain('UI language set to ja')
  expect(world.reads).toEqual(['locales/zh-CN.json', 'locales/ja.json'])
  expect(world.saves).toEqual([{ key: 'i18n-mod.language', value: 'ja' }])
})

for (const content of ['{ invalid json', JSON.stringify({ ...JA_DATA, hints: 42 }), undefined]) {
  test(`rejects unreadable or invalid packs without saving ${String(content)}`, async ($, on) => {
    const world = mockWorld(on)
    if (content !== undefined) world.files['locales/ja.json'] = content
    await start($)
    const result = await $.command.run({ ...COMMAND_CONTEXT, command: 'i18n', args: 'ja' })
    expect(result.text).toContain('语言包加载失败')
    expect(world.saves).toEqual([])
    expect((await $.command.run({ ...COMMAND_CONTEXT, command: 'i18n', args: '' })).text).toContain('当前界面语言：zh-CN')
  })
}

test('preserves the cached language when JSON reload fails after a valid startup', async ($, on) => {
  const world = mockWorld(on)
  renderProps(on)
  await start($)
  world.files['locales/zh-CN.json'] = '{ broken'
  const result = await $.command.run({ ...COMMAND_CONTEXT, command: 'i18n', args: 'reload' })
  expect(result.text).toContain('语言包加载失败')
  expect(world.saves).toEqual([])
  const ui = await $.ui.mount({
    plugin: 'i18n-mod', surface: 'terminal', component: 'PromptHint',
    props: { hint: '? for shortcuts', isDraft: false, isWorking: false },
  })
  expect(JSON.parse((await ui.find({ type: 'Text' }))!.text).hint).toBe('? 查看快捷键')
  await ui.unmount()
})

test('reloads edited JSON and invalidates only the current cached pack', async ($, on) => {
  const world = mockWorld(on)
  renderProps(on)
  await start($)
  const ui = await $.ui.mount({
    plugin: 'i18n-mod', surface: 'terminal', component: 'PromptHint',
    props: { hint: '? for shortcuts', isDraft: false, isWorking: false },
  })
  world.files['locales/zh-CN.json'] = JSON.stringify({ ...ZH_DATA, hints: { shortcuts: '新译文' } })
  expect((await $.command.run({ ...COMMAND_CONTEXT, command: 'i18n', args: 'reload' })).text).toContain('语言包已重新加载')
  expect(JSON.parse((await ui.find({ type: 'Text' }))!.text).hint).toBe('? 新译文')
  expect(world.reads).toEqual(['locales/zh-CN.json', 'locales/zh-CN.json'])
  expect(world.saves).toEqual([])
  await ui.unmount()
})

test('failed hot reload keeps the previous selection from session state', async ($, on) => {
  const world = mockWorld(on)
  await start($)
  world.files['locales/zh-CN.json'] = '{ broken'
  await start($)
  expect(world.toasts.length).toBe(1)
  expect((await $.command.run({ ...COMMAND_CONTEXT, command: 'i18n', args: '' })).text).toContain('当前界面语言：zh-CN')
})

test('first startup with a missing configured pack falls back to original English', { options: { language: 'fr' } }, async ($, on) => {
  const world = mockWorld(on)
  await start($)
  expect(world.reads).toEqual(['locales/fr.json'])
  expect(world.toasts.length).toBe(1)
  expect((await $.command.run({ ...COMMAND_CONTEXT, command: 'i18n', args: '' })).text).toContain('Current UI language: en')
  expect(world.saves).toEqual([])
})

test('preserves active language when persisted settings are locked', async ($, on) => {
  const world = mockWorld(on)
  world.denySave = 'managed policy'
  await start($)
  expect((await $.command.run({ ...COMMAND_CONTEXT, command: 'i18n', args: 'en' })).text).toContain('界面语言保存失败：managed policy')
  expect((await $.command.run({ ...COMMAND_CONTEXT, command: 'i18n', args: '' })).text).toContain('当前界面语言：zh-CN')
  expect(world.saves).toEqual([])
})

test('honors the language source returned by host settings hooks', async ($, on) => {
  const world = mockWorld(on)
  world.rewriteSave = 'zh-CN'
  await start($)
  expect((await $.command.run({ ...COMMAND_CONTEXT, command: 'i18n', args: 'en' })).text).toContain('界面语言已切换为 zh-CN')
})

for (const content of [JSON.stringify(JA_DATA), '{ broken']) {
  test(`validates /config changes before the host writes ${content}`, async ($, on) => {
    const world = mockWorld(on)
    world.files['locales/ja.json'] = content
    await start($)
    const result = await $.config.set({
      key: 'i18n-mod.language', value: 'ja', previous: 'zh-CN',
      provider: { plugin: 'i18n-mod', tier: 'user' }, origin: { kind: 'composer' },
    })
    if (content.startsWith('{ broken')) {
      expect(result.deny).toContain('语言包加载失败')
      expect(world.saves).toEqual([])
    } else {
      expect(result.value).toBe('ja')
      expect(world.saves).toEqual([{ key: 'i18n-mod.language', value: 'ja' }])
      expect((await $.command.run({ ...COMMAND_CONTEXT, command: 'i18n', args: '' })).text).toContain('Current UI language: ja')
    }
  })
}

test('releases the provisional pack after a denied save before later config validation', async ($, on) => {
  const world = mockWorld(on)
  world.files['locales/ja.json'] = JSON.stringify(JA_DATA)
  world.denySave = 'managed policy'
  await start($)
  expect((await $.command.run({ ...COMMAND_CONTEXT, command: 'i18n', args: 'ja' })).text).toContain('界面语言保存失败')
  world.denySave = ''
  world.files['locales/ja.json'] = '{ broken'
  const result = await $.config.set({
    key: 'i18n-mod.language', value: 'ja', previous: 'zh-CN',
    provider: { plugin: 'i18n-mod', tier: 'user' }, origin: { kind: 'composer' },
  })
  expect(result.deny).toContain('语言包加载失败')
  expect(world.saves).toEqual([])
})

test('keeps active language when a host hook saves an unreadable replacement source', async ($, on) => {
  const world = mockWorld(on)
  world.rewriteSave = 'missing'
  await start($)
  const result = await $.command.run({ ...COMMAND_CONTEXT, command: 'i18n', args: 'en' })
  expect(result.text).toContain('界面语言保存失败')
  expect((await $.command.run({ ...COMMAND_CONTEXT, command: 'i18n', args: '' })).text).toContain('当前界面语言：zh-CN')
})

// 任务 5：只通过现有 i18n 来源切换同一挂载实例，不引入第二份组件语言配置。
function mockLocalizedDurationWorld(on: On) {
  const world = mockWorld(on)
  world.files['locales/zh-CN.json'] = JSON.stringify(ZH_DURATION_DATA)
  world.files['locales/ja.json'] = JSON.stringify(JA_DURATION_DATA)
  let nativeCalls = 0
  on('ui.render', { component: 'TurnDuration' }, ($, e) => {
    nativeCalls++
    return { type: 'Text', children: [`${e.props.word} for 1m 4s · done 15:53`] }
  })
  return { world, nativeCalls: () => nativeCalls }
}

const LOCALIZED_DURATION = { word: 'Baked', durationMs: 64000, onScreen: null } as const

for (const via of ['command', 'config'] as const) {
  test(`custom duration redraws Chinese → English → Chinese via ${via} on one mounted instance`, {
    options: { turnDurationMode: 'custom', turnDurationSpacing: 'separated' },
  }, async ($, on) => {
    const { world, nativeCalls } = mockLocalizedDurationWorld(on)
    await start($)
    const ui = await $.ui.mount({ plugin: 'i18n-mod', surface: 'terminal', component: 'TurnDuration', props: LOCALIZED_DURATION })
    expect((await ui.find({ type: 'Text', text: '本轮用时 1m 4s' }))?.text).toBe('本轮用时 1m 4s')
    expect(nativeCalls()).toBe(0)
    for (const [language, previous] of [['en', 'zh-CN'], ['zh-CN', 'en']] as const) {
      if (via === 'command') {
        await $.command.run({ ...COMMAND_CONTEXT, command: 'i18n', args: language })
      } else {
        expect((await $.config.set(durationChange('language', language, previous))).value).toBe(language)
      }
      const expected = language === 'en' ? 'Baked for 1m 4s · done 15:53' : '本轮用时 1m 4s'
      expect((await ui.find({ type: 'Text', text: expected }))?.text).toBe(expected)
      expect(await ui.find({ type: 'Text', text: language === 'en' ? '本轮用时 1m 4s' : 'Baked for 1m 4s · done 15:53' })).toBeUndefined()
    }
    const tree = await ui.drawn()
    expect(tree.type === 'Box' ? tree.props?.marginTop : undefined).toBe(1)
    expect(world.reads).toEqual(['locales/zh-CN.json', 'locales/zh-CN.json'])
    expect(world.saves).toEqual([
      { key: 'i18n-mod.language', value: 'en' }, { key: 'i18n-mod.language', value: 'zh-CN' },
    ])
    await ui.unmount()
  })
}

for (const source of ['ja', '/opt/lang/custom-ja.json']) {
  test(`custom duration takes Japanese text from language source ${source}, not panel en/zh`, {
    options: { turnDurationMode: 'custom' },
  }, async ($, on) => {
    const { world, nativeCalls } = mockLocalizedDurationWorld(on)
    if (source !== 'ja') world.files[source] = JSON.stringify(JA_DURATION_DATA)
    // 面板界面语言与 i18n 来源不同；任何读取该文件都会出现在 reads 中。
    world.files['/home/test/.config/my-cc-mods/config.json'] = JSON.stringify({ language: 'zh' })
    await start($)
    const ui = await $.ui.mount({ plugin: 'i18n-mod', surface: 'terminal', component: 'TurnDuration', props: LOCALIZED_DURATION })
    await $.command.run({ ...COMMAND_CONTEXT, command: 'i18n', args: source })
    expect((await ui.find({ type: 'Text', text: 'このターンの所要時間 1m 4s' }))?.text).toBe('このターンの所要時間 1m 4s')
    expect(await ui.find({ type: 'Text', text: '本轮用时 1m 4s' })).toBeUndefined()
    expect(nativeCalls()).toBe(0)
    expect(world.saves).toEqual([{ key: 'i18n-mod.language', value: source }])
    expect(world.reads).toEqual(['locales/zh-CN.json', source === 'ja' ? 'locales/ja.json' : source])
    await ui.unmount()
  })
}

test('reload updates the existing duration from edited JSON, and template removal restores the whole native line', {
  options: { turnDurationMode: 'custom' },
}, async ($, on) => {
  const { world, nativeCalls } = mockLocalizedDurationWorld(on)
  await start($)
  const ui = await $.ui.mount({ plugin: 'i18n-mod', surface: 'terminal', component: 'TurnDuration', props: LOCALIZED_DURATION })
  expect((await ui.find({ type: 'Text', text: '本轮用时 1m 4s' }))?.text).toBe('本轮用时 1m 4s')
  world.files['locales/zh-CN.json'] = JSON.stringify({ ...ZH_DURATION_DATA, turnDuration: { elapsed: '耗时记录 [{duration}]' } })
  await ui.redraw(LOCALIZED_DURATION)
  expect((await ui.find({ type: 'Text', text: '本轮用时 1m 4s' }))?.text).toBe('本轮用时 1m 4s')
  expect(world.reads).toEqual(['locales/zh-CN.json'])
  for (const [data, expected] of [
    [{ ...ZH_DURATION_DATA, turnDuration: { elapsed: '耗时记录 [{duration}]' } }, '耗时记录 [1m 4s]'],
    [ZH_DATA, 'Baked for 1m 4s · done 15:53'],
    [ZH_DURATION_DATA, '本轮用时 1m 4s'],
  ] as const) {
    world.files['locales/zh-CN.json'] = JSON.stringify(data)
    expect((await $.command.run({ ...COMMAND_CONTEXT, command: 'i18n', args: 'reload' })).text).toContain('语言包已重新加载')
    expect((await ui.find({ type: 'Text', text: expected }))?.text).toBe(expected)
  }
  expect(await ui.find({ type: 'Text', text: 'Baked for 1m 4s · done 15:53' })).toBeUndefined()
  expect(nativeCalls()).toBeGreaterThan(0)
  expect(world.reads).toEqual(Array(4).fill('locales/zh-CN.json'))
  expect(world.saves).toEqual([])
  await ui.unmount()
})

test('switching to a valid language with no duration template falls back as a whole, never to legacy duration text', {
  options: { turnDurationMode: 'custom' },
}, async ($, on) => {
  const { world } = mockLocalizedDurationWorld(on)
  world.files['locales/ja.json'] = JSON.stringify({ ...JA_DATA, completed: '完了', duration: '旧文言 {word}: {duration}' })
  await start($)
  const ui = await $.ui.mount({ plugin: 'i18n-mod', surface: 'terminal', component: 'TurnDuration', props: LOCALIZED_DURATION })
  expect((await ui.find({ type: 'Text', text: '本轮用时 1m 4s' }))?.text).toBe('本轮用时 1m 4s')
  expect((await $.config.set(durationChange('language', 'ja', 'zh-CN'))).value).toBe('ja')
  expect(await ui.drawn()).toEqual({ type: 'Text', children: ['Baked for 1m 4s · done 15:53'], part: { plugin: 'test' } })
  expect(world.saves).toEqual([{ key: 'i18n-mod.language', value: 'ja' }])
  await ui.unmount()
})

test('duration redraws use only the cached selected pack with no file, directory or settings reads', {
  options: { language: 'ja', turnDurationMode: 'custom' },
}, async ($, on) => {
  const { world, nativeCalls } = mockLocalizedDurationWorld(on)
  await start($)
  const ui = await $.ui.mount({ plugin: 'i18n-mod', surface: 'terminal', component: 'TurnDuration', props: LOCALIZED_DURATION })
  world.files['locales/ja.json'] = '{ broken after startup'
  for (const durationMs of [0, 64000, 758000, 3600000, 86400000, 64000]) {
    await ui.redraw({ word: 'UnknownWord', durationMs, onScreen: null })
  }
  expect((await ui.find({ type: 'Text', text: 'このターンの所要時間 1m 4s' }))?.text).toBe('このターンの所要時間 1m 4s')
  expect(nativeCalls()).toBe(0)
  expect(world.reads).toEqual(['locales/ja.json'])
  expect(world.lists).toBe(0)
  expect(world.saves).toEqual([])
  expect(world.toasts).toEqual([])
  await ui.unmount()
})

for (const content of ['{ broken', JSON.stringify({ ...ZH_DATA, turnDuration: { elapsed: '没有占位符' } })]) {
  test(`failed duration-template reload preserves an already mounted row: ${content}`, {
    options: { turnDurationMode: 'custom' },
  }, async ($, on) => {
    const { world, nativeCalls } = mockLocalizedDurationWorld(on)
    await start($)
    const ui = await $.ui.mount({ plugin: 'i18n-mod', surface: 'terminal', component: 'TurnDuration', props: LOCALIZED_DURATION })
    world.files['locales/zh-CN.json'] = content
    expect((await $.command.run({ ...COMMAND_CONTEXT, command: 'i18n', args: 'reload' })).text).toContain('语言包加载失败')
    await ui.redraw(LOCALIZED_DURATION)
    expect((await ui.find({ type: 'Text', text: '本轮用时 1m 4s' }))?.text).toBe('本轮用时 1m 4s')
    expect(nativeCalls()).toBe(0)
    expect(world.reads).toEqual(['locales/zh-CN.json', 'locales/zh-CN.json'])
    expect(world.saves).toEqual([])
    await ui.unmount()
  })
}

for (const via of ['command', 'config'] as const) {
  test(`denied ${via} language save preserves the duration and releases the provisional pack`, {
    options: { turnDurationMode: 'custom' },
  }, async ($, on) => {
    const { world, nativeCalls } = mockLocalizedDurationWorld(on)
    await start($)
    const ui = await $.ui.mount({ plugin: 'i18n-mod', surface: 'terminal', component: 'TurnDuration', props: LOCALIZED_DURATION })
    world.denySave = 'managed policy'
    if (via === 'command') {
      expect((await $.command.run({ ...COMMAND_CONTEXT, command: 'i18n', args: 'ja' })).text).toContain('界面语言保存失败')
    } else {
      expect((await $.config.set(durationChange('language', 'ja', 'zh-CN'))).deny).toBe('managed policy')
    }
    expect((await ui.find({ type: 'Text', text: '本轮用时 1m 4s' }))?.text).toBe('本轮用时 1m 4s')
    world.denySave = ''
    world.files['locales/ja.json'] = '{ invalid after denied save'
    expect((await $.config.set(durationChange('language', 'ja', 'zh-CN'))).deny).toContain('语言包加载失败')
    expect((await ui.find({ type: 'Text', text: '本轮用时 1m 4s' }))?.text).toBe('本轮用时 1m 4s')
    expect(nativeCalls()).toBe(0)
    expect(world.saves).toEqual([])
    expect(world.reads).toEqual(['locales/zh-CN.json', 'locales/ja.json', 'locales/ja.json'])
    await ui.unmount()
  })
}

for (const via of ['command', 'config'] as const) {
  test(`duration uses the final language source returned by the host for ${via} saves`, {
    options: { turnDurationMode: 'custom' },
  }, async ($, on) => {
    const { world, nativeCalls } = mockLocalizedDurationWorld(on)
    world.rewriteSave = 'ja'
    await start($)
    const ui = await $.ui.mount({ plugin: 'i18n-mod', surface: 'terminal', component: 'TurnDuration', props: LOCALIZED_DURATION })
    if (via === 'command') await $.command.run({ ...COMMAND_CONTEXT, command: 'i18n', args: 'en' })
    else expect((await $.config.set(durationChange('language', 'en', 'zh-CN'))).value).toBe('ja')
    expect((await ui.find({ type: 'Text', text: 'このターンの所要時間 1m 4s' }))?.text).toBe('このターンの所要時間 1m 4s')
    expect(nativeCalls()).toBe(0)
    expect(world.reads).toEqual(['locales/zh-CN.json', 'locales/ja.json'])
    await ui.unmount()
  })
}

// 测试 Engine 不公开 state noun；由独立、受宿主扫描的 fixture 通过真实状态 API 读写。
const STATE_FIXTURE: Plugin = {
  name: 'i18n-state-fixture',
  register(on) {
    const durationRef = { plugin: 'i18n-mod', key: 'turnDuration' } as const
    // 测试保留状态只能从 state.get 宿主 fixture 注入；不能越权写其他插件 state。
    let retained: { value: TurnDurationConfig; version: number } | undefined
    on('state.get', { plugin: 'i18n-mod', key: 'turnDuration' }, ($, e, next) => retained ? { value: retained } : next(e))
    on('state.set', { plugin: 'i18n-mod', key: 'turnDuration' }, async ($, e, next) => {
      const result = await next(e)
      if (result.value?.isSet) retained = undefined
      return result
    })
    on('command.run', { command: 'test-i18n-state' }, async ($, e) => {
      const args = JSON.parse(e.args) as { key: string; value?: TurnDurationConfig }
      if (args.value !== undefined) retained = { value: args.value, version: 100 }
      const state = args.key === 'selection'
        ? await $.state.get({ plugin: 'i18n-mod', key: 'selection' })
        : await $.state.get(durationRef)
      return { text: JSON.stringify(state) }
    })
  },
}

function durationTest(name: string, ...rest: TestRest): void {
  if (rest.length === 1) test(name, { plugins: [STATE_FIXTURE] }, rest[0])
  else test(name, { ...rest[0], plugins: [STATE_FIXTURE] }, rest[1])
}

function withState(engine: Engine) {
  const access = async (args: { key: string; value?: TurnDurationConfig }) => {
    const result = await engine.command.run({ ...COMMAND_CONTEXT, command: 'test-i18n-state', args: JSON.stringify(args) })
    return JSON.parse(result.text!) as { value: unknown; version: number }
  }
  return Object.assign(Object.create(engine) as Engine, { state: {
    get: (ref: { plugin?: string; key: string }) => access(ref),
    set: (input: { plugin?: string; key: string; value: TurnDurationConfig }) => access(input),
  } })
}

const TURN_DURATION_REF = { plugin: 'i18n-mod', key: 'turnDuration' } as const
const DEFAULT_DURATION: TurnDurationConfig = { mode: 'native', visible: true, spacing: 'compact' }
const CUSTOM_DURATION: TurnDurationConfig = { mode: 'custom', visible: false, spacing: 'separated' }

function durationChange(key: string, value: ConfigValue, previous: ConfigValue): ConfigSetInput {
  return {
    key: `i18n-mod.${key}`, value, previous,
    provider: { plugin: 'i18n-mod', tier: 'user' }, origin: { kind: 'composer' },
  }
}

durationTest('initializes declared TurnDuration state from manifest defaults', async (engine, on) => {
  const $ = withState(engine)
  const world = mockWorld(on)
  await start($)
  expect((await $.state.get(TURN_DURATION_REF)).value).toEqual(DEFAULT_DURATION)
  expect(world.saves).toEqual([])
})

for (const mode of ['native', 'custom'] as const) {
  for (const visible of [true, false]) {
    for (const spacing of ['compact', 'separated'] as const) {
      durationTest(`initializes TurnDuration options ${mode}/${visible}/${spacing} over retained session state`, {
        options: { turnDurationMode: mode, turnDurationVisible: visible, turnDurationSpacing: spacing },
      }, async (engine, on) => {
        const $ = withState(engine)
        const world = mockWorld(on)
        // 热重载生命周期 fixture：宿主保留旧 state，新 activation 以 options 重建。
        await $.state.set({ ...TURN_DURATION_REF, value: CUSTOM_DURATION })
        await start($)
        expect((await $.state.get(TURN_DURATION_REF)).value).toEqual({ mode, visible, spacing })
        expect(world.saves).toEqual([])
      })
    }
  }
}

for (const [key, value] of [
  ['turnDurationMode', 'future'], ['turnDurationSpacing', 'future'],
] as const) {
  durationTest(`uses the manifest default for an unlisted stored ${key}`, { options: { [key]: value } }, async (engine, on) => {
    const $ = withState(engine)
    mockWorld(on)
    await start($)
    expect((await $.state.get(TURN_DURATION_REF)).value).toEqual(DEFAULT_DURATION)
  })
}

durationTest('rebuilds component state on session.start even when language reload fails', {
  options: { turnDurationMode: 'custom', turnDurationVisible: false, turnDurationSpacing: 'separated' },
}, async (engine, on) => {
  const $ = withState(engine)
  const world = mockWorld(on)
  await start($)
  await $.state.set({ ...TURN_DURATION_REF, value: DEFAULT_DURATION })
  world.files['locales/zh-CN.json'] = '{ broken'
  await start($)
  expect((await $.state.get(TURN_DURATION_REF)).value).toEqual(CUSTOM_DURATION)
  expect(world.toasts.length).toBe(1)
  expect((await $.command.run({ ...COMMAND_CONTEXT, command: 'i18n', args: '' })).text).toContain('当前界面语言：zh-CN')
})

const DURATION_CHANGES = [
  { key: 'turnDurationMode', field: 'mode', value: 'custom', previous: 'native' },
  { key: 'turnDurationMode', field: 'mode', value: 'native', previous: 'custom' },
  { key: 'turnDurationVisible', field: 'visible', value: false, previous: true },
  { key: 'turnDurationVisible', field: 'visible', value: true, previous: false },
  { key: 'turnDurationSpacing', field: 'spacing', value: 'separated', previous: 'compact' },
  { key: 'turnDurationSpacing', field: 'spacing', value: 'compact', previous: 'separated' },
] as const

for (const change of DURATION_CHANGES) {
  durationTest(`applies only saved ${change.key}=${change.value}, after the host succeeds`, async (engine, on) => {
    const $ = withState(engine)
    const before = { ...CUSTOM_DURATION, [change.field]: change.previous }
    let hostCalls = 0
    on('config.set', { key: `i18n-mod.${change.key}` }, ($, e) => {
      hostCalls++
      return { value: e.value }
    })
    mockWorld(on)
    await start($)
    await $.state.set({ ...TURN_DURATION_REF, value: before })
    const result = await $.config.set(durationChange(change.key, change.value, change.previous))
    expect(result).toEqual({ value: change.value })
    expect(hostCalls).toBe(1)
    expect((await $.state.get(TURN_DURATION_REF)).value).toEqual({ ...before, [change.field]: change.value })
  })
}

for (const change of [DURATION_CHANGES[0], DURATION_CHANGES[2], DURATION_CHANGES[4]]) {
  durationTest(`does not apply ${change.key} before awaiting a host save`, async (engine, on) => {
    const $ = withState(engine)
    let seen: unknown
    on('config.set', { key: `i18n-mod.${change.key}` }, async (_host, e) => {
      seen = (await $.state.get(TURN_DURATION_REF)).value
      return { value: e.value }
    })
    mockWorld(on)
    await start($)
    await $.config.set(durationChange(change.key, change.value, change.previous))
    expect(seen).toEqual(DEFAULT_DURATION)
    expect((await $.state.get(TURN_DURATION_REF)).value).toEqual({ ...DEFAULT_DURATION, [change.field]: change.value })
  })

  durationTest(`keeps state and its version when the host denies ${change.key}`, async (engine, on) => {
    const $ = withState(engine)
    const world = mockWorld(on)
    await start($)
    const before = await $.state.get(TURN_DURATION_REF)
    world.denySave = 'managed policy'
    expect(await $.config.set(durationChange(change.key, change.value, change.previous))).toEqual({ deny: 'managed policy' })
    expect(await $.state.get(TURN_DURATION_REF)).toEqual(before)
    expect(world.saves).toEqual([])
  })

  durationTest(`uses the final host value rather than the requested ${change.key}`, async (engine, on) => {
    const $ = withState(engine)
    on('config.set', { key: `i18n-mod.${change.key}` }, () => ({ value: change.previous }))
    mockWorld(on)
    await start($)
    await $.state.set({ ...TURN_DURATION_REF, value: { ...CUSTOM_DURATION, [change.field]: change.value } })
    const result = await $.config.set(durationChange(change.key, change.value, change.previous))
    expect(result).toEqual({ value: change.previous })
    expect((await $.state.get(TURN_DURATION_REF)).value).toEqual({ ...CUSTOM_DURATION, [change.field]: change.previous })
  })
}

for (const [key, invalid] of [
  ['turnDurationMode', ['', 'CUSTOM', ' native', 'future', true, 1, ['custom']]],
  ['turnDurationVisible', ['', 'false', 'true', 0, 1, ['false']]],
  ['turnDurationSpacing', ['', 'SEPARATED', ' compact', 'future', false, 1, ['separated']]],
] as const) {
  for (const value of invalid) {
    durationTest(`rejects invalid ${key}=${JSON.stringify(value)} without host writes or state changes`, async (engine, on) => {
      const $ = withState(engine)
      const world = mockWorld(on)
      await start($)
      const before = await $.state.get(TURN_DURATION_REF)
      const result = await $.config.set(durationChange(key, value, 'unchanged'))
      expect(typeof result.deny).toBe('string')
      expect(await $.state.get(TURN_DURATION_REF)).toEqual(before)
      expect(world.saves).toEqual([])
    })
  }
}

durationTest('component settings do not load languages or block saving when the language file becomes invalid', async (engine, on) => {
  const $ = withState(engine)
  const world = mockWorld(on)
  await start($)
  world.files['locales/zh-CN.json'] = '{ broken'
  for (const change of [DURATION_CHANGES[0], DURATION_CHANGES[2], DURATION_CHANGES[4]]) {
    expect(await $.config.set(durationChange(change.key, change.value, change.previous))).toEqual({ value: change.value })
  }
  expect((await $.state.get(TURN_DURATION_REF)).value).toEqual(CUSTOM_DURATION)
  expect(world.reads).toEqual(['locales/zh-CN.json'])
  expect(world.toasts).toEqual([])
})

durationTest('language saves, reloads and rejected candidates leave component settings intact', async (engine, on) => {
  const $ = withState(engine)
  const world = mockWorld(on)
  await start($)
  await $.state.set({ ...TURN_DURATION_REF, value: CUSTOM_DURATION })
  const before = await $.state.get(TURN_DURATION_REF)
  expect((await $.config.set(durationChange('language', 'en', 'zh-CN'))).value).toBe('en')
  expect((await $.command.run({ ...COMMAND_CONTEXT, command: 'i18n', args: 'zh-CN' })).text).toContain('界面语言已切换')
  expect((await $.command.run({ ...COMMAND_CONTEXT, command: 'i18n', args: 'reload' })).text).toContain('语言包已重新加载')
  expect((await $.config.set(durationChange('language', 'missing', 'zh-CN'))).deny).toContain('语言包加载失败')
  expect(await $.state.get(TURN_DURATION_REF)).toEqual(before)
})

durationTest('unrelated config rows pass through without touching either state or reading files', async (engine, on) => {
  const $ = withState(engine)
  const world = mockWorld(on)
  await start($)
  const before = await $.state.get(TURN_DURATION_REF)
  const selection = await $.state.get({ plugin: 'i18n-mod', key: 'selection' })
  for (const key of ['other-mod.turnDurationMode', 'i18n-mod.turnDurationModeExtra', 'verbose']) {
    const input = { ...durationChange('unused', true, false), key }
    expect(await $.config.set(input)).toEqual({ value: true })
  }
  expect(await $.state.get(TURN_DURATION_REF)).toEqual(before)
  expect(await $.state.get({ plugin: 'i18n-mod', key: 'selection' })).toEqual(selection)
  expect(world.reads).toEqual(['locales/zh-CN.json'])
  expect(world.saves.length).toBe(3)
})

durationTest('duration configuration writes redraw the subscribed duration, including native fallback without a template', async (engine, on) => {
  const $ = withState(engine)
  mockWorld(on)
  let renders = 0
  on('ui.render', ($, e) => {
    renders++
    return { type: 'Text', children: [JSON.stringify(e.props)] }
  })
  await start($)
  const props = { word: 'Baked', durationMs: 64000, onScreen: null }
  const ui = await $.ui.mount({ plugin: 'i18n-mod', surface: 'terminal', component: 'TurnDuration', props })
  const text = (await ui.find({ type: 'Text' }))!.text
  const before = renders
  await $.config.set(durationChange('turnDurationMode', 'custom', 'native'))
  expect((await ui.find({ type: 'Text' }))!.text).toBe(text)
  expect(renders).toBeGreaterThan(before)
  await ui.unmount()
})

for (const input of [
  { component: 'PromptHint', props: { hint: '? for shortcuts', isDraft: false, isWorking: false } },
  { component: 'Spinner', props: { word: 'Sauteing', message: null, suffix: '…', mode: 'thinking' } },
  { component: 'SessionMode', props: { modes: ['focus'] } },
  { component: 'ToolProgress', props: { kind: 'background_hint', tool_use_id: 'tool-2', hint: '(ctrl+b to run in background)' } },
  { component: 'InfoNotice', props: { text: 'Update available', command: '/help' } },
] as const) {
  test(`${input.component} does not subscribe to unrelated duration settings`, async ($, on) => {
    mockDurationWorld(on)
    let durationReads = 0
    let renders = 0
    on('state.get', { plugin: 'i18n-mod', key: 'turnDuration' }, async ($, e, next) => {
      durationReads++
      return next(e)
    })
    on('ui.render', ($, e) => {
      renders++
      return { type: 'Text', children: [JSON.stringify(e.props)] }
    })
    await start($)
    const readsBefore = durationReads
    const ui = await $.ui.mount({ plugin: 'i18n-mod', surface: 'terminal', ...input })
    expect(durationReads).toBe(readsBefore)
    const rendersBefore = renders
    const text = (await ui.find({ type: 'Text' }))?.text
    await $.config.set(durationChange('turnDurationMode', 'custom', 'native'))
    expect((await ui.find({ type: 'Text' }))?.text).toBe(text)
    expect(renders).toBe(rendersBefore)
    await ui.unmount()
  })
}

test('saved component settings redraw one mounted duration between native, custom, spaced, hidden and native again', async ($, on) => {
  mockDurationWorld(on)
  let nativeCalls = 0
  on('ui.render', { component: 'TurnDuration' }, () => {
    nativeCalls++
    return { type: 'Text', children: ['Baked for 1m 4s · done 15:53'] }
  })
  await start($)
  const props = { word: 'Baked', durationMs: 64000, onScreen: null }
  const ui = await $.ui.mount({ plugin: 'i18n-mod', surface: 'terminal', component: 'TurnDuration', props })
  expect((await ui.find({ type: 'Text' }))?.text).toBe('Baked for 1m 4s · done 15:53')
  const initialNativeCalls = nativeCalls
  await $.config.set(durationChange('turnDurationMode', 'custom', 'native'))
  expect((await ui.find({ type: 'Text', text: '本轮用时 1m 4s' }))?.text).toBe('本轮用时 1m 4s')
  expect(await ui.find({ type: 'Text', text: 'Baked for 1m 4s · done 15:53' })).toBeUndefined()
  const compact = await ui.drawn()
  expect(compact.type === 'Box' ? compact.props?.marginTop : undefined).toBe(0)
  await $.config.set(durationChange('turnDurationSpacing', 'separated', 'compact'))
  const separated = await ui.drawn()
  expect(separated.type === 'Box' ? separated.props?.marginTop : undefined).toBe(1)
  await $.config.set(durationChange('turnDurationVisible', false, true))
  expect(await ui.drawn()).toEqual({ type: 'Box', children: [], part: { plugin: 'i18n-mod' } })
  expect(nativeCalls).toBe(initialNativeCalls)
  await $.config.set(durationChange('turnDurationMode', 'native', 'custom'))
  expect((await ui.find({ type: 'Text' }))?.text).toBe('Baked for 1m 4s · done 15:53')
  expect(nativeCalls).toBeGreaterThan(initialNativeCalls)
  await ui.unmount()
})

test('fresh register activations rebuild retained component state from changed host options', async () => {
  type StartHook = ($: EngineInterface, e: unknown, next: (e: unknown) => Promise<{ cwd: string }>) => Promise<unknown>
  const values: Record<string, unknown> = { turnDuration: CUSTOM_DURATION }
  const host = {
    plugin: { root: '/i18n-mod' },
    state: {
      get: async (ref: { key: string }) => ({ value: values[ref.key], version: 1 }),
      set: async (ref: { key: string }, value: unknown) => {
        values[ref.key] = value
        return { isSet: true, version: 2 }
      },
    },
    command: { register: async () => ({ command: 'i18n' }) },
  } as unknown as EngineInterface
  const activate = async (options: PluginOptions) => {
    let sessionStart: StartHook | undefined
    const capture = ((event: string, hook: unknown) => {
      if (event === 'session.start') sessionStart = hook as StartHook
      return { catch() {} }
    }) as unknown as On
    register(capture, { language: 'en', ...options })
    expect(sessionStart).toBeDefined()
    await sessionStart!(host, { cwd: '/project', surface: 'terminal', isInteractive: true }, async () => ({ cwd: '/project' }))
  }
  await activate({ turnDurationMode: 'custom', turnDurationVisible: false, turnDurationSpacing: 'separated' })
  expect(values.turnDuration).toEqual(CUSTOM_DURATION)
  await activate({ turnDurationMode: 'native', turnDurationVisible: false, turnDurationSpacing: 'separated' })
  expect(values.turnDuration).toEqual({ ...CUSTOM_DURATION, mode: 'native' })
  await activate({})
  expect(values.turnDuration).toEqual(DEFAULT_DURATION)
})

test('a rejecting downstream config save cannot apply provisional component state', async () => {
  // 直接调用捕获到的注册 hook 注入 next rejection，避免引擎将测试宿主的 throw 计作 fixture 故障。
  type ConfigHook = ($: EngineInterface, e: ConfigSetInput, next: () => Promise<ConfigSetResult>) => Promise<ConfigSetResult>
  let configHook: ConfigHook | undefined
  const capture = ((event: string, matcher: unknown, hook: unknown) => {
    if (event === 'config.set' && JSON.stringify(matcher).includes('turnDurationMode')) configHook = hook as ConfigHook
    return { catch() {} }
  }) as unknown as On
  register(capture, {})
  expect(configHook).toBeDefined()
  let writes = 0
  const host = { state: {
    get: async () => ({ value: DEFAULT_DURATION, version: 1 }),
    set: async () => { writes++; return { isSet: true, version: 2 } },
  } } as unknown as EngineInterface
  let rejected = false
  try {
    await configHook!(host, durationChange('turnDurationMode', 'custom', 'native'), async () => { throw new Error('host write failed') })
  } catch {
    rejected = true
  }
  expect(rejected).toBe(true)
  expect(writes).toBe(0)
})
