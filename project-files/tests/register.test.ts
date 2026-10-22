import { expect, mock, test } from 'claude-code/testing'
import { isPathInside, normalizeProjectFilesConfig, previewKindFor, register, truncatePreview } from '../hooks/register'

const paneProps = {
  title: '项目文件',
  isFocused: false,
  bodyColumns: 80,
  placement: 'dock',
  scroll: { offset: 0, bodyRows: 30 },
  view: {},
} as const

function mockFs(on: Parameters<typeof register>[0]) {
  const world = {
    cwd: 'C:/work/project',
    lists: [] as string[],
    reads: [] as string[],
    opened: [] as string[],
    copied: [] as string[],
    closed: 0,
    readContent: '# hello' as string | undefined,
    binary: false,
    configText: undefined as string | undefined,
  }
  mock.env(on, { HOME: '/test-home' })
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('session.cwd', () => ({ value: world.cwd }))
  on('command.register', () => ({ value: { command: 'project-files' } }))
  on('ui.open', ($, e) => {
    world.opened.push(e.title ?? '')
    return { value: { isPlaced: true } }
  })
  on('ui.close', () => {
    world.closed += 1
    return { value: undefined }
  })
  on('ui.copy', ($, e) => {
    world.copied.push(e.text)
    return { value: { isCopied: true } }
  })
  on('fs.stat', ($, e) => {
    const isFile = /\.(md|ts|png|bin)$/iu.test(e.path)
    return { value: { kind: isFile ? 'file' : 'dir', size: 12, mtimeMs: 0, isLink: false, realPath: e.path } }
  })
  on('fs.list', ($, e) => {
    world.lists.push(e.path)
    return { value: [
      { name: 'src', kind: 'dir', size: 0, mtimeMs: 0, isLink: false },
      { name: 'README.md', kind: 'file', size: 12, mtimeMs: 0, isLink: false },
      { name: 'main.ts', kind: 'file', size: 12, mtimeMs: 0, isLink: false },
      { name: 'logo.png', kind: 'file', size: 12, mtimeMs: 0, isLink: false },
      { name: 'blob.bin', kind: 'file', size: 12, mtimeMs: 0, isLink: false },
    ] }
  })
  on('fs.read', ($, e) => {
    world.reads.push(e.path)
    if (/[\\/]\.config[\\/]my-cc-mods[\\/]config\.json$/u.test(e.path)) return { value: world.configText }
    const content = world.binary
      ? String.fromCharCode(0xff, 0xfe)
      : (world.readContent ?? '# hello')
    return { value: { base64: btoa(content) } }
  })
  return world
}

test('applies preview limits from the unified config file', async ($, on) => {
  const world = mockFs(on)
  world.configText = JSON.stringify({ projectFiles: { maxPreviewChars: 1_000 } })
  world.readContent = 'x'.repeat(2_000)
  await $.session.start({ cwd: world.cwd, surface: 'terminal', isInteractive: true })
  await $.command.run({ origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 }, command: 'project-files', args: '' })
  const ui = await $.ui.mount({
    plugin: 'project-files',
    surface: 'terminal',
    component: 'Pane',
    requestId: 'project-files',
    props: paneProps,
  })

  await ui.press({ key: 'project-files-entry-README.md' })
  const markdown = await ui.find({ type: 'Markdown' })
  expect(markdown?.props.text).toContain('…（内容已截断）')
  expect(markdown?.props.text.length).toBe(1_009)
  await ui.unmount()
})

test('rejects parent traversal and paths outside the session directory', () => {
  expect(isPathInside('C:/work/project', 'C:/work/project/src')).toBe(true)
  expect(isPathInside('C:/work/project', 'C:/work/project/../secrets')).toBe(false)
  expect(isPathInside('C:/work/project', 'C:/work/projects-other')).toBe(false)
})

test('truncates long previews with an explicit marker', () => {
  const result = truncatePreview('x'.repeat(60_001))
  expect(result.endsWith('…（内容已截断）')).toBe(true)
  expect(result.length).toBe(60_009)
  expect(truncatePreview('x'.repeat(21), 20)).toBe(`${'x'.repeat(20)}\n…（内容已截断）`)
})

test('normalizes file browser limits and clamps invalid values', () => {
  expect(normalizeProjectFilesConfig({})).toEqual({ maxPreviewChars: 60_000, maxListEntries: 200 })
  expect(normalizeProjectFilesConfig({
    projectFiles: { maxPreviewChars: 120_000, maxListEntries: 500 },
  })).toEqual({ maxPreviewChars: 120_000, maxListEntries: 500 })
  expect(normalizeProjectFilesConfig({
    projectFiles: { maxPreviewChars: 10, maxListEntries: 99_999 },
  })).toEqual({ maxPreviewChars: 1_000, maxListEntries: 2_000 })
  expect(normalizeProjectFilesConfig({ maxPreviewChars: '120000' })).toEqual({
    maxPreviewChars: 60_000,
    maxListEntries: 200,
  })
})

test('classifies previews by file type', () => {
  expect(previewKindFor('README.md')).toBe('markdown')
  expect(previewKindFor('patch.diff')).toBe('diff')
  expect(previewKindFor('src/main.ts')).toBe('code')
  expect(previewKindFor('logo.png')).toBe('image')
  expect(previewKindFor('notes.txt')).toBe('text')
})

test('opens, refreshes and closes the independent pane', async ($, on) => {
  const world = mockFs(on)
  await $.session.start({ cwd: world.cwd, surface: 'terminal', isInteractive: true })
  await $.command.run({ origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 }, command: 'project-files', args: '' })
  expect(world.opened).toEqual(['项目文件'])
  expect(world.lists).toEqual(['C:\\work\\project'])

  await $.command.run({ origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 }, command: 'project-files', args: 'refresh' })
  expect(world.lists).toEqual(['C:\\work\\project', 'C:\\work\\project'])
  await $.command.run({ origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 }, command: 'project-files', args: 'close' })
  expect(world.closed).toBe(1)
})

test('renders Markdown, code, image and binary previews', async ($, on) => {
  const world = mockFs(on)
  await $.session.start({ cwd: world.cwd, surface: 'terminal', isInteractive: true })
  await $.command.run({ origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 }, command: 'project-files', args: '' })
  const ui = await $.ui.mount({
    plugin: 'project-files',
    surface: 'terminal',
    component: 'Pane',
    requestId: 'project-files',
    props: paneProps,
  })

  await ui.press({ key: 'project-files-entry-README.md' })
  expect(await ui.find({ type: 'Markdown' })).toBeDefined()
  await ui.press({ key: 'project-files-preview-back' })

  await ui.press({ key: 'project-files-entry-main.ts' })
  expect(await ui.find({ type: 'Code' })).toBeDefined()
  await ui.press({ key: 'project-files-preview-back' })

  await ui.press({ key: 'project-files-entry-logo.png' })
  expect(await ui.find({ type: 'Image' })).toBeDefined()
  expect(world.reads.some(path => path.endsWith('logo.png'))).toBe(false)
  await ui.press({ key: 'project-files-preview-back' })

  world.binary = true
  await ui.press({ key: 'project-files-entry-blob.bin' })
  expect(await ui.find({ type: 'Text', text: /不是可预览的 UTF-8 文本/ })).toBeDefined()
  await ui.unmount()
})

test('copies the preview path', async ($, on) => {
  const world = mockFs(on)
  await $.session.start({ cwd: world.cwd, surface: 'terminal', isInteractive: true })
  await $.command.run({ origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 }, command: 'project-files', args: '' })
  const ui = await $.ui.mount({
    plugin: 'project-files',
    surface: 'terminal',
    component: 'Pane',
    requestId: 'project-files',
    props: paneProps,
  })

  await ui.press({ key: 'project-files-entry-README.md' })
  await ui.press({ key: 'project-files-copy-path' })
  expect(world.copied).toEqual(['C:\\work\\project/README.md'])
  await ui.unmount()
})
