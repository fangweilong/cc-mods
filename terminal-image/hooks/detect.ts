import type { EngineInterface } from 'claude-code'

import type { ImageConfig, ImageMode } from './config'

/**
 * 终端图片能力，由环境变量推断：
 *
 * - `supported`：已知支持 Kitty graphics 协议（Kitty、Ghostty、WezTerm）。
 * - `unsupported`：已知不支持该协议（VS Code 集成终端、Apple Terminal、
 *   Windows Terminal、`TERM=dumb`），默认用字符块降级；`blocks=off` 时不渲染。
 * - `unknown`：交给宿主 `<Image>` 元素自行探测并降级。
 *
 * tmux 会把图片交给外层终端处理，但还需要 `allow-passthrough` 等配置，
 * 环境变量无法确认，因此一律按 `unknown` 交给宿主判断。
 */
export type ImageSupport = 'supported' | 'unsupported' | 'unknown'

let cachedSupport: Promise<ImageSupport> | undefined
let cachedMode: ImageMode | undefined

/** 供热重载与测试重置缓存；同一会话内环境不会变化。 */
export function resetImageSupport(): void {
  cachedSupport = undefined
  cachedMode = undefined
}

/** `CC_TERMINAL_IMAGE` 的手动覆盖；读取很便宜，不跨 hook 缓存。 */
export async function imageEnvOverride($: EngineInterface): Promise<string> {
  return ((await $.env.get('CC_TERMINAL_IMAGE')) ?? '').trim().toLowerCase()
}

/** 字符块降级时用来合成透明像素的终端背景色，0xRRGGBB。 */
export async function blockBackground($: EngineInterface): Promise<number> {
  return parseColorFgBg(await $.env.get('COLORFGBG'))
}

const XTERM_BACKGROUND = [
  0x000000, 0x800000, 0x008000, 0x808000, 0x000080, 0x800080, 0x008080, 0xc0c0c0, 0x808080,
  0xff0000, 0x00ff00, 0xffff00, 0x0000ff, 0xff00ff, 0x00ffff, 0xffffff,
] as const

/** `COLORFGBG` 的最后一段是背景 ANSI 色号；缺失或超出 0–15 时按黑底。 */
export function parseColorFgBg(value: string | undefined): number {
  if (!value) return 0
  const fields = value.split(';')
  const index = Number.parseInt(fields[fields.length - 1] ?? '', 10)
  return Number.isInteger(index) && index >= 0 && index < XTERM_BACKGROUND.length
    ? XTERM_BACKGROUND[index]!
    : 0
}

/** 读取一次终端能力，会话内复用；配置中的模式变化时重新探测。 */
export function imageSupport($: EngineInterface, mode: ImageMode = 'auto'): Promise<ImageSupport> {
  if (cachedMode !== mode) {
    cachedSupport = undefined
    cachedMode = mode
  }
  cachedSupport ??= detectImageSupport($, mode)
  return cachedSupport
}

/** 根据配置模式和进程环境推断终端图片能力。 */
export async function detectImageSupport(
  $: EngineInterface,
  mode: ImageMode = 'auto',
): Promise<ImageSupport> {
  const override = await imageEnvOverride($)
  if (override === 'on' || override === 'force' || override === 'supported') return 'supported'
  if (override === 'off' || override === 'never' || override === 'unsupported') return 'unsupported'

  if (mode === 'on') return 'supported'
  if (mode === 'off') return 'unsupported'

  const program = (await $.env.get('TERM_PROGRAM'))?.toLowerCase() ?? ''
  const term = (await $.env.get('TERM'))?.toLowerCase() ?? ''

  if (await $.env.get('KITTY_WINDOW_ID')) return afterMultiplexer($, 'supported')
  if (await $.env.get('WEZTERM_PANE')) return afterMultiplexer($, 'supported')
  if (program === 'kitty' || program === 'ghostty' || program === 'wezterm') {
    return afterMultiplexer($, 'supported')
  }
  if (term === 'xterm-kitty' || term === 'xterm-ghostty' || term.startsWith('wezterm')) {
    return afterMultiplexer($, 'supported')
  }

  if (program === 'vscode' || program === 'apple_terminal') return 'unsupported'
  if (await $.env.get('WT_SESSION')) return 'unsupported'
  if (term === 'dumb') return 'unsupported'

  return 'unknown'
}

async function afterMultiplexer($: EngineInterface, support: ImageSupport): Promise<ImageSupport> {
  if (support === 'unsupported') return support
  return (await $.env.get('TMUX')) ? 'unknown' : support
}

/** 一张图片最终怎么画：宿主图形元素、字符块，或不画。 */
export type RenderKind = 'image' | 'blocks' | 'none'

/**
 * 解析渲染方式。优先级：开关/`mode=off` → `CC_TERMINAL_IMAGE=off` →
 * `blocks=on` → `blocks=off` → `mode=on` → `auto` 按探测结果。
 * `unknown` 保持交给宿主，避免把 iTerm2、tmux 透传等能出图的终端降级。
 */
export async function resolveRenderKind(
  $: EngineInterface,
  support: ImageSupport,
  config: ImageConfig,
): Promise<RenderKind> {
  if (!config.enabled || config.mode === 'off') return 'none'

  const override = await imageEnvOverride($)
  if (override === 'off' || override === 'never' || override === 'unsupported') return 'none'

  // dumb 终端不解析颜色，字符块只会显示成转义乱码。
  const colorCapable = ((await $.env.get('TERM')) ?? '').toLowerCase() !== 'dumb'
  if (config.blocks === 'on') return colorCapable ? 'blocks' : 'none'
  if (config.blocks === 'off') return support === 'unsupported' ? 'none' : 'image'
  if (config.mode === 'on') return 'image'
  if (override === 'on' || override === 'force' || override === 'supported') return 'image'

  if (support === 'unsupported') return colorCapable ? 'blocks' : 'none'
  return 'image'
}
