import type {
  AgentInfo,
  EngineInterface,
  Register,
  SessionUsage,
  TurnUsage,
} from 'claude-code'
import type { StatuslineConfig, StatuslineModule } from '../types'

const RESET = '\u001b[0m'
const BOLD = '\u001b[1m'
const GRAY = '\u001b[38;2;135;145;160m'
const CYAN = '\u001b[38;2;80;200;255m'
const BLUE = '\u001b[38;2;100;160;255m'
const PURPLE = '\u001b[38;2;190;120;255m'
const GREEN = '\u001b[38;2;80;220;140m'
const YELLOW = '\u001b[38;2;255;215;0m'
const RED = '\u001b[38;2;255;90;100m'

const UI_COLORS = {
  cyan: '#50c8ff',
  blue: '#64a0ff',
  purple: '#be78ff',
  green: '#50dc8c',
  yellow: '#ffd700',
  red: '#ff5a64',
  gray: '#8791a0',
} as const

export type UiSegment = {
  text: string
  color?: string
  bold?: boolean
}

const DEFAULT_ORDER = [
  'model',
  'state',
  'env',
  'git',
  'git_stat',
  'context',
  'tokens',
  'cache',
  'quota',
  'cost',
  'cwd',
] as const

export type ModuleId = StatuslineModule
export type Language = 'en' | 'zh'

export type StatusConfig = StatuslineConfig

type RateLimit = {
  kind: string
  percentUsed: number
  resetsAt?: string
}

type AgentDetail = {
  model?: string
  contextPercent?: number
  inputTokens: number
  outputTokens: number
}

export type SubagentSnapshot = AgentInfo & AgentDetail

export type StatusSnapshot = {
  model: string
  state: string
  cwd: string
  home: string
  env?: string
  contextPercent?: number
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  costUsd?: number
  rateLimits: readonly RateLimit[]
  gitBranch?: string
  gitDirty: boolean
  gitInsertions: number
  gitDeletions: number
  activeTool?: string
  subagents: readonly SubagentSnapshot[]
}

export const DEFAULT_CONFIG: StatusConfig = {
  language: 'en',
  order: [...DEFAULT_ORDER],
  modules: {
    model: true,
    state: true,
    env: true,
    git: true,
    git_stat: true,
    context: true,
    tokens: true,
    cache: true,
    quota: true,
    cost: true,
    cwd: true,
  },
  promptFrame: {
    title: '用户输入',
    color: 'cyan',
    horizontal: '─',
    vertical: '│',
    topLeft: '┌',
    topRight: '┐',
    bottomLeft: '└',
    bottomRight: '┘',
  },
}

const I18N = {
  en: { idle: 'Idle', running: 'Running', thinking: 'Thinking', ctx: 'ctx', cache: 'cache' },
  zh: { idle: '就绪', running: '运行中', thinking: '思考中', ctx: '上下文', cache: '缓存' },
} as const

const STATUS_TEXT = {
  en: {
    completed: 'done',
    done: 'done',
    running: 'running',
    working: 'running',
    in_progress: 'running',
    pending: 'pending',
    failed: 'failed',
    error: 'error',
    idle: 'idle',
  },
  zh: {
    completed: '已完成',
    done: '已完成',
    running: '运行中',
    working: '运行中',
    in_progress: '进行中',
    pending: '等待中',
    failed: '失败',
    error: '错误',
    idle: '空闲',
  },
} as const

const STATUS_COLORS: Record<string, string> = {
  completed: GREEN,
  done: GREEN,
  running: CYAN,
  working: CYAN,
  in_progress: CYAN,
  pending: GRAY,
  failed: RED,
  error: RED,
  idle: GRAY,
}

const FINISHED_AGENT_STATUSES = new Set([
  'completed',
  'done',
  'finished',
  'success',
  'failed',
  'error',
  'errored',
  'cancelled',
  'canceled',
  'killed',
  'terminated',
])

let config: StatusConfig = cloneConfig(DEFAULT_CONFIG)
let activeTurn = false
let configPath = ''
const agentDetails = new Map<string, AgentDetail>()

let snapshot: StatusSnapshot = {
  model: 'Agent',
  state: 'Idle',
  cwd: '',
  home: '',
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  rateLimits: [],
  gitDirty: false,
  gitInsertions: 0,
  gitDeletions: 0,
  subagents: [],
}

function cloneConfig(value: StatusConfig): StatusConfig {
  return {
    language: value.language,
    order: [...value.order],
    modules: { ...value.modules },
    promptFrame: { ...value.promptFrame },
  }
}

export function normalizeConfig(value: unknown): StatusConfig {
  const result = cloneConfig(DEFAULT_CONFIG)
  if (!value || typeof value !== 'object') return result

  const data = value as {
    language?: unknown
    order?: unknown
    modules?: unknown
    promptFrame?: unknown
  }

  if (data.language === 'en' || data.language === 'zh') {
    result.language = data.language
  }

  if (Array.isArray(data.order) && data.order.length > 0) {
    const requested = data.order.filter(
      (item): item is ModuleId => typeof item === 'string' && DEFAULT_ORDER.includes(item as ModuleId),
    )
    for (const item of DEFAULT_ORDER) {
      if (requested.includes(item)) continue
      const defaultIndex = DEFAULT_ORDER.indexOf(item)
      let insertAt = requested.length
      for (const previous of DEFAULT_ORDER.slice(0, defaultIndex).reverse()) {
        const previousIndex = requested.indexOf(previous)
        if (previousIndex >= 0) {
          insertAt = previousIndex + 1
          break
        }
      }
      requested.splice(insertAt, 0, item)
    }
    result.order = requested
  }

  if (data.modules && typeof data.modules === 'object') {
    const modules = data.modules as Record<string, unknown>
    for (const item of DEFAULT_ORDER) {
      if (item in modules) result.modules[item] = Boolean(modules[item])
    }
  }

  if (data.promptFrame && typeof data.promptFrame === 'object') {
    const frame = data.promptFrame as Record<string, unknown>
    const fields = ['title', 'color', 'horizontal', 'vertical', 'topLeft', 'topRight', 'bottomLeft', 'bottomRight'] as const
    for (const field of fields) {
      if (typeof frame[field] === 'string' && frame[field].length > 0) {
        result.promptFrame[field] = frame[field]
      }
    }
  }

  return result
}

export function formatTokenCount(value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value) || value < 0) return '?'
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`
  return String(Math.trunc(value))
}

function contextColor(percent: number): string {
  if (percent >= 85) return RED
  if (percent >= 65) return YELLOW
  return GREEN
}

function shortPath(path: string, home: string): string {
  if (!path) return ''

  let value = path
  const normalizedHome = home.replaceAll('\\', '/')
  const normalizedPath = value.replaceAll('\\', '/')
  if (normalizedHome && normalizedPath.toLowerCase() === normalizedHome.toLowerCase()) return '~'
  if (normalizedHome && normalizedPath.toLowerCase().startsWith(`${normalizedHome.toLowerCase()}/`)) {
    value = `~${normalizedPath.slice(normalizedHome.length)}`
  } else {
    value = normalizedPath
  }

  const parts = value.split('/').filter(Boolean)
  return parts.length > 4 ? `…/${parts.slice(-3).join('/')}` : value
}

function trimText(value: string, maxLength: number): string {
  const text = value.replace(/\r?\n/gu, ' ').trim()
  return text.length > maxLength ? `${text.slice(0, maxLength - 3)}...` : text
}

function formatState(value: string, language: Language): string {
  const key = value.toLowerCase()
  const text = key === 'idle' || key === 'ready'
    ? I18N[language].idle
    : key === 'thinking'
      ? I18N[language].thinking
      : key === 'running' || key === 'working' || key === 'busy' || key === 'streaming' || key === 'tool_use'
        ? I18N[language].running
        : value || I18N[language].idle
  const color = key === 'auth' ? YELLOW : key === 'idle' || key === 'ready' ? GRAY : CYAN
  return `${color}${text}${RESET}`
}

function formatResetDuration(seconds: number | undefined): string {
  if (seconds === undefined || seconds <= 0) return ''
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  if (days > 0) return hours > 0 ? `${days}d ${hours}h` : `${days}d`
  if (hours > 0) return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`
  if (minutes > 0) return `${minutes}m`
  return `${seconds}s`
}

function normalizeBucketLabel(kind: string, resetSeconds?: number): string {
  const key = kind.toLowerCase().replaceAll('-', '_').replaceAll(' ', '_')
  if (key.includes('5h') || key.includes('five_hour') || key.includes('5_hour') || key.includes('5hour')) return '5h'
  if (key.includes('7d') || key.includes('seven_day') || key.includes('7_day') || key.includes('7day') || key.includes('week')) return '7d'
  if (key.includes('1m') || key.includes('month') || key.includes('30d') || key.includes('monthly')) return '1m'
  if (key.includes('1d') || key.includes('daily') || key.includes('day')) return '1d'
  if (resetSeconds !== undefined) {
    if (resetSeconds <= 21600) return '5h'
    if (resetSeconds <= 90000) return '1d'
    if (resetSeconds <= 691200) return '7d'
    return '1m'
  }
  return kind || 'quota'
}

function remainingColor(percent: number): string {
  if (percent >= 50) return GREEN
  if (percent >= 20) return YELLOW
  return RED
}

function resetSeconds(resetsAt: string | undefined): number | undefined {
  if (!resetsAt) return undefined
  const timestamp = Date.parse(resetsAt)
  if (!Number.isFinite(timestamp)) return undefined
  return Math.max(0, Math.trunc((timestamp - Date.now()) / 1000))
}

type QuotaValue = {
  label: string
  remaining: number
  reset: string
}

function quotaValues(rateLimits: readonly RateLimit[]): QuotaValue[] {
  const order: Record<string, number> = { '5h': 1, '1d': 2, '7d': 3, '1m': 4 }
  const buckets = new Map<string, QuotaValue>()

  for (const limit of rateLimits) {
    const seconds = resetSeconds(limit.resetsAt)
    const label = normalizeBucketLabel(limit.kind, seconds)
    const remaining = Math.max(0, Math.min(100, 100 - limit.percentUsed))
    const current = buckets.get(label)
    if (!current || remaining < current.remaining) {
      buckets.set(label, { label, remaining, reset: formatResetDuration(seconds) })
    }
  }

  return [...buckets.values()].sort((left, right) => (order[left.label] ?? 99) - (order[right.label] ?? 99))
}

function formatQuota(rateLimits: readonly RateLimit[]): string[] {
  return quotaValues(rateLimits).map(value => {
    const reset = value.reset ? ` · ${value.reset}` : ''
    return `${remainingColor(value.remaining)}${value.label} ${value.remaining.toFixed(0)}%${reset}${RESET}`
  })
}

export function formatSubagentLine(agent: SubagentSnapshot, language: Language): string {
  const model = agent.model ?? 'Claude'
  const name = agent.name ?? agent.type ?? agent.description ?? 'agent'
  const statusKey = agent.status.toLowerCase()
  const status = STATUS_TEXT[language][statusKey as keyof typeof STATUS_TEXT.en] ?? agent.status
  const statusColor = STATUS_COLORS[statusKey] ?? GRAY
  const pieces = [
    `${CYAN}↳ ${model}${RESET}`,
    `${GREEN}${name}${RESET}`,
    `${statusColor}${status}${RESET}`,
  ]

  if (agent.contextPercent !== undefined) {
    pieces.push(`${I18N[language].ctx} ${contextColor(agent.contextPercent)}${contextRing(agent.contextPercent)} ${contextColor(agent.contextPercent)}${agent.contextPercent.toFixed(0)}%${RESET}`)
  }

  if (agent.outputTokens > 0 || agent.inputTokens > 0) {
    pieces.push(`${BLUE}↑${formatTokenCount(agent.inputTokens)} ↓${formatTokenCount(agent.outputTokens)}${RESET}`)
  }

  const content = trimText(agent.description, 70)
  if (content) pieces.push(`${GRAY}${content}${RESET}`)
  return pieces.join(' │ ')
}

type UiState = { text: string; color: string }

function uiState(value: string, language: Language): UiState {
  const key = value.toLowerCase()
  if (key === 'idle' || key === 'ready') return { text: I18N[language].idle, color: UI_COLORS.gray }
  if (key === 'thinking') return { text: I18N[language].thinking, color: UI_COLORS.cyan }
  if (key === 'auth') return { text: value, color: UI_COLORS.yellow }
  if (key === 'running' || key === 'working' || key === 'busy' || key === 'streaming' || key === 'tool_use') {
    return { text: I18N[language].running, color: UI_COLORS.cyan }
  }
  return { text: value || I18N[language].idle, color: UI_COLORS.cyan }
}

function contextRing(percent: number): string {
  const value = Math.max(0, Math.min(100, Number.isFinite(percent) ? percent : 0))
  if (value < 10) return '◯'
  if (value < 35) return '◔'
  if (value < 60) return '◑'
  if (value < 85) return '◕'
  return '●'
}

function uiQuotaSegments(rateLimits: readonly RateLimit[]): UiSegment[] {
  const segments: UiSegment[] = []
  for (const [index, value] of quotaValues(rateLimits).entries()) {
    if (index > 0) segments.push({ text: ' │ ', color: UI_COLORS.gray })
    const reset = value.reset ? ` · ${value.reset}` : ''
    const color = value.remaining >= 50 ? UI_COLORS.green : value.remaining >= 20 ? UI_COLORS.yellow : UI_COLORS.red
    segments.push({ text: `${value.label} ${value.remaining.toFixed(0)}%${reset}`, color })
  }
  return segments
}

function uiSubagentSegments(agent: SubagentSnapshot, language: Language): UiSegment[] {
  const statusKey = agent.status.toLowerCase()
  const statusText = STATUS_TEXT[language][statusKey as keyof typeof STATUS_TEXT.en] ?? agent.status
  const statusColor = STATUS_COLORS[statusKey] === GREEN
    ? UI_COLORS.green
    : STATUS_COLORS[statusKey] === CYAN
      ? UI_COLORS.cyan
      : STATUS_COLORS[statusKey] === RED
        ? UI_COLORS.red
        : UI_COLORS.gray
  const segments: UiSegment[] = [
    { text: `↳ ${agent.model ?? 'Claude'}`, color: UI_COLORS.cyan },
    { text: agent.name ?? agent.type ?? agent.description ?? 'agent', color: UI_COLORS.green },
    { text: statusText, color: statusColor },
  ]

  if (agent.contextPercent !== undefined) {
    segments.push({
      text: `${I18N[language].ctx} ${contextRing(agent.contextPercent)} ${agent.contextPercent.toFixed(0)}%`,
      color: agent.contextPercent >= 85 ? UI_COLORS.red : agent.contextPercent >= 65 ? UI_COLORS.yellow : UI_COLORS.green,
    })
  }
  if (agent.outputTokens > 0 || agent.inputTokens > 0) {
    segments.push({ text: `↑${formatTokenCount(agent.inputTokens)} ↓${formatTokenCount(agent.outputTokens)}`, color: UI_COLORS.blue })
  }
  const content = trimText(agent.description, 70)
  if (content) segments.push({ text: content, color: UI_COLORS.gray })
  return segments
}

export function uiStatusRows(value: StatusSnapshot, currentConfig: StatusConfig): UiSegment[][] {
  const language = currentConfig.language
  const state = uiState(value.state, language)
  const contextPercent = value.contextPercent ?? 0
  const contextColorValue = contextPercent >= 85 ? UI_COLORS.red : contextPercent >= 65 ? UI_COLORS.yellow : UI_COLORS.green
  const moduleParts: Partial<Record<ModuleId, UiSegment[]>> = {
    model: [{ text: value.model || 'Agent', color: UI_COLORS.cyan, bold: true }],
    state: [{ text: state.text, color: state.color }],
    env: value.env ? [{ text: value.env, color: UI_COLORS.purple }] : undefined,
    git: value.gitBranch ? [{ text: `${value.gitBranch} ${value.gitDirty ? '●' : '✓'}`, color: value.gitDirty ? UI_COLORS.yellow : UI_COLORS.green }] : undefined,
    git_stat: value.gitInsertions > 0 || value.gitDeletions > 0
      ? [{ text: value.gitInsertions > 0 ? `+${value.gitInsertions}` : '', color: UI_COLORS.green }, { text: value.gitInsertions > 0 && value.gitDeletions > 0 ? ' ' : '' }, { text: value.gitDeletions > 0 ? `-${value.gitDeletions}` : '', color: UI_COLORS.red }]
      : undefined,
    context: [{ text: `${I18N[language].ctx} ${contextRing(contextPercent)} ${contextPercent.toFixed(0)}%`, color: contextColorValue }],
    tokens: [{ text: `↑${formatTokenCount(value.inputTokens)} ↓${formatTokenCount(value.outputTokens)}${activeTurn ? '…' : ''}`, color: UI_COLORS.blue }],
    cache: value.cacheReadTokens > 0
      ? (() => {
          const promptTokens = Math.max(value.inputTokens, value.inputTokens + value.cacheReadTokens, value.cacheReadTokens)
          const percent = promptTokens > 0 ? Math.round((value.cacheReadTokens / promptTokens) * 100) : 0
          return [{ text: `⚡${I18N[language].cache} ${percent}% (${formatTokenCount(value.cacheReadTokens)})`, color: UI_COLORS.cyan }]
        })()
      : undefined,
    quota: uiQuotaSegments(value.rateLimits),
    cost: value.costUsd !== undefined && Number.isFinite(value.costUsd) ? [{ text: `$${value.costUsd.toFixed(2)}`, color: UI_COLORS.green }] : undefined,
    cwd: value.cwd ? [{ text: shortPath(value.cwd, value.home), color: UI_COLORS.gray }] : undefined,
  }

  const main: UiSegment[] = []
  for (const item of currentConfig.order) {
    const segments = currentConfig.modules[item] ? moduleParts[item] : undefined
    if (!segments || segments.length === 0) continue
    if (main.length > 0) main.push({ text: ' │ ', color: UI_COLORS.gray })
    main.push(...segments)
  }

  const rows = [main]
  rows.push(
    ...value.subagents
      .filter(agent => !FINISHED_AGENT_STATUSES.has(agent.status.toLowerCase()))
      .slice(0, 3)
      .map(agent => uiSubagentSegments(agent, language)),
  )
  return rows
}

export function formatStatusLine(value: StatusSnapshot, currentConfig = DEFAULT_CONFIG): string {
  const language = currentConfig.language
  const parts: Partial<Record<ModuleId, string>> = {
    model: `${BOLD}${CYAN}${value.model || 'Agent'}${RESET}`,
    state: formatState(value.state, language),
    env: value.env ? `${PURPLE}${value.env}${RESET}` : undefined,
    git: value.gitBranch
      ? `${value.gitDirty ? YELLOW : GREEN}${value.gitBranch} ${value.gitDirty ? '●' : '✓'}${RESET}`
      : undefined,
    git_stat: value.gitInsertions > 0 || value.gitDeletions > 0
      ? [
          value.gitInsertions > 0 ? `${GREEN}+${value.gitInsertions}${RESET}` : '',
          value.gitDeletions > 0 ? `${RED}-${value.gitDeletions}${RESET}` : '',
        ].filter(Boolean).join(' ')
      : undefined,
    context: `${I18N[language].ctx} ${contextColor(value.contextPercent ?? 0)}${contextRing(value.contextPercent ?? 0)} ${contextColor(value.contextPercent ?? 0)}${(value.contextPercent ?? 0).toFixed(0)}%${RESET}`,
    tokens: `${BLUE}↑${formatTokenCount(value.inputTokens)} ↓${formatTokenCount(value.outputTokens)}${activeTurn ? '…' : ''}${RESET}`,
    cache: value.cacheReadTokens > 0
      ? (() => {
          const promptTokens = Math.max(value.inputTokens, value.inputTokens + value.cacheReadTokens, value.cacheReadTokens)
          const percent = promptTokens > 0 ? Math.round((value.cacheReadTokens / promptTokens) * 100) : 0
          return `${CYAN}⚡${I18N[language].cache} ${percent}% (${formatTokenCount(value.cacheReadTokens)})${RESET}`
        })()
      : undefined,
    quota: formatQuota(value.rateLimits).join(' │ ') || undefined,
    cost: value.costUsd !== undefined && Number.isFinite(value.costUsd)
      ? `${GREEN}$${value.costUsd.toFixed(2)}${RESET}`
      : undefined,
    cwd: value.cwd ? `${GRAY}${shortPath(value.cwd, value.home)}${RESET}` : undefined,
  }

  return currentConfig.order
    .filter(item => currentConfig.modules[item] && parts[item])
    .map(item => parts[item])
    .join(' │ ')
}

export function stripAnsi(value: string): string {
  return value.replace(/\u001b\[[0-9;]*m/gu, '')
}

function show($: EngineInterface): void {
  $.ui.invalidate('ui.render')
}

function applyUsage(usage: Pick<SessionUsage, 'context' | 'rateLimits' | 'cost'>): void {
  snapshot = {
    ...snapshot,
    contextPercent: usage.context.percent,
    costUsd: usage.cost?.usd,
    rateLimits: usage.rateLimits.map(limit => ({
      kind: limit.kind,
      percentUsed: limit.percentUsed,
      resetsAt: limit.resetsAt,
    })),
  }
}

function applyTurnUsage(usage: TurnUsage | undefined): void {
  if (!usage) return
  snapshot = {
    ...snapshot,
    model: usage.model || snapshot.model,
    inputTokens: snapshot.inputTokens + usage.input_tokens,
    outputTokens: snapshot.outputTokens + usage.output_tokens,
    cacheReadTokens: snapshot.cacheReadTokens + usage.cache_read_input_tokens,
  }
}

function updateAgentDetail(agentId: string, patch: Partial<AgentDetail>): void {
  const previous = agentDetails.get(agentId) ?? { inputTokens: 0, outputTokens: 0 }
  agentDetails.set(agentId, { ...previous, ...patch })
}

async function homeDirectory($: EngineInterface): Promise<string> {
  return (await $.env.get('HOME')) ?? (await $.env.get('USERPROFILE')) ?? ''
}

function joinPath(base: string, child: string): string {
  return `${base.replace(/[\\/]+$/u, '')}/${child}`
}

async function readConfig($: EngineInterface, home: string): Promise<void> {
  if (!home) return
  configPath = joinPath(home, '.config/my-cc-mods/config.json')
  try {
    const content = await $.fs.read(configPath)
    if (typeof content === 'string') config = normalizeConfig(JSON.parse(content))
  } catch {
    config = cloneConfig(DEFAULT_CONFIG)
  }
}

async function detectEnvironment($: EngineInterface): Promise<string | undefined> {
  const cwd = snapshot.cwd
  if (!cwd) return undefined

  const virtualEnv = await $.env.get('VIRTUAL_ENV')
  if (virtualEnv) return `(${virtualEnv.split(/[\\/]/u).pop() ?? 'venv'})`

  const conda = await $.env.get('CONDA_DEFAULT_ENV')
  if (conda) return `conda:${conda}`
  if ((await $.env.get('REMOTE_CONTAINERS')) || (await $.env.get('CODESPACES'))) return 'devcontainer'
  if (await $.env.get('WSL_DISTRO_NAME')) return 'wsl'

  const exists = async (name: string) => $.fs.exists(joinPath(cwd, name))
  if (await exists('.venv')) return '(.venv)'
  if (await exists('venv')) return '(venv)'
  if (await exists('env')) return '(env)'

  for (const file of ['.nvmrc', '.node-version']) {
    if (await exists(file)) {
      try {
        const content = await $.fs.read(joinPath(cwd, file))
        if (typeof content === 'string' && content.trim()) {
          const version = content.trim().replace(/^v(?!node)/u, '')
          return `node:v${version}`
        }
      } catch {
        // Continue with the remaining project markers.
      }
    }
  }

  if (await exists('bun.lockb') || await exists('bun.lock')) return 'bun'
  if (await exists('pnpm-lock.yaml')) return 'pnpm'
  if (await exists('yarn.lock')) return 'yarn'
  if (await exists('package-lock.json')) return 'npm'
  if (await exists('package.json')) return 'node'
  if (await exists('Cargo.toml')) return 'cargo'
  if (await exists('go.mod')) return 'go'
  if (await exists('pom.xml')) return 'maven'
  if (await exists('build.gradle') || await exists('build.gradle.kts')) return 'gradle'
  if (await exists('.ruby-version') || await exists('Gemfile')) return 'ruby'
  if (await exists('pyproject.toml') || await exists('requirements.txt')) return 'python'
  return undefined
}

function parseDiffStat(text: string): { insertions: number; deletions: number } {
  const insertions = Number(text.match(/(\d+)\s+insertion/iu)?.[1] ?? 0)
  const deletions = Number(text.match(/(\d+)\s+deletion/iu)?.[1] ?? 0)
  return { insertions, deletions }
}

async function readGit($: EngineInterface): Promise<void> {
  if (!snapshot.cwd) return

  try {
    const [branchResult, statusResult, diffResult] = await Promise.all([
      $.process.run(['git', 'branch', '--show-current'], { cwd: snapshot.cwd, timeoutMs: 500 }),
      $.process.run(['git', 'status', '--porcelain'], { cwd: snapshot.cwd, timeoutMs: 500 }),
      $.process.run(['git', 'diff', 'HEAD', '--shortstat'], { cwd: snapshot.cwd, timeoutMs: 500 }),
    ])

    let branch = branchResult.stdout.trim()
    if (!branch) {
      const detached = await $.process.run(['git', 'rev-parse', '--short', 'HEAD'], { cwd: snapshot.cwd, timeoutMs: 500 })
      branch = detached.stdout.trim()
    }

    let diff = diffResult.stdout.trim()
    if (!diff) {
      const fallback = await $.process.run(['git', 'diff', '--shortstat'], { cwd: snapshot.cwd, timeoutMs: 500 })
      diff = fallback.stdout.trim()
    }

    const stats = parseDiffStat(diff)
    snapshot = {
      ...snapshot,
      gitBranch: branch || undefined,
      gitDirty: statusResult.stdout.trim().length > 0,
      gitInsertions: stats.insertions,
      gitDeletions: stats.deletions,
    }
  } catch {
    snapshot = {
      ...snapshot,
      gitBranch: undefined,
      gitDirty: false,
      gitInsertions: 0,
      gitDeletions: 0,
    }
  }
}

async function refreshAgents($: EngineInterface): Promise<void> {
  try {
    const agents = await $.agent.list()
    snapshot = {
      ...snapshot,
      subagents: agents.map(agent => ({
        ...agent,
        ...(agentDetails.get(agent.id) ?? { inputTokens: 0, outputTokens: 0 }),
      })),
    }
  } catch {
    snapshot = { ...snapshot, subagents: [] }
  }
}

async function refreshSession($: EngineInterface, cwd: string): Promise<void> {
  snapshot = { ...snapshot, cwd, home: await homeDirectory($) }
  await readConfig($, snapshot.home)

  try {
    const [model, usage] = await Promise.all([$.session.model(), $.session.usage()])
    snapshot = { ...snapshot, model }
    applyUsage(usage)
  } catch {
    // Keep model and workspace information when usage is unavailable.
  }

  const [env] = await Promise.all([detectEnvironment($), readGit($), refreshAgents($)])
  snapshot = { ...snapshot, env }
  show($)
}

async function refreshLiveData($: EngineInterface): Promise<void> {
  await readConfig($, snapshot.home)
  const [env] = await Promise.all([detectEnvironment($), readGit($), refreshAgents($)])
  snapshot = { ...snapshot, env }
}

export const register: Register = on => {
  on('ui.render', { component: 'PromptHint' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    return Text({ children: [''] })
  })

  on('ui.render', { component: 'SessionMode' }, ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const modeText = e.props.modes.length > 0
      ? `⏵⏵ ${e.props.modes.join(' & ')} ·`
      : ''
    const row = uiStatusRows(snapshot, config)[0] ?? []
    return Box({
      flexDirection: 'column',
      children: [
        Text({ dimColor: true, children: [modeText] }),
        Box({
          children: row.map(segment => Text({
            color: segment.color,
            bold: segment.bold,
            children: [segment.text],
          })),
        }),
      ],
    })
  })

  // 统一面板保存兼容文件后刷新；不依赖配置插件的状态或加载顺序。
  on('fs.write', async ($, e, next) => {
    const result = await next(e)
    if (result.deny === undefined && configPath && e.path.replace(/\\/gu, '/') === configPath.replace(/\\/gu, '/')) {
      await readConfig($, snapshot.home)
      show($)
    }
    return result
  })

  on('session.start', async ($, e, next) => {
    const result = await next(e)
    await refreshSession($, e.cwd)
    return result
  })

  on('session.measure', async ($, e, next) => {
    applyUsage(e)
    await refreshLiveData($)
    show($)
    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    if (!('agentId' in e && e.agentId)) {
      activeTurn = true
      snapshot = { ...snapshot, state: 'Thinking' }
      show($)
    }
    return next(e)
  })

  on('turn.step', async function* ($, e, next) {
    if (e.agentId) {
      updateAgentDetail(e.agentId, { model: e.model, contextPercent: undefined })
      await refreshAgents($)
    } else {
      snapshot = { ...snapshot, model: e.model, state: 'Thinking' }
      show($)
    }
    yield* next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (e.agentId) {
      updateAgentDetail(e.agentId, {
        outputTokens: (agentDetails.get(e.agentId)?.outputTokens ?? 0) + (e.usage?.output_tokens ?? 0),
        inputTokens: (agentDetails.get(e.agentId)?.inputTokens ?? 0) + (e.usage?.input_tokens ?? 0),
      })
      await refreshAgents($)
    } else {
      activeTurn = false
      snapshot = { ...snapshot, state: 'Idle' }
      applyTurnUsage(e.usage)
      await refreshLiveData($)
    }
    show($)
    return result
  })

  on('agent.spawn', async ($, e, next) => {
    const result = await next(e)
    await refreshAgents($)
    show($)
    return result
  })

  on('tool.call', async ($, e, next) => {
    if (e.agentId) return next(e)

    snapshot = { ...snapshot, activeTool: e.tool, state: 'Running' }
    show($)
    try {
      return await next(e)
    } finally {
      snapshot = { ...snapshot, activeTool: undefined, state: activeTurn ? 'Thinking' : 'Idle' }
      show($)
    }
  })

  on('session.end', async ($, e, next) => {
    return next(e)
  })
}
