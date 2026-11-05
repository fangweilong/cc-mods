import type { EngineInterface, On } from 'claude-code'
import type { Engine } from 'claude-code/testing'
import { expect, mock, test } from 'claude-code/testing'

import { DEFAULT_IMAGE_CONFIG, normalizeImageConfig } from '../hooks/config'
import { detectImageSupport, resetImageSupport } from '../hooks/detect'
import { extractMarkdownImagePaths } from '../hooks/markdown'
import { pngBase64Size, pngSize } from '../hooks/png'
import {
  collectInlinePictures,
  fitLayout,
  layoutPictures,
  stripImagePlaceholders,
} from '../hooks/register'

const PNG_1X1 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

const PNG_HEADER = Uint8Array.of(
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0x00, 0x00, 0x00, 0x0d,
  0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x02,
  0x00, 0x00, 0x00, 0x03,
)

test('reads the PNG size from an IHDR header', () => {
  expect(pngSize(PNG_HEADER)).toEqual({ width: 2, height: 3 })
  expect(pngSize(PNG_HEADER.slice(0, 23))).toBeUndefined()
  expect(pngSize(Uint8Array.of(0, 1, 2, 3))).toBeUndefined()
  expect(pngBase64Size(PNG_1X1)).toEqual({ width: 1, height: 1 })
  expect(pngBase64Size('not-base64')).toBeUndefined()
})

test('extracts only local image targets from markdown', () => {
  const markdown = [
    '![chart](./images/chart.png)',
    '![absolute](D:/pics/y.PNG)',
    '![spaced](<./my images/x.png> "title")',
    '![file](file:///C:/pics/x.png)',
    '![remote](https://example.com/a.png)',
    '![data](data:image/png;base64,AAAA)',
  ].join('\n')

  expect(extractMarkdownImagePaths(markdown)).toEqual([
    './images/chart.png',
    'D:/pics/y.PNG',
    './my images/x.png',
    'C:/pics/x.png',
  ])
  expect(extractMarkdownImagePaths('no images here')).toEqual([])
})

test('fits pictures to the terminal width without stretching', () => {
  expect(fitLayout({ width: 1, height: 1 }, 80)).toEqual({ columns: 32, rows: 16 })
  expect(fitLayout({ width: 2, height: 1 }, 80)).toEqual({ columns: 48, rows: 12 })
  expect(fitLayout({ width: 100, height: 100 }, 20)).toEqual({ columns: 16, rows: 8 })
  expect(fitLayout({ width: 1, height: 100 }, 80)).toEqual({ columns: 1, rows: 16 })
})

test('collects inline PNGs from Anthropic and MCP tool results', () => {
  expect(
    collectInlinePictures({
      content: [
        { type: 'text', text: 'screenshot' },
        {
          type: 'image',
          source: { type: 'base64', media_type: 'image/png', data: PNG_1X1 },
        },
      ],
    }),
  ).toHaveLength(1)

  expect(
    collectInlinePictures({
      content: [{ type: 'image', data: PNG_1X1, mimeType: 'image/png' }],
    }),
  ).toHaveLength(1)

  // Read 工具的结果形态：图片在 file.base64 / file.type。
  expect(
    collectInlinePictures({
      type: 'image',
      file: { base64: PNG_1X1, type: 'image/png', originalSize: 68 },
    }),
  ).toHaveLength(1)

  expect(
    collectInlinePictures({
      content: [
        {
          type: 'image',
          source: { type: 'base64', media_type: 'image/jpeg', data: PNG_1X1 },
        },
        { type: 'image', source: { type: 'url', url: 'https://example.com/a.png' } },
      ],
    }),
  ).toEqual([])
})

test('lays multiple pictures side by side within the width budget', () => {
  expect(layoutPictures([{ width: 320, height: 200 }], 80)).toEqual([
    { columns: 48, rows: 15 },
  ])
  expect(
    layoutPictures(
      [
        { width: 320, height: 200 },
        { width: 320, height: 200 },
        { width: 320, height: 200 },
      ],
      80,
    ),
  ).toEqual([
    { columns: 15, rows: 5 },
    { columns: 15, rows: 5 },
    { columns: 15, rows: 5 },
  ])
  expect(layoutPictures([{ width: 1, height: 1 }, { width: 1, height: 1 }], 80)).toEqual([
    { columns: 23, rows: 12 },
    { columns: 23, rows: 12 },
  ])
  expect(
    layoutPictures([{ width: 320, height: 200 }, { width: 320, height: 200 }], 8),
  ).toEqual([
    { columns: 4, rows: 1 },
    { columns: 4, rows: 1 },
  ])
  expect(
    layoutPictures(
      Array.from({ length: 8 }, () => ({ width: 320, height: 200 })),
      80,
    ),
  ).toEqual(Array.from({ length: 8 }, () => ({ columns: 15, rows: 5 })))
})

test('strips host image placeholders from displayed user text', () => {
  expect(stripImagePlaceholders('[Image #1]')).toBe('')
  expect(stripImagePlaceholders('[Image #1] 看一下这个')).toBe('看一下这个')
  expect(stripImagePlaceholders('比较 [Image #2] 和 [Image #1] 两张')).toBe('比较 和 两张')
  expect(stripImagePlaceholders('没有占位')).toBe('没有占位')
})

function engineWithEnv(env: Record<string, string>): EngineInterface {
  return {
    env: { get: async (name: string) => env[name] },
  } as unknown as EngineInterface
}

test('detects Kitty and WezTerm as image capable', async () => {
  expect(await detectImageSupport(engineWithEnv({ TERM_PROGRAM: 'kitty' }))).toBe('supported')
  expect(await detectImageSupport(engineWithEnv({ WEZTERM_PANE: '1' }))).toBe('supported')
})

test('treats VS Code, Apple Terminal and Windows Terminal as unsupported', async () => {
  expect(await detectImageSupport(engineWithEnv({ TERM_PROGRAM: 'vscode' }))).toBe('unsupported')
  expect(await detectImageSupport(engineWithEnv({ WT_SESSION: 'session' }))).toBe('unsupported')
  expect(await detectImageSupport(engineWithEnv({ TERM: 'dumb' }))).toBe('unsupported')
})

test('honours the manual override and leaves unknown terminals to the host', async () => {
  expect(
    await detectImageSupport(
      engineWithEnv({ CC_TERMINAL_IMAGE: 'off', TERM_PROGRAM: 'kitty' }),
    ),
  ).toBe('unsupported')
  expect(await detectImageSupport(engineWithEnv({ CC_TERMINAL_IMAGE: 'on' }))).toBe('supported')
  expect(await detectImageSupport(engineWithEnv({}))).toBe('unknown')
  expect(
    await detectImageSupport(engineWithEnv({ TERM_PROGRAM: 'kitty', TMUX: '/tmp/tmux' })),
  ).toBe('unknown')
})

function mockSession(
  on: On,
  env: Record<string, string>,
  image?: Record<string, unknown>,
) {
  resetImageSupport()
  mock.env(on, { HOME: '/test-home', ...env })
  on('fs.read', () => ({ value: JSON.stringify({ image }) }))
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('command.register', () => ({ value: { command: 'terminal-image' } }))
  // 宿主原本绘制的工具行；Mod 的 hook 用 next 保留下层内容。
  on('ui.render', { component: 'ToolUse' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    return Text({ children: ['call'] })
  })
  on('ui.render', { component: 'ToolGroup' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    return Text({ children: ['group'] })
  })
}

function toolUseProps(overrides: Record<string, unknown> = {}) {
  return {
    tool_use_id: 'read-1',
    tool: 'Read',
    input: { file_path: '/work/project/image.png' },
    isRunning: false,
    isErrored: false,
    isInterrupted: false,
    // Read 工具的真实结果形态。
    output: {
      type: 'image',
      file: { base64: PNG_1X1, type: 'image/png', originalSize: 68 },
    },
    ...overrides,
  }
}

function mountToolUse($: Engine, viewport = { columns: 80, rows: 30 }) {
  return $.ui.mount({
    plugin: 'terminal-image',
    surface: 'terminal',
    component: 'ToolUse',
    viewport,
    props: toolUseProps(),
  })
}

test('renders an inline tool result image on a supporting terminal', async ($, on) => {
  mockSession(on, { TERM_PROGRAM: 'WezTerm' })
  await $.session.start({ cwd: '/work/project', surface: 'terminal', isInteractive: true })

  const ui = await mountToolUse($)

  const image = await ui.find({ type: 'Image' })
  expect(image).toBeDefined()
  expect(image?.props.columns).toBe(32)
  expect(image?.props.rows).toBe(16)
  expect(image?.props.alt).toBe(' ')
  await ui.unmount()
})

test('falls back to character cells on a terminal without graphics support', async ($, on) => {
  mockSession(on, { TERM_PROGRAM: 'vscode' })
  await $.session.start({ cwd: '/work/project', surface: 'terminal', isInteractive: true })

  const ui = await mountToolUse($)

  expect(await ui.find({ type: 'Image' })).toBeUndefined()
  const raster = await ui.find({ type: 'Raster' })
  expect(raster).toBeDefined()
  expect(raster?.props.columns).toBe(32)
  expect(raster?.props.rows).toBe(16)
  expect(typeof raster?.props.cells).toBe('string')
  expect((raster?.props.cells as string).length).toBeGreaterThan(0)
  // 下层工具行仍由 Mod 保留。
  expect(await ui.find({ type: 'Text', text: 'call' })).toBeDefined()
  await ui.unmount()
})

test('honours blocks=off on a terminal without graphics support', async ($, on) => {
  mockSession(on, { TERM_PROGRAM: 'vscode' }, { blocks: 'off' })
  await $.session.start({ cwd: '/work/project', surface: 'terminal', isInteractive: true })

  const ui = await mountToolUse($)

  expect(await ui.find({ type: 'Image' })).toBeUndefined()
  expect(await ui.find({ type: 'Raster' })).toBeUndefined()
  await ui.unmount()
})

test('blocks=on replaces the native image element on a supporting terminal', async ($, on) => {
  mockSession(on, { TERM_PROGRAM: 'WezTerm' }, { blocks: 'on' })
  await $.session.start({ cwd: '/work/project', surface: 'terminal', isInteractive: true })

  const ui = await mountToolUse($)

  expect(await ui.find({ type: 'Image' })).toBeUndefined()
  expect(await ui.find({ type: 'Raster' })).toBeDefined()
  await ui.unmount()
})

test('keeps the tool row when a picture cannot be decoded for character cells', async ($, on) => {
  mockSession(on, { TERM_PROGRAM: 'vscode' })
  await $.session.start({ cwd: '/work/project', surface: 'terminal', isInteractive: true })

  const ui = await $.ui.mount({
    plugin: 'terminal-image',
    surface: 'terminal',
    component: 'ToolUse',
    viewport: { columns: 80, rows: 30 },
    props: toolUseProps({
      output: {
        type: 'image',
        file: {
          base64: 'iVBORw0KGgoAAAANSUhEUgAAAAIAAAAD',
          type: 'image/png',
        },
      },
    }),
  })

  expect(await ui.find({ type: 'Raster' })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: 'call' })).toBeDefined()
  await ui.unmount()
})

test('leaves non-terminal surfaces to the engine', async ($, on) => {
  mockSession(on, { TERM_PROGRAM: 'WezTerm' })
  await $.session.start({ cwd: '/work/project', surface: 'desktop', isInteractive: true })

  const ui = await $.ui.mount({
    plugin: 'terminal-image',
    surface: 'desktop',
    component: 'ToolUse',
    props: toolUseProps(),
  })

  expect(await ui.find({ type: 'Image' })).toBeUndefined()
  await ui.unmount()
})

test('shows images under a folded tool group and leaves expanded rows to ToolUse', async ($, on) => {
  mockSession(on, { TERM_PROGRAM: 'WezTerm' })
  await $.session.start({ cwd: '/work/project', surface: 'terminal', isInteractive: true })

  const folded = await $.ui.mount({
    plugin: 'terminal-image',
    surface: 'terminal',
    component: 'ToolGroup',
    props: {
      calls: [toolUseProps()],
      isActive: false,
      isExpanded: false,
    },
  })
  expect(await folded.find({ type: 'Image' })).toBeDefined()
  await folded.unmount()

  const expanded = await $.ui.mount({
    plugin: 'terminal-image',
    surface: 'terminal',
    component: 'ToolGroup',
    props: {
      calls: [toolUseProps()],
      isActive: false,
      isExpanded: true,
    },
  })
  expect(await expanded.find({ type: 'Image' })).toBeUndefined()
  await expanded.unmount()
})

test('shows multiple tool images side by side', async ($, on) => {
  mockSession(on, { TERM_PROGRAM: 'WezTerm' })
  await $.session.start({ cwd: '/work/project', surface: 'terminal', isInteractive: true })

  const ui = await $.ui.mount({
    plugin: 'terminal-image',
    surface: 'terminal',
    component: 'ToolGroup',
    props: {
      calls: [
        toolUseProps({ tool_use_id: 'read-1' }),
        toolUseProps({ tool_use_id: 'read-2' }),
        toolUseProps({ tool_use_id: 'read-3' }),
      ],
      isActive: false,
      isExpanded: false,
    },
  })

  const images = await ui.findAll({ type: 'Image' })
  expect(images).toHaveLength(3)
  expect(images.map(image => image.props.columns)).toEqual([15, 15, 15])
  expect(images.map(image => image.props.rows)).toEqual([8, 8, 8])
  await ui.unmount()
})

test('wraps more than a row of tool images without dropping any', async ($, on) => {
  mockSession(on, { TERM_PROGRAM: 'WezTerm' })
  await $.session.start({ cwd: '/work/project', surface: 'terminal', isInteractive: true })

  const ui = await $.ui.mount({
    plugin: 'terminal-image',
    surface: 'terminal',
    component: 'ToolGroup',
    props: {
      calls: Array.from({ length: 8 }, (_, index) =>
        toolUseProps({ tool_use_id: `read-${index}` }),
      ),
      isActive: false,
      isExpanded: false,
    },
  })

  const images = await ui.findAll({ type: 'Image' })
  expect(images).toHaveLength(8)
  expect(images.every(image => image.props.columns === 15)).toBe(true)
  await ui.unmount()
})

test('keeps character cells within the render tree size budget', async ($, on) => {
  mockSession(on, { TERM_PROGRAM: 'vscode' })
  await $.session.start({ cwd: '/work/project', surface: 'terminal', isInteractive: true })

  const ui = await $.ui.mount({
    plugin: 'terminal-image',
    surface: 'terminal',
    component: 'ToolGroup',
    props: {
      calls: Array.from({ length: 40 }, (_, index) =>
        toolUseProps({ tool_use_id: `read-${index}` }),
      ),
      isActive: false,
      isExpanded: false,
    },
  })

  const rasters = await ui.findAll({ type: 'Raster' })
  // 15×8 格 = 1920 字符/张，60,000 字符预算内最多 31 张。
  expect(rasters).toHaveLength(31)
  expect(rasters.every(raster => raster.props.columns === 15)).toBe(true)
  await ui.unmount()
})

test('normalizes image settings and falls back on invalid fields', () => {
  expect(normalizeImageConfig(undefined)).toEqual(DEFAULT_IMAGE_CONFIG)
  expect(normalizeImageConfig({ enabled: false, mode: 'off', showToolImages: false })).toEqual({
    ...DEFAULT_IMAGE_CONFIG,
    enabled: false,
    mode: 'off',
    showToolImages: false,
  })
  expect(normalizeImageConfig({ maxColumns: 300, maxRows: 0 })).toMatchObject({
    maxColumns: 255,
    maxRows: 1,
  })
  expect(normalizeImageConfig({ maxColumns: 3.5, maxRows: '16' })).toMatchObject({
    maxColumns: 48,
    maxRows: 16,
  })
})

test('honours the saved plugin switch from the unified config file', async ($, on) => {
  mockSession(on, { TERM_PROGRAM: 'WezTerm' }, { enabled: false })
  await $.session.start({ cwd: '/work/project', surface: 'terminal', isInteractive: true })

  const ui = await mountToolUse($)
  expect(await ui.find({ type: 'Image' })).toBeUndefined()
  await ui.unmount()
})

test('honours the never-show mode from configuration', async ($, on) => {
  mockSession(on, { TERM_PROGRAM: 'WezTerm' }, { mode: 'off' })
  await $.session.start({ cwd: '/work/project', surface: 'terminal', isInteractive: true })

  const ui = await mountToolUse($)
  expect(await ui.find({ type: 'Image' })).toBeUndefined()
  await ui.unmount()
})

test('uses the configured maximum picture size', async ($, on) => {
  mockSession(on, { TERM_PROGRAM: 'WezTerm' }, { maxColumns: 10, maxRows: 5 })
  await $.session.start({ cwd: '/work/project', surface: 'terminal', isInteractive: true })

  const ui = await mountToolUse($)
  const image = await ui.find({ type: 'Image' })
  expect(image?.props.columns).toBe(10)
  expect(image?.props.rows).toBe(5)
  await ui.unmount()
})
