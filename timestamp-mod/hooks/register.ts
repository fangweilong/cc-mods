import type { EngineInterface, Register, RenderElement } from 'claude-code'
import type { TimestampConfig } from '../types'

export const DEFAULT_CONFIG = {
  enabled: true,
  format: 'HH:mm:ss',
} as const

const CONFIG_FILE = '.config/my-cc-mods/config.json'
const TIMESTAMP_COLOR = '#8791a0'

type ToolTiming = {
  startedAt: number
  finishedAt?: number
}

type PendingUserTimestamp = {
  text: string
  timestamp: number
}

let config: TimestampConfig = { ...DEFAULT_CONFIG }
let configPath = ''
const toolTimings = new Map<string, ToolTiming>()
const userTimestamps = new Map<string, number>()
const userTextTimestamps = new Map<string, number>()
const pendingUserTimestamps: PendingUserTimestamp[] = []

export function normalizeConfig(value: unknown): TimestampConfig {
  if (!value || typeof value !== 'object') return { ...DEFAULT_CONFIG }
  const data = value as Record<string, unknown>
  return {
    enabled: typeof data.enabled === 'boolean' ? data.enabled : DEFAULT_CONFIG.enabled,
    format: typeof data.format === 'string' && data.format.length > 0 ? data.format : DEFAULT_CONFIG.format,
  }
}

export function formatTimestamp(timestamp: number, format: string): string {
  const date = new Date(timestamp)
  const tokens: Record<string, string> = {
    YYYY: String(date.getFullYear()).padStart(4, '0'),
    YY: String(date.getFullYear()).slice(-2),
    MM: String(date.getMonth() + 1).padStart(2, '0'),
    DD: String(date.getDate()).padStart(2, '0'),
    HH: String(date.getHours()).padStart(2, '0'),
    mm: String(date.getMinutes()).padStart(2, '0'),
    ss: String(date.getSeconds()).padStart(2, '0'),
    SSS: String(date.getMilliseconds()).padStart(3, '0'),
  }
  return format.replace(/YYYY|SSS|YY|MM|DD|HH|mm|ss/gu, token => tokens[token] ?? token)
}

function displayTimestamp(timestamp: number): string {
  return `[${formatTimestamp(timestamp, config.format)}]`
}

function joinPath(base: string, child: string): string {
  return `${base.replace(/[\\/]+$/u, '')}/${child}`
}

function textFromMessage(message: unknown): string {
  if (!message || typeof message !== 'object') return ''
  const content = (message as { content?: unknown }).content
  if (!Array.isArray(content)) return ''
  return content
    .filter((block): block is { type: string; text: string } => Boolean(block) && typeof block === 'object' && (block as { type?: unknown }).type === 'text' && typeof (block as { text?: unknown }).text === 'string')
    .map(block => block.text)
    .join('')
}

function takePendingUserTimestamp(text: string): number | undefined {
  const index = pendingUserTimestamps.findIndex(item => item.text === text)
  if (index < 0) return undefined
  const [item] = pendingUserTimestamps.splice(index, 1)
  return item?.timestamp
}

async function loadConfig($: EngineInterface): Promise<void> {
  const home = (await $.env.get('HOME')) ?? (await $.env.get('USERPROFILE'))
  if (!home) return
  configPath = joinPath(home, CONFIG_FILE)
  try {
    const content = await $.fs.read(configPath)
    if (typeof content !== 'string') return
    const data = JSON.parse(content) as { timestamp?: unknown }
    config = normalizeConfig(data.timestamp)
  } catch {
    config = { ...DEFAULT_CONFIG }
  }
}

function refresh($: EngineInterface): void {
  $.ui.invalidate('ui.render')
}

function withTimestamp($: EngineInterface, e: any, timestamp: number, result: RenderElement): RenderElement {
  const { Box, Text } = $.ui.resolve(e)
  return Box({
    flexDirection: 'column',
    children: [Text({ color: TIMESTAMP_COLOR, children: [displayTimestamp(timestamp)] }), result],
  })
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    // 旧版本曾用 $.ui.status 显示 LLM 时间；热重载后清掉残留的状态行。
    $.ui.status(undefined)
    await loadConfig($)
    return next(e)
  })

  on('fs.write', async ($, e, next) => {
    const result = await next(e)
    if (result.deny === undefined && configPath && e.path.replace(/\\/gu, '/') === configPath.replace(/\\/gu, '/')) {
      await loadConfig($)
      refresh($)
    }
    return result
  })

  on('prompt.submit', async ($, e, next) => {
    let timestamp: number | undefined
    if (config.enabled && e.origin.kind === 'composer') {
      timestamp = await $.clock.now()
      pendingUserTimestamps.push({ text: e.text, timestamp })
      userTextTimestamps.set(e.text, timestamp)
    }
    const result = await next(e)
    if (timestamp !== undefined && result.drop !== undefined) {
      const index = pendingUserTimestamps.findIndex(item => item.timestamp === timestamp)
      if (index >= 0) pendingUserTimestamps.splice(index, 1)
    }
    return result
  })

  on('session.append', ($, e, next) => {
    if (config.enabled && e.door === 'prompt' && e.origin.kind === 'composer') {
      const text = textFromMessage(e.message)
      const timestamp = takePendingUserTimestamp(text)
      if (timestamp !== undefined) userTimestamps.set(e.uuid, timestamp)
    }
    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    if (!config.enabled) return next(e)
    const timing: ToolTiming = { startedAt: await $.clock.now() }
    toolTimings.set(e.tool_use_id, timing)
    refresh($)
    try {
      return await next(e)
    } finally {
      timing.finishedAt = await $.clock.now()
      refresh($)
    }
  })

  on('ui.render', { component: 'UserMessage' }, async ($, e, next) => {
    const result = await next(e)
    if (!config.enabled || e.props.origin.kind !== 'composer') return result
    const timestamp = userTimestamps.get(e.requestId) ?? userTextTimestamps.get(e.props.text)
    if (timestamp === undefined) return result
    return withTimestamp($, e, timestamp, result)
  })

  on('ui.render', { component: 'ToolGroup' }, async ($, e, next) => {
    if (!config.enabled || e.props.isExpanded) return next(e)
    return next({ ...e, props: { ...e.props, isExpanded: true } })
  })

  on('ui.render', { component: 'ToolUse' }, async ($, e, next) => {
    const result = await next(e)
    if (!config.enabled) return result
    const timing = toolTimings.get(e.props.tool_use_id)
    if (!timing) return result
    const { Box, Text } = $.ui.resolve(e)
    return Box({
      flexDirection: 'column',
      marginTop: 1,
      children: [
        Text({ color: TIMESTAMP_COLOR, children: [formatToolTiming(timing)] }),
        result,
      ],
    })
  })
}

/**
 * 开始、结束、耗时合并为工具块顶部的一行，避免相邻工具的结束/开始行被误读为同一组。
 */
export function formatToolTiming(timing: ToolTiming): string {
  const start = displayTimestamp(timing.startedAt)
  if (timing.finishedAt === undefined) return `${start} → running`
  const seconds = ((timing.finishedAt - timing.startedAt) / 1000).toFixed(1)
  return `${start} → ${displayTimestamp(timing.finishedAt)} · ${seconds}s`
}
