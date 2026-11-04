import type { EngineInterface } from 'claude-code'

/**
 * terminal-image 的配置段，保存在统一配置文件的 `image` 字段中。
 *
 * `mode` 是终端能力策略：`auto` 按环境探测，`on` 总是交给宿主 `<Image>`
 * 尝试渲染，`off` 完全不渲染。
 */
export type ImageMode = 'auto' | 'on' | 'off'

export type ImageConfig = {
  enabled: boolean
  mode: ImageMode
  maxColumns: number
  maxRows: number
  showUserImages: boolean
  showAssistantImages: boolean
  showToolImages: boolean
}

export const DEFAULT_IMAGE_CONFIG: ImageConfig = {
  enabled: true,
  mode: 'auto',
  maxColumns: 48,
  maxRows: 16,
  showUserImages: true,
  showAssistantImages: true,
  showToolImages: true,
}

const CONFIG_FILE = '.config/my-cc-mods/config.json'

function clampDimension(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isInteger(value)
    ? Math.min(255, Math.max(1, value))
    : fallback
}

/** 只接受合法字段，损坏或缺失时回退默认值。 */
export function normalizeImageConfig(value: unknown): ImageConfig {
  const result = { ...DEFAULT_IMAGE_CONFIG }
  if (!value || typeof value !== 'object') return result

  const data = value as Record<string, unknown>
  if (typeof data.enabled === 'boolean') result.enabled = data.enabled
  if (data.mode === 'auto' || data.mode === 'on' || data.mode === 'off') {
    result.mode = data.mode
  }
  result.maxColumns = clampDimension(data.maxColumns, result.maxColumns)
  result.maxRows = clampDimension(data.maxRows, result.maxRows)
  if (typeof data.showUserImages === 'boolean') result.showUserImages = data.showUserImages
  if (typeof data.showAssistantImages === 'boolean') {
    result.showAssistantImages = data.showAssistantImages
  }
  if (typeof data.showToolImages === 'boolean') result.showToolImages = data.showToolImages

  return result
}

export type LoadedImageConfig = {
  config: ImageConfig
  path: string
}

/** 读取统一配置文件中的 `image` 段；文件或字段不可用时使用默认值。 */
export async function loadImageConfig($: EngineInterface): Promise<LoadedImageConfig> {
  const home = (await $.env.get('HOME')) ?? (await $.env.get('USERPROFILE'))
  if (!home) return { config: { ...DEFAULT_IMAGE_CONFIG }, path: '' }

  const path = `${home.replace(/[\\/]+$/u, '')}/${CONFIG_FILE}`
  try {
    const content = await $.fs.read(path)
    if (typeof content !== 'string') return { config: { ...DEFAULT_IMAGE_CONFIG }, path }

    const data = JSON.parse(content) as { image?: unknown }
    return { config: normalizeImageConfig(data.image), path }
  } catch {
    return { config: { ...DEFAULT_IMAGE_CONFIG }, path }
  }
}
