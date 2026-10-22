import type { EngineInterface, FsEntry, FsStat, Register, RenderSurface } from 'claude-code'

const PANE_ID = 'project-files'
const BINARY_MESSAGE = '该文件不是可预览的 UTF-8 文本。'

export type ProjectFilesConfig = {
  maxPreviewChars: number
  maxListEntries: number
}

export const DEFAULT_PROJECT_FILES_CONFIG: ProjectFilesConfig = {
  maxPreviewChars: 60_000,
  maxListEntries: 200,
}

let config: ProjectFilesConfig = { ...DEFAULT_PROJECT_FILES_CONFIG }
let configPath = ''

type PreviewKind = 'text' | 'markdown' | 'code' | 'diff' | 'image' | 'binary'

type Preview = {
  name: string
  path: string
  kind: PreviewKind
  text?: string
  isPng?: boolean
  size: number
}

interface FileViewState {
  root: string
  current: string
  entries: FsEntry[]
  preview?: Preview
  error?: string
  loading: boolean
}

const MARKDOWN_EXTENSIONS = new Set(['md', 'mdx', 'markdown'])
const DIFF_EXTENSIONS = new Set(['diff', 'patch'])
const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'ico', 'svg', 'avif'])
const CODE_LANGUAGES: Record<string, string> = {
  ts: 'typescript',
  tsx: 'tsx',
  js: 'javascript',
  jsx: 'jsx',
  mjs: 'javascript',
  cjs: 'javascript',
  py: 'python',
  go: 'go',
  rs: 'rust',
  java: 'java',
  kt: 'kotlin',
  c: 'c',
  h: 'c',
  cpp: 'cpp',
  hpp: 'cpp',
  cs: 'csharp',
  rb: 'ruby',
  php: 'php',
  sh: 'bash',
  bash: 'bash',
  ps1: 'powershell',
  json: 'json',
  yml: 'yaml',
  yaml: 'yaml',
  toml: 'toml',
  sql: 'sql',
  html: 'html',
  css: 'css',
  scss: 'scss',
  xml: 'xml',
  vue: 'vue',
  svelte: 'svelte',
  lua: 'lua',
  swift: 'swift',
}

let state: FileViewState | undefined
let paneOpen = false
let navigation = 0

function normalizePath(path: string): string {
  return path.replace(/[\\/]+/gu, '/')
}

export function normalizeProjectFilesConfig(value: unknown): ProjectFilesConfig {
  const result = { ...DEFAULT_PROJECT_FILES_CONFIG }
  if (!value || typeof value !== 'object') return result

  const root = value as Record<string, unknown>
  const data = (root.projectFiles && typeof root.projectFiles === 'object'
    ? root.projectFiles
    : root) as Record<string, unknown>

  if (typeof data.maxPreviewChars === 'number' && Number.isFinite(data.maxPreviewChars)) {
    result.maxPreviewChars = Math.min(1_000_000, Math.max(1_000, Math.round(data.maxPreviewChars)))
  }
  if (typeof data.maxListEntries === 'number' && Number.isFinite(data.maxListEntries)) {
    result.maxListEntries = Math.min(2_000, Math.max(10, Math.round(data.maxListEntries)))
  }
  return result
}

async function loadConfig($: EngineInterface): Promise<void> {
  const home = (await $.env.get('HOME')) ?? (await $.env.get('USERPROFILE')) ?? ''
  configPath = home ? `${home.replace(/[\\/]+$/u, '')}/.config/my-cc-mods/config.json` : ''
  config = { ...DEFAULT_PROJECT_FILES_CONFIG }
  if (!configPath) return
  try {
    const content = await $.fs.read(configPath)
    if (typeof content === 'string') config = normalizeProjectFilesConfig(JSON.parse(content))
  } catch {
    config = { ...DEFAULT_PROJECT_FILES_CONFIG }
  }
}

function pathKey(path: string): string {
  const normalized = normalizePath(path).replace(/\/$/u, '')
  return /^[A-Za-z]:/u.test(normalized) ? normalized.toLowerCase() : normalized
}

function joinPath(parent: string, child: string): string {
  return `${parent.replace(/[\\/]+$/u, '')}/${child}`
}

function hasParentSegment(path: string): boolean {
  return normalizePath(path).split('/').some(part => part === '..')
}

function isInside(root: string, candidate: string): boolean {
  const rootKey = pathKey(root)
  const candidateKey = pathKey(candidate)
  return candidateKey === rootKey || candidateKey.startsWith(`${rootKey}/`)
}

function relativePath(root: string, path: string): string {
  const rootKey = pathKey(root)
  const pathValue = pathKey(path)
  if (pathValue === rootKey) return '.'
  if (!pathValue.startsWith(`${rootKey}/`)) return path
  return normalizePath(path).slice(normalizePath(root).replace(/\/$/u, '').length + 1)
}

function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot < 0 ? '' : name.slice(dot + 1).toLowerCase()
}

export function previewKindFor(name: string): PreviewKind {
  const extension = extensionOf(name)
  if (IMAGE_EXTENSIONS.has(extension)) return 'image'
  if (MARKDOWN_EXTENSIONS.has(extension)) return 'markdown'
  if (DIFF_EXTENSIONS.has(extension)) return 'diff'
  if (CODE_LANGUAGES[extension]) return 'code'
  return 'text'
}

export function languageFor(name: string): string | undefined {
  return CODE_LANGUAGES[extensionOf(name)]
}

function clipText(text: string): string {
  return truncatePreview(text)
}

export function truncatePreview(text: string, maxLength = config.maxPreviewChars): string {
  return text.length > maxLength
    ? `${text.slice(0, maxLength)}\n…（内容已截断）`
    : text
}

function decodeBase64(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return bytes
}

function decodeText(bytes: Uint8Array): string | undefined {
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    if (text.includes('\u0000')) return undefined
    const controls = Array.from(text).filter(character => {
      const code = character.codePointAt(0) ?? 0
      return (code < 0x09 || (code > 0x0d && code < 0x20)) && code !== 0x0b
    }).length
    return controls > Math.max(2, text.length / 100) ? undefined : text
  } catch {
    return undefined
  }
}

function reason(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

async function sessionRoot($: EngineInterface): Promise<string> {
  const cwd = await $.session.cwd()
  try {
    const stat = await $.fs.stat(cwd, { resolve: true })
    return stat.realPath ?? cwd
  } catch {
    return cwd
  }
}

async function resolvedPath($: EngineInterface, root: string, path: string): Promise<{ path: string; stat: FsStat } | undefined> {
  if (!path || path.includes('\u0000') || hasParentSegment(path)) return undefined
  const stat = await $.fs.stat(path, { resolve: true }).catch(() => undefined)
  if (!stat?.realPath || !isInside(root, stat.realPath)) return undefined
  return { path, stat }
}

async function listDirectory($: EngineInterface, root: string, path: string): Promise<FsEntry[]> {
  const target = await resolvedPath($, root, path)
  if (!target || target.stat.kind !== 'dir') throw new Error('目录不存在或超出会话目录范围')
  const entries = await $.fs.list(target.path)
  return entries
    .filter(entry => entry.name !== '.' && entry.name !== '..')
    .sort((left, right) => {
      if (left.kind !== right.kind) return left.kind === 'dir' ? -1 : 1
      return left.name.localeCompare(right.name)
    })
    .slice(0, config.maxListEntries)
}

async function loadDirectory($: EngineInterface, path: string): Promise<void> {
  const token = ++navigation
  const root = state?.root ?? await sessionRoot($)
  const current = path || root
  state = { root, current, entries: [], loading: true }
  invalidate($)
  try {
    const entries = await listDirectory($, root, current)
    if (token !== navigation) return
    state = { root, current, entries, loading: false }
  } catch (error) {
    if (token !== navigation) return
    state = { root, current, entries: [], loading: false, error: reason(error) }
  }
  invalidate($)
}

async function previewFile($: EngineInterface, entry: FsEntry): Promise<void> {
  if (!state) return
  const token = ++navigation
  const path = joinPath(state.current, entry.name)
  const target = await resolvedPath($, state.root, path)
  if (token !== navigation) return
  if (!target || target.stat.kind !== 'file') {
    state.error = '文件不存在或超出会话目录范围'
    invalidate($)
    return
  }

  const kind = previewKindFor(entry.name)
  state = { ...state, preview: undefined, error: undefined, loading: true }
  invalidate($)

  if (kind === 'image') {
    state = {
      ...state,
      loading: false,
      preview: {
        name: entry.name,
        path: target.path,
        kind,
        isPng: extensionOf(entry.name) === 'png',
        size: target.stat.size,
      },
    }
    invalidate($)
    return
  }

  try {
    const result = await $.fs.read(target.path, { as: 'bytes' })
    if (token !== navigation) return
    const text = decodeText(decodeBase64(result.base64))
    state = text === undefined
      ? { ...state, loading: false, preview: { name: entry.name, path: target.path, kind: 'binary', size: target.stat.size } }
      : {
          ...state,
          loading: false,
          preview: { name: entry.name, path: target.path, kind, text: clipText(text), size: target.stat.size },
        }
  } catch (error) {
    if (token !== navigation) return
    state = { ...state, loading: false, error: `读取失败：${reason(error)}` }
  }
  invalidate($)
}

function invalidate($: EngineInterface): void {
  $.ui.invalidate('ui.render')
}

function copyText($: EngineInterface, text: string, surface: RenderSurface | undefined): void {
  void $.ui.copy({ text, surface })
    .then(result => {
      if (!result.isCopied) $.ui.toast(`复制失败：${result.reason ?? '当前 surface 不支持'}`)
    })
    .catch(error => $.ui.toast(`复制失败：${reason(error)}`))
}

function renderPreview($: EngineInterface, e: any, preview: Preview): any[] {
  const elements: any = $.ui.resolve(e)
  const { Box, Text, Button } = elements
  const rows: any[] = [
    Box({ flexDirection: 'row', gap: 1, children: [
      Button({ key: 'project-files-preview-back', label: '返回列表', onPress: () => {
        if (!state) return
        state = { ...state, preview: undefined, error: undefined }
        invalidate($)
      } }),
      Button({ key: 'project-files-copy-path', label: '复制路径', onPress: () => copyText($, preview.path, e.surface) }),
      Text({ color: 'cyan', children: [`文件：${preview.name} (${preview.size} B)`] }),
    ] }),
    Text({ color: 'gray', wrap: 'truncate-end', children: [preview.path] }),
  ]

  const text = preview.text ?? ''
  if (preview.kind === 'markdown' && elements.Markdown) {
    rows.push(elements.Markdown({ text }))
  } else if (preview.kind === 'code' && elements.Code) {
    rows.push(elements.Code({ source: text, path: preview.path, startLine: 1, wrap: 'wrap' }))
  } else if (preview.kind === 'diff' && elements.Code) {
    rows.push(elements.Code({ source: text, format: 'diff', wrap: 'wrap' }))
  } else if (preview.kind === 'image') {
    if (e.surface === 'terminal' && preview.isPng && elements.Image) {
      rows.push(elements.Image({
        source: { file: preview.path, format: 'png' },
        columns: 60,
        rows: 20,
        alt: preview.name,
      }))
    } else {
      rows.push(Text({
        color: 'gray',
        children: [preview.isPng ? '当前 surface 不支持终端图片预览。' : '图片预览目前只支持 PNG（terminal）。'],
      }))
    }
  } else if (preview.kind === 'binary') {
    rows.push(Text({ color: 'red', children: [BINARY_MESSAGE] }))
  } else {
    rows.push(Text({ wrap: 'wrap', children: [text] }))
  }

  return rows
}

function renderPane($: EngineInterface, e: any): any {
  const elements: any = $.ui.resolve(e)
  const { Box, Button, Text } = elements
  const current = state
  if (!current) return Box({ children: [Text({ children: ['正在加载…'] })] })

  const children: any[] = [
    Box({ flexDirection: 'row', gap: 1, children: [
      Button({ key: 'project-files-up', label: '返回', onPress: () => {
        if (current.preview) {
          state = { ...current, preview: undefined, error: undefined }
          invalidate($)
        } else if (pathKey(current.current) !== pathKey(current.root)) {
          const parent = current.current.replace(/[\\/][^\\/]*$/u, '') || current.root
          void loadDirectory($, parent)
        }
      } }),
      Button({ key: 'project-files-refresh', label: '刷新', onPress: () => void loadDirectory($, current.current) }),
      ...(current.preview
        ? [Button({ key: 'project-files-copy-current-path', label: '复制路径', onPress: () => copyText($, current.preview!.path, e.surface) })]
        : []),
    ] }),
    Text({ color: 'cyan', wrap: 'truncate-end', children: [`根目录：${current.root}`] }),
    Text({ color: 'gray', wrap: 'truncate-end', children: [`当前目录：${relativePath(current.root, current.current)}`] }),
  ]

  if (current.loading) children.push(Text({ color: 'gray', children: ['正在加载…'] }))
  if (current.error) children.push(Text({ color: 'red', children: [current.error] }))

  if (current.preview) {
    children.push(...renderPreview($, e, current.preview))
  } else if (!current.loading && !current.error) {
    if (current.entries.length === 0) children.push(Text({ color: 'gray', children: ['目录为空'] }))
    current.entries.forEach(entry => {
      const label = `${entry.kind === 'dir' ? '目录' : entry.kind === 'file' ? '文件' : '其他'}  ${entry.name}${entry.kind === 'file' ? ` (${entry.size} B)` : ''}`
      children.push(Button({
        key: `project-files-entry-${entry.name}`,
        label,
        onPress: () => entry.kind === 'dir'
          ? void loadDirectory($, joinPath(current.current, entry.name))
          : entry.kind === 'file' ? void previewFile($, entry) : undefined,
      }))
    })
  }

  return Box({ flexDirection: 'column', children })
}

async function openPane($: EngineInterface): Promise<void> {
  if (paneOpen) return
  paneOpen = true
  const result = await $.ui.open({ id: PANE_ID, title: '项目文件', columns: 80, closeOnEscape: true })
  if (!result.isPlaced) $.ui.toast('项目文件面板需要足够的终端宽度。')
}

export function isPathInside(root: string, candidate: string): boolean {
  return !hasParentSegment(candidate) && isInside(root, candidate)
}

export const register: Register = on => {
  on('ui.render', { component: 'Pane', requestId: PANE_ID }, ($, e) => renderPane($, e))

  on('fs.write', async ($, e, next) => {
    if (configPath && pathKey(e.path) === pathKey(configPath)) await loadConfig($)
    return next(e)
  })

  on('session.start', async ($, e, next) => {
    await loadConfig($)
    const root = await sessionRoot($)
    state = { root, current: root, entries: [], loading: false }
    await $.command.register({
      name: 'project-files',
      description: 'Browse and preview files under the current session directory. Use close or refresh.',
      argumentHint: '[close | refresh]',
    })
    return next(e)
  })

  on('command.run', { command: 'project-files' }, async ($, e) => {
    const argument = e.args.trim().toLowerCase()
    if (argument === 'close') {
      await $.ui.close({ id: PANE_ID })
      paneOpen = false
      return { text: '项目文件面板已关闭。' }
    }
    if (argument !== '' && argument !== 'refresh') return { text: '用法：/project-files [close|refresh]' }
    if (!state) {
      const root = await sessionRoot($)
      state = { root, current: root, entries: [], loading: false }
    }
    await loadDirectory($, state.current)
    await openPane($)
    return { text: argument === 'refresh' ? '项目文件面板已刷新。' : '项目文件面板已打开。' }
  })

  on('ui.close', { id: PANE_ID }, async ($, e, next) => {
    paneOpen = false
    return next(e)
  }).catch(($, e, next) => next.called ? next(e) : { value: undefined })
}
