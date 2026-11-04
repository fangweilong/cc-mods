import type {
  EngineInterface,
  ImageSource,
  Register,
  RenderComponent,
  RenderInput,
  RenderNode,
} from 'claude-code'

import { DEFAULT_IMAGE_CONFIG, loadImageConfig, type ImageConfig } from './config'
import { imageSupport, resetImageSupport } from './detect'
import { extractMarkdownImagePaths } from './markdown'
import { pngBase64Size, type PngSize } from './png'

const PLUGIN = 'terminal-image'
const MAX_COLUMNS = 48
const MAX_ROWS = 16
/** 终端单元格的高宽比近似值；只用于保持图片比例，不需要精确到像素。 */
const CELL_ASPECT = 2
const GUTTER = 4
/** 多图并排时每张的最小列数，决定一行放几张。 */
const MIN_SLOT = 15
const PICTURE_GAP = 1
const MAX_INLINE_BYTES = 2 * 1024 * 1024
const MAX_INLINE_BASE64 = Math.floor((MAX_INLINE_BYTES * 4) / 3) - 4
const MAX_ATTACHED_TEXTS = 32
const MAX_FILE_CACHE = 64
const MAX_MEDIA_SLICES = 8

type Picture = {
  source: ImageSource
  size: PngSize
}

type Attachment = {
  type: string
  mediaType?: string
  filename?: string
  id?: string
}

type FileCacheEntry = {
  mtimeMs: number
  size: number
  picture: Picture | null
}

type TerminalRender = RenderInput<RenderComponent, 'terminal'>

/** 用户粘贴的图片按提交文本缓存；渲染时没有稳定的 turnId 可以把两者对上。 */
const attachedPictures = new Map<string, Picture[]>()
const fileCache = new Map<string, FileCacheEntry>()
let cachedTmux: boolean | undefined
let imageConfig: ImageConfig = { ...DEFAULT_IMAGE_CONFIG }
let configPath = ''
/** `/terminal-image` 的诊断：最近一次带图片附件的提交读到了几张。 */
let lastImagePrompt = 'none'

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value))
}

function keyOf(text: string): string {
  return text.trim()
}

/**
 * 消息文本可能带也可能不带宿主注入的 `[Image #N]` 占位，两种形态都建索引。
 * 占位单独存在时清理后为空，不能作为键。
 */
function keysOf(text: string): string[] {
  const raw = keyOf(text)
  const bare = keyOf(stripImagePlaceholders(text))
  return bare && bare !== raw ? [raw, bare] : [raw]
}

function rememberPictures(text: string, pictures: Picture[]): void {
  for (const key of keysOf(text)) attachedPictures.set(key, pictures)
  trimOldest(attachedPictures, MAX_ATTACHED_TEXTS)
}

function forgetPictures(text: string): void {
  for (const key of keysOf(text)) attachedPictures.delete(key)
}

function normalizePath(path: string): string {
  return path.replace(/\\/gu, '/')
}

/**
 * 去掉宿主为用户附件插入的 `[Image #1]` 占位文本。
 * 只在图片确实会被渲染时使用；不改写会话里存储的消息。
 */
export function stripImagePlaceholders(text: string): string {
  return text
    .replace(/[ \t]*\[Image #\d+\][ \t]*/gu, ' ')
    .replace(/[ \t]{2,}/gu, ' ')
    .trim()
}

function trimOldest<T>(map: Map<string, T>, limit: number): void {
  while (map.size > limit) {
    const oldest = map.keys().next().value
    if (oldest === undefined) break
    map.delete(oldest)
  }
}

/** 按终端列数与图片宽高比算出 Image 的单元格尺寸。 */
export function fitLayout(
  size: PngSize,
  terminalColumns: number,
  maxColumns = MAX_COLUMNS,
  maxRows = MAX_ROWS,
): { columns: number; rows: number } {
  const available = Math.max(1, Math.min(maxColumns, terminalColumns - GUTTER))
  let columns = available
  let rows = Math.round((columns * size.height) / size.width / CELL_ASPECT)

  if (rows > maxRows) {
    rows = maxRows
    columns = Math.round((rows * CELL_ASPECT * size.width) / size.height)
  }

  return { columns: clamp(columns, 1, 255), rows: clamp(rows, 1, 255) }
}

/**
 * 多张图片并排共享宽度预算，每行放得下几张取决于可用宽度；
 * 单张仍走 `fitLayout` 的完整宽度。图片张数不设上限，超出一行自动换行。
 */
export function layoutPictures(
  sizes: PngSize[],
  terminalColumns: number,
  maxColumns = MAX_COLUMNS,
  maxRows = MAX_ROWS,
): { columns: number; rows: number }[] {
  if (sizes.length <= 1) {
    return sizes.map(size => fitLayout(size, terminalColumns, maxColumns, maxRows))
  }

  const perRow = picturesPerRow(sizes.length, terminalColumns, maxColumns)
  const total = Math.min(maxColumns, Math.max(1, terminalColumns - GUTTER))
  const slot = Math.max(
    1,
    Math.floor((total - PICTURE_GAP * (perRow - 1)) / perRow),
  )
  return sizes.map(size => fitLayout(size, slot + GUTTER, slot, maxRows))
}

/** 一行最多放几张：不超过图片总数，也不超过可用宽度能容纳的份数。 */
export function picturesPerRow(
  count: number,
  terminalColumns: number,
  maxColumns = MAX_COLUMNS,
): number {
  const total = Math.min(maxColumns, Math.max(1, terminalColumns - GUTTER))
  const capacity = Math.max(
    1,
    Math.floor((total + PICTURE_GAP) / (MIN_SLOT + PICTURE_GAP)),
  )
  return Math.min(count, capacity)
}

/** 从工具结果对象里递归收集内联 PNG（Anthropic、MCP、Read 三种形态）。 */
export function collectInlinePictures(output: unknown): Picture[] {
  const pictures: Picture[] = []
  visitForPictures(output, pictures, 0)
  return pictures
}

function visitForPictures(
  value: unknown,
  pictures: Picture[],
  depth: number,
): void {
  if (depth > 8 || value === null || typeof value !== 'object') return

  if (Array.isArray(value)) {
    for (const item of value) visitForPictures(item, pictures, depth + 1)
    return
  }

  const record = value as Record<string, unknown>
  if (record.type === 'image') {
    const source =
      record.source && typeof record.source === 'object'
        ? (record.source as Record<string, unknown>)
        : undefined
    // Read 工具把图片放在 file.base64 / file.type；MCP 在 data / mimeType；
    // Anthropic 内容块在 source.data / source.media_type。
    const file =
      record.file && typeof record.file === 'object'
        ? (record.file as Record<string, unknown>)
        : undefined
    const mediaType = String(
      record.mimeType ?? source?.media_type ?? file?.type ?? '',
    )
    const data =
      typeof record.data === 'string'
        ? record.data
        : source?.type === 'base64' && typeof source.data === 'string'
          ? source.data
          : typeof file?.base64 === 'string'
            ? file.base64
            : undefined

    if (data && (mediaType === '' || mediaType.toLowerCase().startsWith('image/png'))) {
      const size = pngBase64Size(data)
      if (size) {
        pictures.push({ source: { png: data }, size })
        return
      }
    }
  }

  for (const item of Object.values(record)) {
    visitForPictures(item, pictures, depth + 1)
  }
}

async function readAttachedPictures(
  $: EngineInterface,
  attachments: readonly Attachment[],
): Promise<Picture[]> {
  const pictures: Picture[] = []

  for (const attachment of attachments) {
    if (attachment.type !== 'image' || !attachment.id) continue
    if (
      attachment.mediaType &&
      !attachment.mediaType.toLowerCase().startsWith('image/png')
    ) {
      continue
    }

    const picture = await readAttachment($, attachment.id)
    if (picture) pictures.push(picture)
  }

  return pictures
}

async function readAttachment(
  $: EngineInterface,
  id: string,
): Promise<Picture | undefined> {
  let base64 = ''
  let offset: number | undefined

  for (let slice = 0; slice < MAX_MEDIA_SLICES; slice += 1) {
    const media = await $.prompt.media(offset === undefined ? { id } : { id, offset })
    // 最后一页之后可能被拒绝；已经读到的分片仍然有效。
    if (media.deny !== undefined) break
    if (media.unreadable !== undefined || !media.base64) return undefined

    base64 += media.base64
    if (base64.length > MAX_INLINE_BASE64) return undefined
    if (media.next === undefined) break
    offset = media.next
  }

  if (!base64) return undefined
  const size = pngBase64Size(base64)
  return size ? { source: { png: base64 }, size } : undefined
}

async function inTmux($: EngineInterface): Promise<boolean> {
  cachedTmux ??= Boolean(await $.env.get('TMUX'))
  return cachedTmux
}

async function pictureFromFile(
  $: EngineInterface,
  path: string,
): Promise<Picture | null> {
  let stat
  try {
    stat = await $.fs.stat(path, { resolve: true })
  } catch {
    return null
  }

  if (stat.kind !== 'file' || !stat.realPath) return null
  if (!/\.png$/iu.test(stat.realPath)) return null

  const cached = fileCache.get(stat.realPath)
  if (cached && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) {
    return cached.picture
  }

  let picture: Picture | null = null
  try {
    const { base64 } = await $.fs.read(stat.realPath, { as: 'bytes' })
    const size = pngBase64Size(base64)

    if (size) {
      if (base64.length <= MAX_INLINE_BASE64) {
        picture = { source: { png: base64 }, size }
      } else if (!(await inTmux($))) {
        // tmux 只转发内联字节，读不到文件本身；超过字节上限时跳过。
        picture = { source: { file: stat.realPath, format: 'png' }, size }
      }
    }
  } catch {
    picture = null
  }

  fileCache.set(stat.realPath, { mtimeMs: stat.mtimeMs, size: stat.size, picture })
  trimOldest(fileCache, MAX_FILE_CACHE)
  return picture
}

function withPictures(
  $: EngineInterface,
  e: TerminalRender,
  original: RenderNode,
  pictures: Picture[],
): RenderNode {
  const { Box, Image } = $.ui.resolve(e)
  const columns = e.viewport?.columns ?? 80
  const layouts = layoutPictures(
    pictures.map(picture => picture.size),
    columns,
    imageConfig.maxColumns,
    imageConfig.maxRows,
  )

  const images = pictures.map((picture, index) => (
    <Image
      key={`${PLUGIN}-${index}`}
      source={picture.source}
      columns={layouts[index].columns}
      rows={layouts[index].rows}
      alt=" "
    />
  ))

  const perRow = picturesPerRow(
    pictures.length,
    columns,
    imageConfig.maxColumns,
  )
  const rows: RenderNode[] = []
  for (let start = 0; start < images.length; start += perRow) {
    rows.push(
      <Box
        key={`${PLUGIN}-row-${start}`}
        flexDirection="row"
        gap={PICTURE_GAP}
      >
        {images.slice(start, start + perRow)}
      </Box>,
    )
  }

  return (
    <Box flexDirection="column">
      {original}
      {rows}
    </Box>
  )
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    resetImageSupport()
    cachedTmux = undefined
    fileCache.clear()
    attachedPictures.clear()
    lastImagePrompt = 'none'

    const loaded = await loadImageConfig($)
    imageConfig = loaded.config
    configPath = loaded.path

    await $.command.register({
      name: 'terminal-image',
      description: 'Show whether this terminal can render images',
    })

    return next(e)
  })

  on('command.run', { command: 'terminal-image' }, async $ => {
    const support = await imageSupport($, imageConfig.mode)
    return {
      text: `${PLUGIN}: ${support} · mode=${imageConfig.mode} · max ${imageConfig.maxColumns}x${imageConfig.maxRows} · last prompt: ${lastImagePrompt}`,
    }
  })

  on('fs.write', async ($, e, next) => {
    const result = await next(e)
    if (
      result.deny === undefined &&
      configPath &&
      normalizePath(e.path) === normalizePath(configPath)
    ) {
      const loaded = await loadImageConfig($)
      imageConfig = loaded.config
      configPath = loaded.path
      resetImageSupport()
      cachedTmux = undefined
      $.ui.invalidate('ui.render')
    }
    return result
  })

  on('prompt.submit', async ($, e, next) => {
    if (!imageConfig.enabled || !imageConfig.showUserImages) return next(e)

    const images = e.attachments?.filter(item => item.type === 'image') ?? []
    if (images.length === 0) {
      // 同文本的纯文字消息不该复用更早一次提交留下的图片。
      forgetPictures(e.text)
      return next(e)
    }

    try {
      const pictures = await readAttachedPictures($, images)
      lastImagePrompt = `${pictures.length}/${images.length} read`

      if (pictures.length > 0) {
        rememberPictures(e.text, pictures)
      } else {
        forgetPictures(e.text)
      }
    } catch {
      lastImagePrompt = 'read failed'
      // 读取附件失败不应阻断用户提交。
    }

    return next(e)
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'UserMessage' }, async ($, e, next) => {
    if (e.surface !== 'terminal' || e.props.origin.kind !== 'composer') return next(e)
    if (!imageConfig.enabled || !imageConfig.showUserImages) return next(e)

    const text = stripImagePlaceholders(e.props.text)
    // 提交文本与消息文本可能只有一方带占位，两种形态都查；占位本身保留显示。
    const pictures =
      attachedPictures.get(keyOf(e.props.text)) ?? attachedPictures.get(keyOf(text))
    if (
      !pictures?.length ||
      (await imageSupport($, imageConfig.mode)) === 'unsupported'
    ) {
      return next(e)
    }

    const original = await next(e)
    return withPictures($, e, original, pictures)
  })

  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    if (e.surface !== 'terminal' || e.props.isSummary) return next(e)
    if (!imageConfig.enabled || !imageConfig.showAssistantImages) return next(e)
    if (!e.props.text.includes('](')) return next(e)
    if ((await imageSupport($, imageConfig.mode)) === 'unsupported') return next(e)

    const paths = extractMarkdownImagePaths(e.props.text)
    if (paths.length === 0) return next(e)

    const found = await Promise.all(
      paths.map(path => pictureFromFile($, path).catch(() => null)),
    )
    const pictures = found.filter((picture): picture is Picture => picture !== null)
    if (pictures.length === 0) return next(e)

    const original = await next(e)
    return withPictures($, e, original, pictures)
  })

  // 独立行或展开组里的单次调用：ToolUse 带着结果，在这里挂图片。
  on('ui.render', { component: 'ToolUse' }, async ($, e, next) => {
    if (e.surface !== 'terminal' || e.props.isRunning || e.props.isErrored) return next(e)
    if (!imageConfig.enabled || !imageConfig.showToolImages) return next(e)
    if ((await imageSupport($, imageConfig.mode)) === 'unsupported') return next(e)

    const pictures = collectInlinePictures(e.props.output)
    if (pictures.length === 0) return next(e)

    const original = await next(e)
    return withPictures($, e, original, pictures)
  })

  // 折叠组只画一行，组内调用不各自渲染；在组下方直接显示其中的图片。
  // 展开时交给各自的 ToolUse 行，避免重复。
  on('ui.render', { component: 'ToolGroup' }, async ($, e, next) => {
    if (e.surface !== 'terminal' || e.props.isExpanded) return next(e)
    if (!imageConfig.enabled || !imageConfig.showToolImages) return next(e)
    if ((await imageSupport($, imageConfig.mode)) === 'unsupported') return next(e)

    const pictures: Picture[] = []
    for (const call of e.props.calls) {
      pictures.push(...collectInlinePictures(call.output))
    }
    if (pictures.length === 0) return next(e)

    const original = await next(e)
    return withPictures($, e, original, pictures)
  })
}
