import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { ConfigRow, EngineInterface, On } from 'claude-code'
import { DEFAULT_CONFIG, normalizeConfig, register } from '../hooks/register'

const COMMAND_CONTEXT = {
  origin: { kind: 'composer' },
  presentation: { isFullscreen: false, columns: 120 },
} as const
const PANE = 'my-cc-mods-config'

function mockConfig(on: On) {
  const world = {
    loaded: true, locked: false, source: 'zh-CN',
    deny: '', failFile: false,
    duration: { turnDurationMode: 'native', turnDurationVisible: true, turnDurationSpacing: 'compact' } as Record<string, string | boolean>,
    missing: [] as string[], lockedKeys: [] as string[], attempts: [] as string[],
    denyKey: '', throwKey: '', failList: false,
    finalValues: {} as Record<string, string | boolean>,
    changes: [] as unknown[], writes: [] as string[], commands: [] as string[],
    toasts: [] as string[], opened: [] as string[], paths: [] as string[],
    file: JSON.stringify(DEFAULT_CONFIG),
  }
  mock.env(on, { HOME: '/test-home' })
  on('fs.read', () => ({ value: world.file }))
  on('fs.write', ($, e) => {
    if (world.failFile) return { deny: 'disk write refused' }
    world.writes.push(e.text)
    world.paths.push(e.path)
    world.file = e.text
    return { value: undefined }
  })
  on('config.list', () => {
    if (world.failList) throw new Error('config listing unavailable')
    const rows: ConfigRow[] = [{
      key: 'i18n-mod.language', label: 'UI language / JSON language pack', kind: 'text',
      value: world.source, provider: { plugin: 'i18n-mod', tier: 'user' }, isLocked: world.locked,
    }, ...Object.entries(world.duration).map(([field, value]): ConfigRow => ({
      key: `i18n-mod.${field}`, label: field, kind: field === 'turnDurationVisible' ? 'boolean' : 'choice',
      value, options: field === 'turnDurationMode' ? ['native', 'custom'] : field === 'turnDurationSpacing' ? ['compact', 'separated'] : undefined,
      provider: { plugin: 'i18n-mod', tier: 'user' }, isLocked: world.lockedKeys.includes(`i18n-mod.${field}`),
    }))]
    return { value: world.loaded ? rows.filter(row => !world.missing.includes(row.key)) : [] }
  })
  on('config.set', ($, e) => {
    world.attempts.push(e.key)
    if (world.throwKey === e.key) throw new Error('host save threw')
    if (world.denyKey === e.key) return { deny: 'host save refused' }
    if (world.deny) return { deny: world.deny }
    const value = world.finalValues[e.key] ?? e.value
    world.changes.push({ key: e.key, value })
    if (e.key === 'i18n-mod.language') world.source = String(value)
    else world.duration[e.key.replace('i18n-mod.', '')] = value as string | boolean
    return { value }
  })
  on('command.run', { command: 'i18n' }, ($, e) => {
    world.commands.push(e.args)
    return { text: 'Language pack reloaded.' }
  })
  on('ui.open', ($, e) => {
    world.opened.push(e.title ?? '')
    return { value: { isPlaced: true } }
  })
  on('ui.close', () => ({ value: undefined }))
  on('ui.toast', ($, e) => {
    world.toasts.push(e.text)
    return { value: undefined }
  })
  return world
}

async function openConfig($: Engine): Promise<void> {
  await $.command.run({ ...COMMAND_CONTEXT, command: 'my-cc-mods-config', args: '' })
}

function mountConfig($: Engine, surface: 'terminal' | 'desktop' = 'terminal') {
  return $.ui.mount({
    plugin: 'cc-mods-config', surface, component: 'Pane', requestId: PANE,
    props: { title: 'CC Mods Config', isFocused: true, bodyColumns: 120, placement: 'inline', scroll: { offset: 0, bodyRows: 80 }, view: {} },
  })
}
async function selectTab(ui: Awaited<ReturnType<typeof mountConfig>>, tab: 'statusline' | 'prompt-frame' | 'language-time' | 'subagents'): Promise<void> {
  await ui.press({ key: `config-tab-${tab}` })
}


for (const surface of ['terminal', 'desktop'] as const) {
  test(`renders unified i18n controls on ${surface}`, async ($, on) => {
    const world = mockConfig(on)
    await openConfig($)
    const ui = await mountConfig($, surface)
    await selectTab(ui, 'language-time')
    expect((await ui.find({ key: 'i18n-language-source' }))?.props.value).toBe('zh-CN')
    expect((await ui.find({ key: 'i18n-language-preset' }))?.type).toBe('Select')
    expect(await ui.find({ key: 'i18n-zh-CN' })).toBeUndefined()
    expect(await ui.find({ key: 'i18n-en' })).toBeUndefined()
    expect(await ui.find({ key: 'i18n-reload' })).toBeDefined()
    expect(world.changes).toEqual([])
    expect(world.writes).toEqual([])
    await ui.unmount()
  })
}

for (const surface of ['terminal', 'desktop'] as const) {
  for (const language of ['en', 'zh'] as const) {
    test(`separates mod configuration sections in ${language} on ${surface}`, async ($, on) => {
      const world = mockConfig(on)
      world.file = JSON.stringify({ ...DEFAULT_CONFIG, language })
      await openConfig($)
      const ui = await mountConfig($, surface)
      const tabs = [
        ['statusline', 'statusline-config-section', language === 'zh' ? 'statusline-mod · 状态栏' : 'statusline-mod · Statusline'],
        ['prompt-frame', 'prompt-frame-config-section', language === 'zh' ? 'user-prompt-frame · 用户输入框' : 'user-prompt-frame · User prompt frame'],
        ['language-time', 'language-time-config-section', language === 'zh' ? 'i18n-mod · 原生界面语言' : 'i18n-mod · Native UI language'],
        ['subagents', 'subagent-config-section', language === 'zh' ? 'subagent-split-view · Subagent 面板' : 'subagent-split-view · Subagent pane'],
      ] as const
      for (const [tab, key, heading] of tabs) {
        await selectTab(ui, tab)
        const section = await ui.find({ key })
        expect(section?.type).toBe('Box')
        expect(section?.props.flexDirection).toBe('column')
        expect(section?.props.marginTop).toBe(1)
        expect(section?.props.flexShrink).toBe(0)
        expect(await ui.find({ type: 'Text', text: heading })).toBeDefined()
      }
      await selectTab(ui, 'statusline')
      expect((await ui.find({ key: 'config-tabs' }))?.props.flexDirection).toBe('row')
      expect((await ui.find({ key: 'config-actions' }))?.props.marginTop).toBe(1)
      expect((await ui.find({ key: 'panel-language' }))?.type).toBe('Select')
      const position = await ui.find({ key: 'statusline-position' })
      expect(position?.type).toBe('Select')
      expect(position?.props.value).toBe('session-mode')
      expect(position?.props.label).toBe(language === 'zh' ? '状态栏位置' : 'Statusline position')
      const displayMode = await ui.find({ key: 'statusline-display-mode' })
      expect(displayMode?.type).toBe('Select')
      expect(displayMode?.props.value).toBe('compact')
      expect(await ui.find({ key: 'module-model-toggle' })).toBeDefined()
      await selectTab(ui, 'prompt-frame')
      expect(await ui.find({ key: 'prompt-frame-title' })).toBeDefined()
      await selectTab(ui, 'language-time')
      expect(await ui.find({ key: 'timestamp-enabled-toggle' })).toBeDefined()
      expect((await ui.find({ key: 'timestamp-format' }))?.props.value).toBe('HH:mm:ss')
      expect(await ui.find({ key: 'i18n-language-source' })).toBeDefined()
      expect(world.changes).toEqual([])
      expect(world.writes).toEqual([])
      await ui.unmount()
    })
  }
}

test('normalizes timestamp settings and defaults legacy files', () => {
  expect(DEFAULT_CONFIG.timestamp).toEqual({ enabled: true, format: 'HH:mm:ss' })
  expect(normalizeConfig({ timestamp: { enabled: false, format: 'YYYY-MM-DD HH:mm' } }).timestamp).toEqual({
    enabled: false,
    format: 'YYYY-MM-DD HH:mm',
  })
  expect(normalizeConfig({ timestamp: { enabled: 'false', format: '' } }).timestamp).toEqual(DEFAULT_CONFIG.timestamp)
  expect(normalizeConfig({}).timestamp).toEqual(DEFAULT_CONFIG.timestamp)
})


test('normalizes statusline positions independently and defaults legacy files to the existing slot', () => {
  for (const position of ['session-mode', 'below-prompt'] as const) {
    expect(normalizeConfig({ position }).position).toBe(position)
  }
  for (const value of [undefined, null, {}, { position: 'unknown' }, { position: 1 }, { position: null }]) {
    expect(normalizeConfig(value).position).toBe('session-mode')
  }
})

for (const surface of ['terminal', 'desktop'] as const) {
  test(`stages, saves and reopens statusline position without a feature mod on ${surface}`, async ($, on) => {
    const world = mockConfig(on)
    world.loaded = false
    await openConfig($)
    const ui = await mountConfig($, surface)
    await selectTab(ui, 'prompt-frame')
    await ui.input({ key: 'prompt-frame-title', text: '保留输入框配置', kind: 'change' })
    await selectTab(ui, 'statusline')
    await ui.select({ key: 'statusline-position', value: 'below-prompt' })
    await ui.select({ key: 'panel-language', value: 'zh' })
    expect((await ui.find({ key: 'statusline-position' }))?.props.value).toBe('below-prompt')
    expect(world.writes).toEqual([])
    await ui.press({ key: 'save-config' })
    const saved = JSON.parse(world.writes[0]!)
    expect(saved.position).toBe('below-prompt')
    expect(saved.language).toBe('zh')
    expect(saved.promptFrame.title).toBe('保留输入框配置')
    await ui.unmount()
    await openConfig($)
    const reopened = await mountConfig($, surface)
    expect((await reopened.find({ key: 'statusline-position' }))?.props.value).toBe('below-prompt')
    await reopened.select({ key: 'statusline-position', value: 'session-mode' })
    await reopened.press({ key: 'save-config' })
    expect(JSON.parse(world.writes[1]!).position).toBe('session-mode')
    expect(world.changes).toEqual([])
    await reopened.unmount()
  })
}

test('normalizes display modes independently and defaults legacy or invalid values to compact', () => {
  expect(DEFAULT_CONFIG.displayMode).toBe('compact')
  for (const displayMode of ['full', 'compact'] as const) {
    expect(normalizeConfig({ displayMode }).displayMode).toBe(displayMode)
  }
  for (const value of [
    undefined, null, {}, { language: 'zh' }, { displayMode: 'unknown' },
    { displayMode: 'FULL' }, { displayMode: '' }, { displayMode: 1 },
    { displayMode: null }, { displayMode: false }, { displayMode: [] }, { displayMode: {} },
  ]) {
    expect(normalizeConfig(value).displayMode).toBe('compact')
  }
})

for (const surface of ['terminal', 'desktop'] as const) {
  test(`stages, saves and reopens display mode without a feature mod on ${surface}`, async ($, on) => {
    const world = mockConfig(on)
    world.loaded = false
    world.file = JSON.stringify({ language: 'en', modules: { context: false }, promptFrame: { title: '既有输入框' } })
    await openConfig($)
    const ui = await mountConfig($, surface)
    expect((await ui.find({ key: 'statusline-display-mode' }))?.props.value).toBe('compact')
    await ui.select({ key: 'statusline-display-mode', value: 'full' })
    await ui.select({ key: 'statusline-position', value: 'below-prompt' })
    await ui.select({ key: 'panel-language', value: 'zh' })
    expect((await ui.find({ key: 'statusline-display-mode' }))?.props.value).toBe('full')
    expect(world.writes).toEqual([])
    expect(JSON.parse(world.file).displayMode).toBeUndefined()
    await ui.press({ key: 'save-config' })
    const saved = JSON.parse(world.writes[0]!)
    expect(saved.displayMode).toBe('full')
    expect(saved.position).toBe('below-prompt')
    expect(saved.language).toBe('zh')
    expect(saved.modules.context).toBe(false)
    expect(saved.promptFrame.title).toBe('既有输入框')
    expect(saved.order).toEqual(DEFAULT_CONFIG.order)
    await ui.unmount()
    await openConfig($)
    const reopened = await mountConfig($, surface)
    expect((await reopened.find({ key: 'statusline-display-mode' }))?.props.value).toBe('full')
    await reopened.select({ key: 'statusline-display-mode', value: 'compact' })
    await reopened.press({ key: 'save-config' })
    const restored = JSON.parse(world.writes[1]!)
    expect(restored.displayMode).toBe('compact')
    expect(restored.position).toBe('below-prompt')
    expect(restored.modules.context).toBe(false)
    expect(restored.promptFrame.title).toBe('既有输入框')
    expect(world.changes).toEqual([])
    await reopened.unmount()
    await openConfig($)
    const compactMode = await mountConfig($, surface)
    expect((await compactMode.find({ key: 'statusline-display-mode' }))?.props.value).toBe('compact')
    await compactMode.unmount()
  })
}

test('opens the visual pane using /my-cc-mods-config', async ($, on) => {
  const world = mockConfig(on)
  await openConfig($)
  expect(world.opened).toEqual(['CC Mods Config'])
})

test('does not handle the removed /cc-mods-config command', async ($, on) => {
  const world = mockConfig(on)
  on('command.run', { command: 'cc-mods-config' }, () => ({ text: 'Command not found.' }))
  const result = await $.command.run({ ...COMMAND_CONTEXT, command: 'cc-mods-config', args: '' })
  expect(result).toEqual({ text: 'Command not found.' })
  expect(world.opened).toEqual([])
})

test('hides editable i18n controls when the mod is absent', async ($, on) => {
  const world = mockConfig(on)
  world.loaded = false
  await openConfig($)
  const ui = await mountConfig($)
  await selectTab(ui, 'language-time')
  expect(await ui.find({ key: 'i18n-language-source' })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /i18n-mod is not loaded/ })).toBeDefined()
  expect(await ui.find({ key: 'save-config' })).toBeDefined()
  await ui.unmount()
})

test('shows policy-locked i18n as read-only', async ($, on) => {
  const world = mockConfig(on)
  world.locked = true
  await openConfig($)
  const ui = await mountConfig($)
  await selectTab(ui, 'language-time')
  expect(await ui.find({ key: 'i18n-language-source' })).toBeUndefined()
  expect(await ui.find({ key: 'i18n-language-preset' })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /Locked by host policy: zh-CN/ })).toBeDefined()
  expect(await ui.find({ key: 'i18n-reload' })).toBeDefined()
  await ui.unmount()
})

for (const kind of ['change', 'submit'] as const) {
  test(`saves an i18n JSON path with the shared button after input ${kind}`, async ($, on) => {
    const world = mockConfig(on)
    await openConfig($)
    const ui = await mountConfig($)
    await selectTab(ui, 'language-time')
    const source = 'D:/Language packs/custom.json'
    await ui.input({ key: 'i18n-language-source', text: source, kind })
    expect(world.changes).toEqual([])
    expect(world.writes).toEqual([])
    await ui.press({ key: 'save-config' })
    expect(world.changes).toEqual([{ key: 'i18n-mod.language', value: source }])
    expect(world.writes.length).toBe(1)
    expect(JSON.parse(world.writes[0]!).language).toBe('en')
    expect(JSON.parse(world.writes[0]!).i18n).toBeUndefined()
    expect(world.toasts).toContain('Configuration saved.')
    await ui.unmount()
  })
}

for (const value of ['zh-CN', 'en'] as const) {
  test(`stages preset ${value} without persisting until shared save`, async ($, on) => {
    const world = mockConfig(on)
    await openConfig($)
    const ui = await mountConfig($)
    await selectTab(ui, 'language-time')
    await ui.select({ key: 'i18n-language-preset', value })
    expect((await ui.find({ key: 'i18n-language-source' }))?.props.value).toBe(value)
    expect(world.changes).toEqual([])
    await ui.press({ key: 'save-config' })
    expect(world.changes).toEqual([{ key: 'i18n-mod.language', value }])
    await ui.unmount()
  })
}

test('keeps the source draft and avoids other writes when i18n validation fails', async ($, on) => {
  const world = mockConfig(on)
  world.deny = 'Invalid JSON language pack'
  await openConfig($)
  const ui = await mountConfig($)
  await selectTab(ui, 'language-time')
  await ui.input({ key: 'i18n-language-source', text: './bad.json', kind: 'change' })
  await ui.press({ key: 'save-config' })
  expect(world.writes).toEqual([])
  expect(world.changes).toEqual([])
  expect((await ui.find({ key: 'i18n-language-source' }))?.props.value).toBe('./bad.json')
  expect(await ui.find({ type: 'Text', text: /Invalid JSON language pack/ })).toBeDefined()
  await ui.unmount()
})

test('rechecks policy locks before saving an already edited draft', async ($, on) => {
  const world = mockConfig(on)
  await openConfig($)
  const ui = await mountConfig($)
  await selectTab(ui, 'language-time')
  await ui.input({ key: 'i18n-language-source', text: 'en', kind: 'change' })
  world.locked = true
  await ui.press({ key: 'save-config' })
  expect(world.writes).toEqual([])
  expect(world.changes).toEqual([])
  expect(world.toasts.some(text => text.includes('locked by host policy'))).toBe(true)
  await ui.unmount()
})

test('reloads the saved pack through the i18n command without changing settings', async ($, on) => {
  const world = mockConfig(on)
  await openConfig($)
  const ui = await mountConfig($)
  await selectTab(ui, 'language-time')
  await ui.press({ key: 'i18n-reload' })
  expect(world.commands).toEqual(['reload'])
  expect(world.changes).toEqual([])
  expect(world.writes).toEqual([])
  expect(world.toasts).toContain('Language pack reloaded.')
  await ui.unmount()
})

test('does not reload a different saved file while a source draft is pending', async ($, on) => {
  const world = mockConfig(on)
  await openConfig($)
  const ui = await mountConfig($)
  await selectTab(ui, 'language-time')
  await ui.input({ key: 'i18n-language-source', text: './new.json', kind: 'change' })
  await ui.press({ key: 'i18n-reload' })
  expect(world.commands).toEqual([])
  expect(world.toasts).toContain('Save or discard the i18n draft before reloading.')
  await ui.unmount()
})

test('discards unsaved source changes when the visual panel closes', async ($, on) => {
  const world = mockConfig(on)
  await openConfig($)
  const ui = await mountConfig($)
  await selectTab(ui, 'language-time')
  await ui.input({ key: 'i18n-language-source', text: './new.json', kind: 'change' })
  await ui.press({ key: 'close-config' })
  await ui.unmount()
  await openConfig($)
  const reopened = await mountConfig($)
  await selectTab(reopened, 'language-time')
  expect((await reopened.find({ key: 'i18n-language-source' }))?.props.value).toBe('zh-CN')
  expect(world.changes).toEqual([])
  expect(world.writes).toEqual([])
  await reopened.unmount()
})

test('reports partial persistence accurately when the file write fails after i18n saves', async ($, on) => {
  const world = mockConfig(on)
  world.failFile = true
  await openConfig($)
  const ui = await mountConfig($)
  await selectTab(ui, 'language-time')
  await ui.select({ key: 'i18n-language-preset', value: 'en' })
  await ui.press({ key: 'save-config' })
  expect(world.source).toBe('en')
  expect(world.writes).toEqual([])
  expect(world.toasts).toContain('i18n saved, but statusline/prompt-frame save failed; retry saving.')
  expect(world.toasts).not.toContain('Configuration saved.')
  world.failFile = false
  await ui.press({ key: 'save-config' })
  expect(world.changes.length).toBe(1)
  expect(world.writes.length).toBe(1)
  await ui.unmount()
})

test('discards just the language draft and allows reloading without closing the panel', async ($, on) => {
  const world = mockConfig(on)
  await openConfig($)
  const ui = await mountConfig($)
  await selectTab(ui, 'language-time')
  await ui.input({ key: 'i18n-language-source', text: './new.json', kind: 'change' })
  await ui.press({ key: 'i18n-cancel' })
  expect((await ui.find({ key: 'i18n-language-source' }))?.props.value).toBe('zh-CN')
  await ui.press({ key: 'i18n-reload' })
  expect(world.commands).toEqual(['reload'])
  expect(world.changes).toEqual([])
  expect(world.writes).toEqual([])
  await ui.unmount()
})

for (const surface of ['terminal', 'desktop'] as const) {
  test(`keeps language selection in one keyed control across repeated choices on ${surface}`, async ($, on) => {
    const world = mockConfig(on)
    await openConfig($)
    const ui = await mountConfig($, surface)
    for (const value of ['en', 'zh-CN', 'en'] as const) {
      await selectTab(ui, 'language-time')
      await ui.select({ key: 'i18n-language-preset', value })
      const selector = await ui.find({ key: 'i18n-language-preset' })
      expect(selector?.type).toBe('Select')
      expect(selector?.props.value).toBe(value)
      expect((await ui.findAll({ type: 'Select', key: 'i18n-language-preset' })).length).toBe(1)
      expect((await ui.find({ key: 'i18n-language-source' }))?.props.value).toBe(value)
      expect(world.changes).toEqual([])
      expect(world.writes).toEqual([])
    }
    await ui.press({ key: 'save-config' })
    expect(world.changes).toEqual([{ key: 'i18n-mod.language', value: 'en' }])
    await ui.unmount()
  })
}

test('represents an existing custom JSON source without replacing it with a preset', async ($, on) => {
  const world = mockConfig(on)
  const source = 'D:/语言包/English and 中文.json'
  world.source = source
  await openConfig($)
  const ui = await mountConfig($)
  await selectTab(ui, 'language-time')
  const selector = await ui.find({ key: 'i18n-language-preset' })
  expect(selector?.props.value).toBe(source)
  const options = selector?.props.options as { value: string; label: string }[]
  expect(options.map(option => option.value)).toEqual(['zh-CN', 'en', source])
  expect(new Set(options.map(option => option.value)).size).toBe(options.length)
  expect(world.changes).toEqual([])
  await selectTab(ui, 'language-time')
  await ui.select({ key: 'i18n-language-preset', value: 'en' })
  await ui.press({ key: 'i18n-cancel' })
  expect((await ui.find({ key: 'i18n-language-preset' }))?.props.value).toBe(source)
  expect((await ui.find({ key: 'i18n-language-source' }))?.props.value).toBe(source)
  await ui.unmount()
})

test('renders the interactive config pane', async ($, on) => {
  on('config.list', () => ({ value: [] }))
  const ui = await $.ui.mount({
    plugin: 'cc-mods-config',
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

  expect(await ui.find({ type: 'Text', text: /CC Mods Configuration/ })).toBeDefined()
  expect(await ui.find({ type: 'Select', key: 'panel-language' })).toBeDefined()
  expect(await ui.find({ type: 'Button', text: /Save configuration/ })).toBeDefined()
  await ui.unmount()
})


for (const surface of ['terminal', 'desktop'] as const) {
  test(`opens and saves prompt-frame settings without any feature mod on ${surface}`, async ($, on) => {
    const world = mockConfig(on)
    world.loaded = false
    await openConfig($)
    const ui = await mountConfig($, surface)
    await selectTab(ui, 'prompt-frame')
    await ui.input({ key: 'prompt-frame-title', text: '独立配置', kind: 'change' })
    await selectTab(ui, 'statusline')
    await ui.select({ key: 'panel-language', value: 'zh' })
    await ui.press({ key: 'module-context-toggle' })
    await ui.press({ key: 'module-cwd-up' })
    expect(world.writes).toEqual([])
    await ui.press({ key: 'save-config' })
    const saved = JSON.parse(world.writes[0]!)
    expect(saved.promptFrame.title).toBe('独立配置')
    expect(saved.language).toBe('zh')
    expect(saved.modules.context).toBe(false)
    expect(saved.order.slice(-2)).toEqual(['cwd', 'cost'])
    expect(world.paths.map(path => path.replace(/\\/gu, '/').replace(/^D:/u, ''))).toEqual(['/test-home/.config/my-cc-mods/config.json'])
    expect(world.changes).toEqual([])
    await ui.unmount()
  })
}

for (const surface of ['terminal', 'desktop'] as const) {
  test(`reads existing legacy configuration and discards every unsaved field on close on ${surface}`, async ($, on) => {
    const world = mockConfig(on)
    world.file = JSON.stringify({ language: 'zh', promptFrame: { title: '已有标题' } })
    await openConfig($)
    const ui = await mountConfig($, surface)
    await selectTab(ui, 'prompt-frame')
    expect((await ui.find({ key: 'prompt-frame-title' }))?.props.value).toBe('已有标题')
    await selectTab(ui, 'statusline')
    expect((await ui.find({ key: 'statusline-display-mode' }))?.props.value).toBe('compact')
    await selectTab(ui, 'prompt-frame')
    await ui.input({ key: 'prompt-frame-title', text: '未保存标题', kind: 'change' })
    await selectTab(ui, 'statusline')
    await ui.select({ key: 'statusline-position', value: 'below-prompt' })
    await ui.select({ key: 'statusline-display-mode', value: 'full' })
    await ui.select({ key: 'panel-language', value: 'zh' })
    await ui.press({ key: 'module-context-toggle' })
    await ui.press({ key: 'close-config' })
    await ui.unmount()
    await openConfig($)
    const reopened = await mountConfig($, surface)
    expect((await reopened.find({ key: 'statusline-position' }))?.props.value).toBe('session-mode')
    expect((await reopened.find({ key: 'statusline-display-mode' }))?.props.value).toBe('compact')
    await selectTab(reopened, 'prompt-frame')
    expect((await reopened.find({ key: 'prompt-frame-title' }))?.props.value).toBe('已有标题')
    await selectTab(reopened, 'statusline')
    expect((await reopened.find({ key: 'panel-language' }))?.props.value).toBe('zh')
    expect((await reopened.find({ key: 'module-context-toggle' }))?.text).toBe('启用')
    expect(world.writes).toEqual([])
    await reopened.unmount()
  })

  test(`preserves all configuration drafts on a failed file save for retry on ${surface}`, async ($, on) => {
    const world = mockConfig(on)
    world.loaded = false
    world.failFile = true
    await openConfig($)
    const ui = await mountConfig($, surface)
    await selectTab(ui, 'prompt-frame')
    await ui.input({ key: 'prompt-frame-color', text: 'green', kind: 'change' })
    await selectTab(ui, 'statusline')
    await ui.select({ key: 'statusline-position', value: 'below-prompt' })
    await ui.select({ key: 'statusline-display-mode', value: 'full' })
    await ui.press({ key: 'module-model-toggle' })
    await ui.press({ key: 'save-config' })
    expect(world.writes).toEqual([])
    expect(JSON.parse(world.file).displayMode).toBe('compact')
    await selectTab(ui, 'prompt-frame')
    expect((await ui.find({ key: 'prompt-frame-color' }))?.props.value).toBe('green')
    await selectTab(ui, 'statusline')
    expect((await ui.find({ key: 'statusline-position' }))?.props.value).toBe('below-prompt')
    expect((await ui.find({ key: 'statusline-display-mode' }))?.props.value).toBe('full')
    expect(world.toasts).toContain('Configuration save failed; draft preserved.')
    world.failFile = false
    await ui.press({ key: 'save-config' })
    const saved = JSON.parse(world.writes[0]!)
    expect(saved.position).toBe('below-prompt')
    expect(saved.displayMode).toBe('full')
    expect(saved.promptFrame.color).toBe('green')
    expect(saved.modules.model).toBe(false)
    await ui.unmount()
  })
}

test('registers only my-cc-mods-config without any feature mod at session start', async ($, on) => {
  const names: string[] = []
  on('command.register', ($, e) => {
    names.push(e.name)
    return { value: { command: e.name } }
  })
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: 'D:/project', surface: 'terminal', isInteractive: true })
  expect(names).toEqual(['my-cc-mods-config'])
})

test('normalizes the legacy format independently of the statusline implementation', () => {
  const current = normalizeConfig({
    language: 'zh', order: ['cwd', 'model'], modules: { context: false }, promptFrame: { title: '兼容配置' },
  })
  expect(current.language).toBe('zh')
  expect(current.displayMode).toBe('compact')
  expect(current.order.slice(0, 3)).toEqual(['cwd', 'model', 'state'])
  expect(current.order).toHaveLength(DEFAULT_CONFIG.order.length)
  expect(current.modules.context).toBe(false)
  expect(current.modules.git).toBe(true)
  expect(current.promptFrame.title).toBe('兼容配置')
  expect(current.promptFrame.vertical).toBe('│')
})

const DURATION_FIELDS = [
  ['turnDurationMode', 'turn-duration-mode', 'custom'],
  ['turnDurationVisible', 'turn-duration-visible', false],
  ['turnDurationSpacing', 'turn-duration-spacing', 'separated'],
] as const

async function stageDuration(ui: Awaited<ReturnType<typeof mountConfig>>): Promise<void> {
  await selectTab(ui, 'language-time')
  for (const [, key, value] of DURATION_FIELDS) await ui.select({ key, value: String(value) })
}

for (const surface of ['terminal', 'desktop'] as const) {
  for (const language of ['en', 'zh'] as const) {
    test(`stages duration controls from actual rows and saves through the host in ${language} on ${surface}`, async ($, on) => {
      const world = mockConfig(on)
      world.file = JSON.stringify({ ...DEFAULT_CONFIG, language })
      world.source = 'en'
      await openConfig($)
      const ui = await mountConfig($, surface)
      await selectTab(ui, 'language-time')
      for (const [field, key] of DURATION_FIELDS) {
        expect((await ui.find({ key }))?.props.value).toBe(String(world.duration[field]))
      }
      const modeOptions = (await ui.find({ key: 'turn-duration-mode' }))?.props.options as { value: string }[]
      expect(modeOptions.map(option => option.value)).toEqual(['native', 'custom'])
      const visibleOptions = (await ui.find({ key: 'turn-duration-visible' }))?.props.options as { value: string }[]
      expect(visibleOptions.map(option => option.value)).toEqual(['true', 'false'])
      const spacingOptions = (await ui.find({ key: 'turn-duration-spacing' }))?.props.options as { value: string }[]
      expect(spacingOptions.map(option => option.value)).toEqual(['compact', 'separated'])
      expect(await ui.find({ type: 'Text', text: language === 'zh' ? /独立.*显/ : /independent visibility/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: language === 'zh' ? /结束时刻.*后台等待.*预算/ : /end time.*background waiting.*budget/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: language === 'zh' ? /English.*始终.*原生/ : /English.*always.*native/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: language === 'zh' ? /完整原生.*native/ : /full native.*native/ })).toBeDefined()
      await stageDuration(ui)
      expect(world.duration).toEqual({ turnDurationMode: 'native', turnDurationVisible: true, turnDurationSpacing: 'compact' })
      expect(world.changes).toEqual([])
      expect(world.writes).toEqual([])
      await ui.press({ key: 'save-config' })
      expect(world.changes).toEqual(DURATION_FIELDS.map(([field, , value]) => ({ key: `i18n-mod.${field}`, value })))
      const local = JSON.parse(world.writes[0]!)
      expect(local.language).toBe(language)
      expect(local.turnDurationMode).toBeUndefined()
      expect(local.turnDurationVisible).toBeUndefined()
      expect(local.turnDurationSpacing).toBeUndefined()
      expect(local.i18n).toBeUndefined()
      expect(world.paths).toEqual(['/test-home/.config/my-cc-mods/config.json'])
      expect(world.source).toBe('en')
      await ui.select({ key: 'turn-duration-mode', value: 'native' })
      await ui.press({ key: 'save-config' })
      expect(world.changes[3]).toEqual({ key: 'i18n-mod.turnDurationMode', value: 'native' })
      await ui.unmount()
      await openConfig($)
      const reopened = await mountConfig($, surface)
      await selectTab(reopened, 'language-time')
      expect((await reopened.find({ key: 'turn-duration-mode' }))?.props.value).toBe('native')
      expect((await reopened.find({ key: 'turn-duration-visible' }))?.props.value).toBe('false')
      expect((await reopened.find({ key: 'turn-duration-spacing' }))?.props.value).toBe('separated')
      await reopened.select({ key: 'turn-duration-visible', value: 'true' })
      await reopened.select({ key: 'turn-duration-spacing', value: 'compact' })
      await reopened.press({ key: 'save-config' })
      expect(world.changes.slice(4)).toEqual([
        { key: 'i18n-mod.turnDurationVisible', value: true },
        { key: 'i18n-mod.turnDurationSpacing', value: 'compact' },
      ])
      await reopened.unmount()
    })
  }
}

for (const [field, key, value] of DURATION_FIELDS) {
  test(`uses the final host value rather than the submitted ${field} draft`, async ($, on) => {
    const world = mockConfig(on)
    const original = world.duration[field]!
    world.finalValues[`i18n-mod.${field}`] = original
    await openConfig($)
    const ui = await mountConfig($)
    await selectTab(ui, 'language-time')
    await ui.select({ key, value: String(value) })
    await ui.press({ key: 'save-config' })
    expect((await ui.find({ key }))?.props.value).toBe(String(original))
    expect(world.changes).toEqual([{ key: `i18n-mod.${field}`, value: original }])
    await ui.press({ key: 'save-config' })
    expect(world.changes.length).toBe(1)
    await ui.unmount()
  })

  test(`shows missing ${field} as unavailable without inventing a default row`, async ($, on) => {
    const world = mockConfig(on)
    world.missing = [`i18n-mod.${field}`]
    await openConfig($)
    const ui = await mountConfig($)
    await selectTab(ui, 'language-time')
    expect(await ui.find({ key })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: new RegExp(`i18n-mod\\.${field}.*unavailable`) })).toBeDefined()
    expect(await ui.find({ key: 'i18n-language-source' })).toBeDefined()
    await ui.press({ key: 'save-config' })
    expect(world.changes).toEqual([])
    expect(world.writes.length).toBe(1)
    await ui.unmount()
  })

  test(`shows locked ${field} read-only while allowing the other controls`, async ($, on) => {
    const world = mockConfig(on)
    world.lockedKeys = [`i18n-mod.${field}`]
    await openConfig($)
    const ui = await mountConfig($)
    await selectTab(ui, 'language-time')
    expect(await ui.find({ key })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: new RegExp(`i18n-mod\\.${field}.*Locked by host policy`) })).toBeDefined()
    for (const [otherField, otherKey] of DURATION_FIELDS) {
      if (otherField !== field) expect(await ui.find({ key: otherKey })).toBeDefined()
    }
    await ui.press({ key: 'save-config' })
    expect(world.changes).toEqual([])
    await ui.unmount()
  })
}

for (const failure of ['unloaded', 'missing', 'locked', 'denied', 'throw', 'list'] as const) {
  test(`preserves duration and local drafts when save becomes ${failure}`, async ($, on) => {
    const world = mockConfig(on)
    await openConfig($)
    const ui = await mountConfig($)
    await selectTab(ui, 'prompt-frame')
    await ui.input({ key: 'prompt-frame-title', text: 'retained frame', kind: 'change' })
    await stageDuration(ui)
    const modeKey = 'i18n-mod.turnDurationMode'
    if (failure === 'unloaded') world.loaded = false
    if (failure === 'missing') world.missing = [modeKey]
    if (failure === 'locked') world.lockedKeys = [modeKey]
    if (failure === 'denied') world.denyKey = modeKey
    if (failure === 'throw') world.throwKey = modeKey
    if (failure === 'list') world.failList = true
    await ui.press({ key: 'save-config' })
    expect(world.changes).toEqual([])
    expect(world.writes).toEqual([])
    expect(world.toasts.some(text => text.includes(modeKey))).toBe(true)
    expect(world.toasts).not.toContain('Configuration saved.')
    world.loaded = true
    world.missing = []
    world.lockedKeys = []
    world.denyKey = ''
    world.throwKey = ''
    world.failList = false
    await selectTab(ui, 'language-time')
    for (const [, key, value] of DURATION_FIELDS) expect((await ui.find({ key }))?.props.value).toBe(String(value))
    await ui.press({ key: 'save-config' })
    expect(world.changes).toEqual(DURATION_FIELDS.map(([field, , value]) => ({ key: `i18n-mod.${field}`, value })))
    expect(JSON.parse(world.writes[0]!).promptFrame.title).toBe('retained frame')
    await ui.unmount()
  })
}

for (const failure of ['denied', 'throw', 'locked', 'missing'] as const) {
  test(`reports non-atomic partial save and retries only failed and remaining drafts after ${failure}`, async ($, on) => {
    const world = mockConfig(on)
    await openConfig($)
    const ui = await mountConfig($)
    await stageDuration(ui)
    await ui.select({ key: 'i18n-language-preset', value: 'en' })
    const failed = 'i18n-mod.turnDurationVisible'
    if (failure === 'denied') world.denyKey = failed
    if (failure === 'throw') world.throwKey = failed
    if (failure === 'locked') world.lockedKeys = [failed]
    if (failure === 'missing') world.missing = [failed]
    await ui.press({ key: 'save-config' })
    expect(world.changes).toEqual([
      { key: 'i18n-mod.language', value: 'en' },
      { key: 'i18n-mod.turnDurationMode', value: 'custom' },
    ])
    expect(world.writes).toEqual([])
    expect(world.toasts.some(text => /Partial save/.test(text) && text.includes('i18n-mod.language') && text.includes('i18n-mod.turnDurationMode') && text.includes(failed) && text.includes('draft'))).toBe(true)
    expect(world.toasts).not.toContain('Configuration saved.')
    expect((await ui.findAll({ type: 'Text' })).filter(node => node.text.includes('Partial save'))).toHaveLength(1)
    world.denyKey = ''
    world.throwKey = ''
    world.lockedKeys = []
    world.missing = []
    await selectTab(ui, 'language-time')
    expect((await ui.find({ key: 'turn-duration-visible' }))?.props.value).toBe('false')
    expect((await ui.find({ key: 'turn-duration-spacing' }))?.props.value).toBe('separated')
    await ui.press({ key: 'save-config' })
    expect(world.changes).toEqual([
      { key: 'i18n-mod.language', value: 'en' },
      ...DURATION_FIELDS.map(([field, , value]) => ({ key: `i18n-mod.${field}`, value })),
    ])
    expect(world.writes.length).toBe(1)
    expect(await ui.find({ type: 'Text', text: /Partial save/ })).toBeUndefined()
    await ui.unmount()
  })
}

for (const surface of ['terminal', 'desktop'] as const) {
  test(`discards only duration drafts independently of language and local drafts on ${surface}`, async ($, on) => {
    const world = mockConfig(on)
    await openConfig($)
    const ui = await mountConfig($, surface)
    await stageDuration(ui)
    await ui.select({ key: 'i18n-language-preset', value: 'en' })
    await ui.press({ key: 'turn-duration-cancel' })
    expect((await ui.find({ key: 'turn-duration-mode' }))?.props.value).toBe('native')
    expect((await ui.find({ key: 'i18n-language-source' }))?.props.value).toBe('en')
    await ui.press({ key: 'save-config' })
    expect(world.changes).toEqual([{ key: 'i18n-mod.language', value: 'en' }])
    await stageDuration(ui)
    await ui.press({ key: 'close-config' })
    await ui.unmount()
    await openConfig($)
    const reopened = await mountConfig($, surface)
    await selectTab(reopened, 'language-time')
    expect((await reopened.find({ key: 'turn-duration-mode' }))?.props.value).toBe('native')
    expect((await reopened.find({ key: 'turn-duration-visible' }))?.props.value).toBe('true')
    expect((await reopened.find({ key: 'turn-duration-spacing' }))?.props.value).toBe('compact')
    expect(world.changes.length).toBe(1)
    await reopened.unmount()
  })
}

test('retains local draft after all duration fields save but file write fails', async ($, on) => {
  const world = mockConfig(on)
  world.failFile = true
  await openConfig($)
  const ui = await mountConfig($)
  await selectTab(ui, 'statusline')
  await ui.select({ key: 'statusline-position', value: 'below-prompt' })
  await stageDuration(ui)
  await ui.press({ key: 'save-config' })
  expect(world.changes.length).toBe(3)
  expect(world.writes).toEqual([])
  expect(world.toasts.some(text => /Partial save/.test(text) && text.includes('i18n-mod.turnDurationSpacing') && /statusline\/prompt-frame.*draft/.test(text))).toBe(true)
  expect(world.toasts).not.toContain('Configuration saved.')
  world.failFile = false
  await ui.press({ key: 'save-config' })
  expect(world.changes.length).toBe(3)
  expect(JSON.parse(world.writes[0]!).position).toBe('below-prompt')
  await ui.unmount()
})

test('language rejection keeps all duration drafts and existing reload semantics', async ($, on) => {
  const world = mockConfig(on)
  world.denyKey = 'i18n-mod.language'
  await openConfig($)
  const ui = await mountConfig($)
  await stageDuration(ui)
  await ui.select({ key: 'i18n-language-preset', value: 'en' })
  await ui.press({ key: 'save-config' })
  expect(world.attempts).toEqual(['i18n-mod.language'])
  expect(world.changes).toEqual([])
  expect(world.writes).toEqual([])
  await ui.press({ key: 'i18n-reload' })
  expect(world.commands).toEqual([])
  await ui.press({ key: 'i18n-cancel' })
  await ui.press({ key: 'i18n-reload' })
  expect(world.commands).toEqual(['reload'])
  expect((await ui.find({ key: 'turn-duration-mode' }))?.props.value).toBe('custom')
  world.denyKey = ''
  await ui.press({ key: 'save-config' })
  expect(world.changes.length).toBe(3)
  expect(world.source).toBe('zh-CN')
  await ui.unmount()
})

for (const [field, key, value] of DURATION_FIELDS) {
  test(`refreshes external ${field} saves without overwriting a pending draft`, async ($, on) => {
    const world = mockConfig(on)
    await openConfig($)
    const ui = await mountConfig($)
    await selectTab(ui, 'language-time')
    const previous = world.duration[field]!
    const saveExternal = (next: string | boolean) => $.config.set({
      key: `i18n-mod.${field}`, value: next, previous,
      provider: { plugin: 'i18n-mod', tier: 'user' }, origin: { kind: 'composer' },
    })
    await saveExternal(value)
    expect((await ui.find({ key }))?.props.value).toBe(String(value))
    await ui.select({ key, value: String(previous) })
    await saveExternal(value)
    expect((await ui.find({ key }))?.props.value).toBe(String(previous))
    await ui.press({ key: 'turn-duration-cancel' })
    expect((await ui.find({ key }))?.props.value).toBe(String(value))
    expect(world.writes).toEqual([])
    await ui.unmount()
  })
}

// 直接注册 hook 使用明确拒绝的 Promise；测试引擎会隔离抛错的 fixture hook，不能以该隔离结果冒充 API rejection。
for (const operation of ['list', 'set'] as const) {
  test(`preserves failed and unattempted drafts on a real config.${operation} rejection after partial success`, async () => {
    type Hook = ($: EngineInterface, e?: unknown) => Promise<any>
    let open: Hook | undefined
    let render: Hook | undefined
    const capture = ((event: string, matcher: { command?: string }, hook: Hook) => {
      if (event === 'command.run' && matcher.command === 'my-cc-mods-config') open = hook
      if (event === 'ui.render') render = hook
      return { catch() {} }
    }) as unknown as On
    register(capture, {})
    const values: Record<string, unknown> = {}
    const changes: string[] = []
    const toasts: string[] = []
    let writes = 0
    let reject = true
    const rows = DURATION_FIELDS.map(([field], index): ConfigRow => ({
      key: `i18n-mod.${field}`, label: field, kind: index === 1 ? 'boolean' : 'choice',
      value: index === 0 ? 'native' : index === 1 ? true : 'compact',
      provider: { plugin: 'i18n-mod', tier: 'user' }, isLocked: false,
    }))
    type Node = { type: string; props: Record<string, any>; children?: Node[] }
    const element = (type: string) => (props: Record<string, any>): Node => ({ type, props, children: props.children })
    const host = {
      env: { get: async () => '/test-home' },
      state: {
        get: async (ref: { key: string }) => ({ value: values[ref.key], version: 1 }),
        set: async (ref: { key: string }, value: unknown) => {
          values[ref.key] = value
          return { isSet: true, version: 2 }
        },
      },
      fs: { read: async () => JSON.stringify(DEFAULT_CONFIG), write: async () => { writes++ } },
      config: {
        list: async () => {
          if (reject && operation === 'list' && changes.length > 0) throw new Error('list promise rejected')
          return rows
        },
        set: async ({ key, value }: { key: string; value: string | boolean }) => {
          if (reject && operation === 'set' && key.endsWith('turnDurationVisible')) throw new Error('set promise rejected')
          changes.push(key)
          rows.find(row => row.key === key)!.value = value
          return { value }
        },
      },
      ui: {
        open: async () => ({ isPlaced: true }), invalidate: () => {}, toast: (text: string) => { toasts.push(text) },
        resolve: () => Object.fromEntries(['Box', 'Button', 'Input', 'Select', 'Text'].map(type => [type, element(type)])),
      },
    } as unknown as EngineInterface
    expect(open).toBeDefined()
    expect(render).toBeDefined()
    await open!(host)
    const find = (node: Node, key: string): Node | undefined => node.props?.key === key
      ? node : node.children?.filter(child => child && typeof child === 'object').map(child => find(child, key)).find(Boolean)
    let tree = await render!(host, {}) as Node
    find(tree, 'config-tab-language-time')!.props.onPress()
    tree = await render!(host, {}) as Node
    for (const [, key, value] of DURATION_FIELDS) await find(tree, key)!.props.onSelect(String(value))
    await find(tree, 'save-config')!.props.onPress()
    expect(changes).toEqual(['i18n-mod.turnDurationMode'])
    expect(values.turnDurationDraft).toEqual({
      values: { turnDurationVisible: false, turnDurationSpacing: 'separated' },
      error: toasts[0],
    })
    expect(toasts[0]).toContain('Partial save')
    expect(toasts[0]).toContain(`i18n-mod.turnDurationVisible: ${operation} promise rejected`)
    expect(writes).toBe(0)
    reject = false
    await find(tree, 'save-config')!.props.onPress()
    expect(changes).toEqual(DURATION_FIELDS.map(([field]) => `i18n-mod.${field}`))
    expect(writes).toBe(1)
    expect(values.turnDurationDraft).toEqual({ values: {}, error: '' })
  })
}

test('renders without duration controls when listing fails or the plugin is unloaded', async ($, on) => {
  const world = mockConfig(on)
  world.failList = true
  await openConfig($)
  const ui = await mountConfig($)
  await selectTab(ui, 'language-time')
  for (const [, key] of DURATION_FIELDS) expect(await ui.find({ key })).toBeUndefined()
  expect(await ui.find({ key: 'timestamp-format' })).toBeDefined()
  world.failList = false
  world.loaded = false
  await selectTab(ui, 'language-time')
  for (const [, key] of DURATION_FIELDS) expect(await ui.find({ key })).toBeUndefined()
  await ui.press({ key: 'save-config' })
  expect(world.changes).toEqual([])
  expect(world.writes.length).toBe(1)
  await ui.unmount()
})
