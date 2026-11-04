import type { EngineInterface } from 'claude-code'

import type { ImageMode } from './config'

/**
 * 终端图片能力，由环境变量推断：
 *
 * - `supported`：已知支持 Kitty graphics 协议（Kitty、Ghostty、WezTerm）。
 * - `unsupported`：已知不支持该协议（VS Code 集成终端、Apple Terminal、
 *   Windows Terminal、`TERM=dumb`），Mod 直接不渲染图片。
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
  const override = (await $.env.get('CC_TERMINAL_IMAGE'))?.trim().toLowerCase()
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
