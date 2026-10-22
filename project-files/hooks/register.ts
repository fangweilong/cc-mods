import type { EngineInterface, FsEntry, FsStat, Register } from 'claude-code'

const PANE_ID = 'project-files'
const MAX_PREVIEW_LENGTH = 12_000
const MAX_LIST_ENTRIES = 200
const BINARY_MESSAGE = '该文件不是可预览的 UTF-8 文本。'

interface FileViewState {
  root: string
  current: string
  entries: FsEntry[]
  preview?: { name: string; text: string }
  error?: string
  loading: boolean
}

let state: FileViewState | undefined
let paneOpen = false

function normalizePath(path: string): string {
  return path.replace(/[\\/]+/gu, '/')
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

function clipText(text: string): string {
  return text.length > MAX_PREVIEW_LENGTH
    ? `${text.slice(0, MAX_PREVIEW_LENGTH)}\n…（内容已截断）`
    : text
}

function decodeBase64(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return bytes
}

function decodeText(bytes: Uint8Array): string | undefined {
  if (bytes.some(byte => byte === 0)) return undefined
  try {
    const text = new TextDecoder('utf-8').decode(bytes)
    if (text.includes('�')) return undefined
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
    .slice(0, MAX_LIST_ENTRIES)
}

async function loadDirectory($: EngineInterface, path: string): Promise<void> {
  const root = state?.root ?? await $.session.cwd()
  const current = path || root
  state = { root, current, entries: [], loading: true }
  invalidate($)
  try {
    const entries = await listDirectory($, root, current)
    state = { root, current, entries, loading: false }
  } catch (error) {
    state = { root, current, entries: [], loading: false, error: reason(error) }
  }
  invalidate($)
}

async function previewFile($: EngineInterface, entry: FsEntry): Promise<void> {
  if (!state) return
  const path = joinPath(state.current, entry.name)
  const target = await resolvedPath($, state.root, path)
  if (!target || target.stat.kind !== 'file') {
    state.error = '文件不存在或超出会话目录范围'
    invalidate($)
    return
  }

  state = { ...state, preview: undefined, error: undefined, loading: true }
  invalidate($)
  try {
    const result = await $.fs.read(target.path, { as: 'bytes' })
    const text = decodeText(decodeBase64(result.base64))
    state = text === undefined
      ? { ...state, loading: false, preview: { name: entry.name, text: BINARY_MESSAGE } }
      : { ...state, loading: false, preview: { name: entry.name, text: clipText(text) } }
  } catch (error) {
    state = { ...state, loading: false, error: `读取失败：${reason(error)}` }
  }
  invalidate($)
}

function invalidate($: EngineInterface): void {
  $.ui.invalidate('ui.render')
}

function renderPane($: EngineInterface, e: any): any {
  const { Box, Button, Text } = $.ui.resolve(e)
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
    ] }),
    Text({ color: 'cyan', children: [`根目录：${current.root}`] }),
    Text({ color: 'gray', children: [`当前目录：${current.current}`] }),
  ]

  if (current.loading) children.push(Text({ color: 'gray', children: ['正在加载…'] }))
  if (current.error) children.push(Text({ color: 'red', children: [current.error] }))

  if (current.preview) {
    children.push(Text({ color: 'cyan', weight: 'bold', children: [`文件：${current.preview.name}`] }))
    children.push(Text({ wrap: 'truncate-end', children: [current.preview.text] }))
  } else if (!current.loading && !current.error) {
    if (current.entries.length === 0) children.push(Text({ color: 'gray', children: ['目录为空'] }))
    current.entries.forEach((entry, index) => {
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

export function truncatePreview(text: string): string {
  return clipText(text)
}

export const register: Register = on => {
  on('ui.render', { component: 'Pane', requestId: PANE_ID }, ($, e) => renderPane($, e))

  on('session.start', async ($, e, next) => {
    state = { root: await $.session.cwd(), current: await $.session.cwd(), entries: [], loading: false }
    await $.command.register({
      name: 'project-files',
      description: 'Browse files under the current session directory. Use close or refresh.',
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
      const root = await $.session.cwd()
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
