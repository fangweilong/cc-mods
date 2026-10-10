import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { ConfigRow, On } from 'claude-code'
import { DEFAULT_CONFIG, normalizeConfig } from '../hooks/register'

const COMMAND_CONTEXT = {
  origin: { kind: 'composer' },
  presentation: { isFullscreen: false, columns: 120 },
} as const
const PANE = 'my-cc-mods-config'

function mockConfig(on: On) {
  const world = {
    loaded: true, locked: false, source: 'zh-CN',
    deny: '', failFile: false,
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
  on('config.list', () => ({ value: world.loaded ? [{
    key: 'i18n-mod.language', label: 'UI language / JSON language pack', kind: 'text',
    value: world.source, provider: { plugin: 'i18n-mod', tier: 'user' }, isLocked: world.locked,
  } satisfies ConfigRow] : [] }))
  on('config.set', ($, e) => {
    if (world.deny) return { deny: world.deny }
    world.changes.push({ key: e.key, value: e.value })
    world.source = String(e.value)
    return { value: e.value }
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

for (const surface of ['terminal', 'desktop'] as const) {
  test(`renders unified i18n controls on ${surface}`, async ($, on) => {
    const world = mockConfig(on)
    await openConfig($)
    const ui = await mountConfig($, surface)
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
      const sections = [
        ['statusline', language === 'zh' ? 'statusline-mod · 状态栏' : 'statusline-mod · Statusline'],
        ['prompt-frame', language === 'zh' ? 'user-prompt-frame · 用户输入框' : 'user-prompt-frame · User prompt frame'],
        ['i18n', language === 'zh' ? 'i18n-mod · 原生界面语言' : 'i18n-mod · Native UI language'],
        ['timestamp', language === 'zh' ? 'timestamp-mod · 时间显示' : 'timestamp-mod · Timestamps'],
        ['subagent', language === 'zh' ? 'subagent-split-view · Subagent 面板' : 'subagent-split-view · Subagent pane'],
      ] as const
      for (const [key, heading] of sections) {
        const section = await ui.find({ key: `${key}-config-section` })
        expect(section?.type).toBe('Box')
        expect(section?.props.flexDirection).toBe('column')
        expect(section?.props.marginTop).toBe(1)
        expect(section?.props.flexShrink).toBe(0)
        expect(await ui.find({ type: 'Text', text: heading })).toBeDefined()
      }
      expect((await ui.find({ key: 'config-actions' }))?.props.marginTop).toBe(1)
      expect(await ui.find({ key: 'panel-language' })).toBeDefined()
      const position = await ui.find({ key: 'statusline-position' })
      expect(position?.type).toBe('Select')
      expect(position?.props.value).toBe('session-mode')
      expect(position?.props.label).toBe(language === 'zh' ? '状态栏位置' : 'Statusline position')
      expect(position?.props.options).toEqual([
        { value: 'session-mode', label: language === 'zh' ? '模式提示区域（现有位置）' : 'Mode area (existing position)' },
        { value: 'below-prompt', label: language === 'zh' ? '输入框下方' : 'Below input box' },
      ])
      const displayMode = await ui.find({ key: 'statusline-display-mode' })
      expect(displayMode?.type).toBe('Select')
      expect(displayMode?.props.value).toBe('compact')
      expect(displayMode?.props.label).toBe(language === 'zh' ? '状态栏显示模式' : 'Statusline display mode')
      expect(displayMode?.props.options).toEqual([
        { value: 'full', label: language === 'zh' ? '完整模式' : 'Full' },
        { value: 'compact', label: language === 'zh' ? '简洁模式' : 'Compact' },
      ])
      expect(await ui.find({ key: 'module-model-toggle' })).toBeDefined()
      expect(await ui.find({ key: 'prompt-frame-title' })).toBeDefined()
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
    await ui.input({ key: 'prompt-frame-title', text: '保留输入框配置', kind: 'change' })
    await ui.select({ key: 'statusline-position', value: 'below-prompt' })
    await ui.press({ key: 'panel-language' })
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
    await ui.press({ key: 'panel-language' })
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
  await ui.input({ key: 'i18n-language-source', text: './new.json', kind: 'change' })
  await ui.press({ key: 'close-config' })
  await ui.unmount()
  await openConfig($)
  const reopened = await mountConfig($)
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
      await ui.select({ key: 'i18n-language-preset', value })
      const selector = await ui.find({ key: 'i18n-language-preset' })
      expect(selector?.type).toBe('Select')
      expect(selector?.props.value).toBe(value)
      expect((await ui.findAll({ type: 'Select' })).length).toBe(3)
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
  const selector = await ui.find({ key: 'i18n-language-preset' })
  expect(selector?.props.value).toBe(source)
  const options = selector?.props.options as { value: string; label: string }[]
  expect(options.map(option => option.value)).toEqual(['zh-CN', 'en', source])
  expect(new Set(options.map(option => option.value)).size).toBe(options.length)
  expect(world.changes).toEqual([])
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
  expect(await ui.find({ type: 'Button', text: /Language/ })).toBeDefined()
  expect(await ui.find({ type: 'Button', text: /Save configuration/ })).toBeDefined()
  await ui.unmount()
})


for (const surface of ['terminal', 'desktop'] as const) {
  test(`opens and saves prompt-frame settings without any feature mod on ${surface}`, async ($, on) => {
    const world = mockConfig(on)
    world.loaded = false
    await openConfig($)
    const ui = await mountConfig($, surface)
    await ui.input({ key: 'prompt-frame-title', text: '独立配置', kind: 'change' })
    await ui.press({ key: 'panel-language' })
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
    expect((await ui.find({ key: 'prompt-frame-title' }))?.props.value).toBe('已有标题')
    expect((await ui.find({ key: 'statusline-display-mode' }))?.props.value).toBe('compact')
    await ui.input({ key: 'prompt-frame-title', text: '未保存标题', kind: 'change' })
    await ui.select({ key: 'statusline-position', value: 'below-prompt' })
    await ui.select({ key: 'statusline-display-mode', value: 'full' })
    await ui.press({ key: 'panel-language' })
    await ui.press({ key: 'module-context-toggle' })
    await ui.press({ key: 'close-config' })
    await ui.unmount()
    await openConfig($)
    const reopened = await mountConfig($, surface)
    expect((await reopened.find({ key: 'statusline-position' }))?.props.value).toBe('session-mode')
    expect((await reopened.find({ key: 'statusline-display-mode' }))?.props.value).toBe('compact')
    expect((await reopened.find({ key: 'prompt-frame-title' }))?.props.value).toBe('已有标题')
    expect((await reopened.find({ key: 'panel-language' }))?.text).toBe('语言：中文')
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
    await ui.input({ key: 'prompt-frame-color', text: 'green', kind: 'change' })
    await ui.select({ key: 'statusline-position', value: 'below-prompt' })
    await ui.select({ key: 'statusline-display-mode', value: 'full' })
    await ui.press({ key: 'module-model-toggle' })
    await ui.press({ key: 'save-config' })
    expect(world.writes).toEqual([])
    expect(JSON.parse(world.file).displayMode).toBe('compact')
    expect((await ui.find({ key: 'prompt-frame-color' }))?.props.value).toBe('green')
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
