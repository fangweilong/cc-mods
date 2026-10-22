import type { EngineInterface, Register } from 'claude-code'

export type ToolOutputMode = 'off' | 'fold' | 'flat'

export type ToolOutputConfig = {
  mode: ToolOutputMode
  foldAfterLines: number
  keepErrorsExpanded: boolean
}

export const DEFAULT_TOOL_OUTPUT_CONFIG: ToolOutputConfig = {
  mode: 'fold',
  foldAfterLines: 12,
  keepErrorsExpanded: true,
}

const MAX_EXPANDED = 500
const MAX_PREVIEW = 120

const expanded = new Set<string>()
let config: ToolOutputConfig = { ...DEFAULT_TOOL_OUTPUT_CONFIG }
let configPath = ''

type OutputSummary = {
  text: string
  lines: number
  chars: number
  preview: string
}

function cleanText(value: string): string {
  return value
    .replace(/\u001b\[[0-?]*[ -/]*[@-~]/gu, '')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/gu, '')
    .trim()
}

function clipText(value: string, maxLength: number): string {
  const text = cleanText(value)
  return text.length > maxLength ? `${text.slice(0, maxLength - 3)}...` : text
}

function outputText(output: unknown): string {
  if (typeof output === 'string') return output
  if (output && typeof output === 'object') {
    const record = output as Record<string, unknown>
    const parts = ['stdout', 'stderr', 'text', 'content', 'output', 'result']
      .map(key => record[key])
      .filter((value): value is string => typeof value === 'string' && value.length > 0)
    if (parts.length > 0) return parts.join('\n')
    try {
      return JSON.stringify(output)
    } catch {
      return String(output)
    }
  }
  return String(output ?? '')
}

export function summarizeOutput(output: unknown): OutputSummary {
  const text = cleanText(outputText(output))
  const lines = text.length === 0 ? 0 : text.split('\n').length
  return {
    text,
    lines,
    chars: text.length,
    preview: clipText(text.replace(/\s+/gu, ' '), MAX_PREVIEW),
  }
}

export function shouldFold(output: unknown, value: ToolOutputConfig = config): boolean {
  const summary = summarizeOutput(output)
  return summary.lines > value.foldAfterLines || summary.chars > 2000
}

export function formatOutputSize(chars: number): string {
  if (chars < 1024) return `${chars} B`
  if (chars < 1024 * 1024) return `${(chars / 1024).toFixed(1)} KB`
  return `${(chars / (1024 * 1024)).toFixed(1)} MB`
}

export function normalizeToolOutputConfig(value: unknown): ToolOutputConfig {
  const result = { ...DEFAULT_TOOL_OUTPUT_CONFIG }
  if (!value || typeof value !== 'object') return result

  const root = value as Record<string, unknown>
  const data = (root.toolOutput && typeof root.toolOutput === 'object'
    ? root.toolOutput
    : root) as Record<string, unknown>

  if (data.mode === 'off' || data.mode === 'fold' || data.mode === 'flat') {
    result.mode = data.mode
  }
  if (typeof data.foldAfterLines === 'number' && Number.isFinite(data.foldAfterLines)) {
    result.foldAfterLines = Math.min(200, Math.max(1, Math.round(data.foldAfterLines)))
  }
  if (typeof data.keepErrorsExpanded === 'boolean') {
    result.keepErrorsExpanded = data.keepErrorsExpanded
  }
  return result
}

function normalizePath(path: string): string {
  const normalized = path.replace(/[\\/]+/gu, '/').replace(/\/$/u, '')
  return /^[A-Za-z]:/u.test(normalized) ? normalized.toLowerCase() : normalized
}

async function homeDirectory($: EngineInterface): Promise<string> {
  return (await $.env.get('HOME')) ?? (await $.env.get('USERPROFILE')) ?? ''
}

async function loadConfig($: EngineInterface): Promise<void> {
  const home = await homeDirectory($)
  configPath = home ? `${home.replace(/[\\/]+$/u, '')}/.config/my-cc-mods/config.json` : ''
  config = { ...DEFAULT_TOOL_OUTPUT_CONFIG }
  if (!configPath) return
  try {
    const content = await $.fs.read(configPath)
    if (typeof content === 'string') config = normalizeToolOutputConfig(JSON.parse(content))
  } catch {
    config = { ...DEFAULT_TOOL_OUTPUT_CONFIG }
  }
}

function rememberExpanded(id: string): void {
  expanded.add(id)
  while (expanded.size > MAX_EXPANDED) {
    const oldest = expanded.values().next().value
    if (oldest === undefined) break
    expanded.delete(oldest)
  }
}

function invalidate($: EngineInterface): void {
  $.ui.invalidate('ui.render')
}

function foldedTree($: EngineInterface, e: any, tool: string, summary: OutputSummary): any {
  const { Box, Text, Button } = $.ui.resolve(e)
  return Box({
    key: `tool-output-folded-${e.requestId}`,
    flexDirection: 'column',
    children: [
      Button({
        key: `tool-output-expand-${e.requestId}`,
        plain: true,
        onPress: () => {
          rememberExpanded(e.requestId)
          invalidate($)
        },
        children: [
          Text({
            color: 'gray',
            children: [`▸ ${tool} · ${summary.lines} 行 · ${formatOutputSize(summary.chars)} · 点击展开`],
          }),
          ...(summary.preview
            ? [Text({ color: 'gray', dimColor: true, wrap: 'truncate-end', children: [summary.preview] })]
            : []),
        ],
      }),
    ],
  })
}

function expandedTree($: EngineInterface, e: any, tool: string, native: any): any {
  const { Box, Button } = $.ui.resolve(e)
  return Box({
    key: `tool-output-expanded-${e.requestId}`,
    flexDirection: 'column',
    children: [
      Button({
        key: `tool-output-collapse-${e.requestId}`,
        plain: true,
        label: `▾ ${tool} · 收起`,
        onPress: () => {
          expanded.delete(e.requestId)
          invalidate($)
        },
      }),
      native,
    ],
  })
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    expanded.clear()
    await loadConfig($)
    return next(e)
  })

  on('fs.write', async ($, e, next) => {
    if (configPath && normalizePath(e.path) === normalizePath(configPath)) {
      await loadConfig($)
      invalidate($)
    }
    return next(e)
  })

  on('ui.render', { component: 'ToolGroup' }, async ($, e, next) => {
    if (config.mode !== 'flat' || e.props.isExpanded) return next(e)
    return next({ ...e, props: { ...e.props, isExpanded: true } })
  })

  on('ui.render', { component: 'ToolResult' }, async ($, e, next) => {
    const props = e.props as { tool: string; output: unknown; isErrored: boolean; isExpanded?: boolean }
    if (config.mode !== 'fold') return next(e)
    if (props.isExpanded) return next(e)
    if (props.isErrored && config.keepErrorsExpanded) return next(e)
    if (expanded.has(e.requestId)) {
      return expandedTree($, e, props.tool, await next(e))
    }
    if (!shouldFold(props.output)) return next(e)
    return foldedTree($, e, props.tool, summarizeOutput(props.output))
  })
}
