import type { EngineInterface, Register, RenderElement } from 'claude-code'
import type { TimestampConfig, ToolUsage } from '../types'

export const DEFAULT_CONFIG = {
  enabled: true,
  format: 'HH:mm:ss',
  tps: true,
} as const

const CONFIG_FILE = '.config/my-cc-mods/config.json'
const TIMESTAMP_COLOR = '#8791a0'
const ESTIMATE_COLOR = '#ffd700'
const STATUS_REDRAW_INTERVAL_MS = 500

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

// 每个 step 的 usage 记到该 step 产生的工具调用上；同一 step 的多个工具共享这组值。
const toolUsages = new Map<string, ToolUsage>()
// 工具调用发生在所属 step 完成之后，因此 step 结束时先暂存，tool.call 到达时再归属。
let lastStepUsage: ToolUsage | undefined
let stepStartedAt: number | undefined
let stepFirstTextAt: number | undefined
let stepOutputText = ''
let turnActive = false
// 每个 step 的耗时、用量与速度；渲染回答行时按消息 id（或文本回退）取用。
type StepSummary = {
  answer: string
  tps: number
  startedAt: number
  finishedAt: number
  durationMs: number
  inputTokens: number
  outputTokens: number
}
const messageSteps = new Map<string, StepSummary>()
const answerSteps = new Map<string, StepSummary>()
const pendingSteps: StepSummary[] = []
const waitingResponses: string[] = []
// 当前 step 的文本块（按 block index）与流式估算速度。
let stepBlocks = new Map<number, string>()
let liveTps: number | undefined
let liveStartedAt: number | undefined

export function normalizeConfig(value: unknown): TimestampConfig {
  if (!value || typeof value !== 'object') return { ...DEFAULT_CONFIG }
  const data = value as Record<string, unknown>
  return {
    enabled: typeof data.enabled === 'boolean' ? data.enabled : DEFAULT_CONFIG.enabled,
    format: typeof data.format === 'string' && data.format.length > 0 ? data.format : DEFAULT_CONFIG.format,
    tps: typeof data.tps === 'boolean' ? data.tps : DEFAULT_CONFIG.tps,
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

// 流式文本每个 chunk 都会到达，回答行的实时 TPS 按固定间隔重绘。
let lastStreamRefreshAt = 0

function refreshStreaming($: EngineInterface): void {
  const now = Date.now()
  if (now - lastStreamRefreshAt < STATUS_REDRAW_INTERVAL_MS) return
  lastStreamRefreshAt = now
  refresh($)
}

export function formatTokenCount(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1000) return `${(value / 1000).toFixed(1)}k`
  return String(value)
}

export function formatTps(value: number, isEstimate: boolean): string {
  return `${isEstimate ? '≈' : ''}${value.toFixed(1)} tok/s`
}

function estimateOutputTokens(text: string): number {
  let tokens = 0
  for (const character of text) {
    tokens += /[㐀-鿿\u{20000}-\u{2ffff}]/u.test(character) ? 1 : 0.25
  }
  return tokens
}

function resetStep(): void {
  stepStartedAt = undefined
  stepFirstTextAt = undefined
  stepOutputText = ''
  stepBlocks = new Map()
  liveTps = undefined
  liveStartedAt = undefined
}

// 回答行由引擎在 step 结束后追加，顺序与 step 一一对应；两侧谁先到都先排队。
function pairResponses(): void {
  while (pendingSteps.length > 0 && waitingResponses.length > 0) {
    const step = pendingSteps.shift()!
    messageSteps.set(waitingResponses.shift()!, step)
  }
}

function textBlocksOf(content: readonly unknown[]): string[] {
  return content
    .filter((block): block is { type: string; text: string } => (
      Boolean(block) && typeof block === 'object'
      && (block as { type?: unknown }).type === 'text'
      && typeof (block as { text?: unknown }).text === 'string'
    ))
    .map(block => block.text)
}

function withHeader(
  $: EngineInterface,
  e: any,
  header: RenderElement[],
  result: RenderElement,
  marginTop = 0,
): RenderElement {
  const { Box } = $.ui.resolve(e)
  return Box({ flexDirection: 'column', marginTop, children: [...header, result] })
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
    if (e.door === 'response' && !e.agentId) {
      if (textBlocksOf(e.message.content).length === 0) return next(e)
      waitingResponses.push(e.uuid)
      pairResponses()
    }
    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    if (!e.agentId) {
      turnActive = true
      liveTps = undefined
      lastStepUsage = undefined
      // 上一回合若被中断，未配对的暂存会错位，开新回合时丢弃。
      pendingSteps.length = 0
      waitingResponses.length = 0
    }
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (!e.agentId) {
      turnActive = false
      liveTps = undefined
    }
    return result
  })

  on('tool.call', async ($, e, next) => {
    if (!config.enabled) return next(e)
    const timing: ToolTiming = { startedAt: await $.clock.now() }
    toolTimings.set(e.tool_use_id, timing)
    // 工具由上一 step 的响应产生，沿用该 step 的 usage。
    if (turnActive && !e.agentId && lastStepUsage) toolUsages.set(e.tool_use_id, lastStepUsage)
    refresh($)
    try {
      return await next(e)
    } finally {
      timing.finishedAt = await $.clock.now()
      refresh($)
    }
  })

  on('turn.step', async function* ($, e, next) {
    if (e.agentId) {
      yield* next(e)
      return
    }
    stepStartedAt = await $.clock.now()
    stepFirstTextAt = undefined
    stepOutputText = ''
    stepBlocks = new Map()
    liveTps = undefined
    liveStartedAt = stepStartedAt

    const stream = next(e)
    while (true) {
      const step = await stream.next()
      if (step.done) {
        const result = step.value
        if (result.usage) {
          const startedAt = stepFirstTextAt ?? stepStartedAt
          const elapsedSeconds = startedAt === undefined ? 0 : ((await $.clock.now()) - startedAt) / 1000
          lastStepUsage = { input: result.usage.input_tokens, output: result.usage.output_tokens }
          if (result.answer && elapsedSeconds > 0) {
            const step: StepSummary = {
              answer: result.answer,
              tps: result.usage.output_tokens / elapsedSeconds,
              startedAt: startedAt ?? 0,
              finishedAt: await $.clock.now(),
              durationMs: elapsedSeconds * 1000,
              inputTokens: result.usage.input_tokens,
              outputTokens: result.usage.output_tokens,
            }
            answerSteps.set(step.answer, step)
            pendingSteps.push(step)
            if (pendingSteps.length > 200) pendingSteps.shift()
            pairResponses()
          }
        }
        resetStep()
        refresh($)
        return result
      }

      // 回答行实时显示估算速度：只按已到达文本计时，不把等待首 token 的时间算进去。
      if (step.value.kind === 'text') {
        const now = await $.clock.now()
        stepOutputText += step.value.text
        stepBlocks.set(step.value.index, (stepBlocks.get(step.value.index) ?? '') + step.value.text)
        if (stepFirstTextAt === undefined) stepFirstTextAt = now
        const elapsedSeconds = (now - stepFirstTextAt) / 1000
        const estimatedTokens = estimateOutputTokens(stepOutputText)
        if (elapsedSeconds > 0 && estimatedTokens > 0) {
          liveTps = estimatedTokens / elapsedSeconds
          refreshStreaming($)
        }
      }
      yield step.value
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

  // 每段回答上方显示该请求的开始/结束时间、耗时、Token 与 TPS；生成中先显示估算 TPS。
  // 只标注一条回复的首个文本块，避免多个块各带一行。
  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    const result = await next(e)
    if (!config.enabled || e.props.isSummary || !e.props.isFirstOfReply) return result
    const { Text } = $.ui.resolve(e)
    // 优先按消息 id；id 对不上时回退到回答文本。
    const step = messageSteps.get(e.requestId) ?? answerSteps.get(e.props.text)
    if (step) {
      const line = [
        formatTiming({ startedAt: step.startedAt, finishedAt: step.finishedAt }),
        `↑${formatTokenCount(step.inputTokens)} ↓${formatTokenCount(step.outputTokens)}`,
        ...(config.tps ? [`⚡ ${formatTps(step.tps, false)}`] : []),
      ].join(' · ')
      return withHeader($, e, [Text({ color: TIMESTAMP_COLOR, children: [line] })], result)
    }
    // 流式中的估算值：该块已到达的文本是当前 step 中某个文本块的前缀。
    if (liveTps !== undefined && liveStartedAt !== undefined) {
      const streamed = [...stepBlocks.values()].some(text => (
        text === e.props.text || text.startsWith(e.props.text) || e.props.text.startsWith(text)
      ))
      if (streamed) {
        const line = [
          formatTiming({ startedAt: liveStartedAt }),
          ...(config.tps ? [`⚡ ${formatTps(liveTps, true)}`] : []),
        ].join(' · ')
        return withHeader($, e, [Text({ color: ESTIMATE_COLOR, children: [line] })], result)
      }
    }
    return result
  })

  on('ui.render', { component: 'ToolUse' }, async ($, e, next) => {
    const result = await next(e)
    if (!config.enabled) return result
    const timing = toolTimings.get(e.props.tool_use_id)
    if (!timing) return result
    const usage = config.tps ? toolUsages.get(e.props.tool_use_id) : undefined
    const { Text } = $.ui.resolve(e)
    const line = usage
      ? `${formatToolTiming(timing)} · ↑${formatTokenCount(usage.input)} ↓${formatTokenCount(usage.output)}`
      : formatToolTiming(timing)
    return withHeader($, e, [Text({ color: TIMESTAMP_COLOR, children: [line] })], result, 1)
  })
}

/**
 * 开始、结束、耗时合并为工具块顶部的一行，避免相邻工具的结束/开始行被误读为同一组。
 */
export function formatToolTiming(timing: ToolTiming): string {
  return formatTiming(timing)
}

/**
 * 开始、结束与耗时合成一行；执行中只显示开始时间和 running。
 */
export function formatTiming(timing: ToolTiming): string {
  const start = displayTimestamp(timing.startedAt)
  if (timing.finishedAt === undefined) return `${start} → running`
  const seconds = ((timing.finishedAt - timing.startedAt) / 1000).toFixed(1)
  return `${start} → ${displayTimestamp(timing.finishedAt)} · ${seconds}s`
}
