import { expect, test } from 'claude-code/testing'
import type { On } from 'claude-code'
import type { Engine } from 'claude-code/testing'
import { mockWorld, JA_DATA, ZH_DATA } from './fixtures'

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
  test(`rewrites supported hint props on ${surface} without dropping metadata`, async ($, on) => {
    mockWorld(on)
    renderProps(on)
    await start($)
    const ui = await $.ui.mount({
      plugin: 'i18n-mod', surface, component: 'PromptHint', requestId: 'hint',
      props: { hint: '? for shortcuts · esc to interrupt', isDraft: true, isWorking: true, tail: 'custom tail' },
    })
    expect(JSON.parse((await ui.find({ type: 'Text' }))!.text)).toEqual({
      hint: '? 查看快捷键 · esc 中断', isDraft: true, isWorking: true, tail: 'custom tail',
    })
    await ui.unmount()
  })

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
  expect(JSON.parse((await ui.find({ type: 'Text' }))!.text).text).toBe('Update available for D:/work/project')
  await ui.unmount()
})

test('renders a complete translated duration line instead of mixed grammar', async ($, on) => {
  mockWorld(on)
  renderProps(on)
  await start($)
  const ui = await $.ui.mount({
    plugin: 'i18n-mod', surface: 'terminal', component: 'TurnDuration',
    props: { word: 'Baked', durationMs: 64000, onScreen: null },
  })
  expect((await ui.find({ type: 'Text' }))?.text).toBe('已完成，用时 1m 4s')
  await ui.redraw({ word: 'FutureVerb', durationMs: 3500 })
  expect(JSON.parse((await ui.find({ type: 'Text' }))!.text)).toEqual({ word: 'FutureVerb', durationMs: 3500 })
  await ui.unmount()
})

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
      props: { hint: '? for shortcuts · esc to interrupt', isDraft: false, isWorking: false },
    })
    expect(JSON.parse((await ui.find({ type: 'Text' }))!.text).hint).toBe('? ショートカット · esc to interrupt')
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
