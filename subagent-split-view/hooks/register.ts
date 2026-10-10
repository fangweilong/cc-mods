import type {
  AgentInfo,
  EngineInterface,
  Register,
  ToolCallResult,
  TurnStepChunk,
} from 'claude-code'

const PANE_ID = 'subagent-split-view'
const MAX_LOG_ENTRIES = 120
const MAX_VISIBLE_AGENTS = 8
const MAX_ENTRY_LENGTH = 180

const FINISHED_STATUSES = new Set([
  'completed',
  'done',
  'finished',
  'success',
  'failed',
  'error',
  'errored',
  'killed',
  'cancelled',
  'canceled',
  'terminated',
])

const COLORS = {
  cyan: '#50c8ff',
  blue: '#64a0ff',
  purple: '#be78ff',
  green: '#50dc8c',
  yellow: '#ffd700',
  red: '#ff5a64',
  gray: '#8791a0',
} as const

type LogKind = 'event' | 'thinking' | 'text' | 'tool' | 'result'

type LogEntry = {
  kind: LogKind
  text: string
}

type AgentPanel = {
  info: AgentInfo
  model?: string
  activity: string
  entries: LogEntry[]
}

const panels = new Map<string, AgentPanel>()
let paneOpenRequested = false

function cleanText(value: string): string {
  return value
    .replace(/\u001b\[[0-?]*[ -/]*[@-~]/gu, '')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/gu, '')
    .replace(/\r?\n/gu, ' ↵ ')
    .trim()
}

function clipText(value: string, maxLength = MAX_ENTRY_LENGTH): string {
  const text = cleanText(value)
  return text.length > maxLength ? `${text.slice(0, maxLength - 3)}...` : text
}

export function isFinishedAgentStatus(status: string): boolean {
  return FINISHED_STATUSES.has(status.toLowerCase())
}

function statusColor(status: string): string {
  const key = status.toLowerCase()
  if (['failed', 'error', 'errored', 'killed', 'cancelled', 'canceled'].includes(key)) return COLORS.red
  if (['completed', 'done', 'finished', 'success'].includes(key)) return COLORS.green
  if (['running', 'working', 'in_progress'].includes(key)) return COLORS.cyan
  return COLORS.gray
}

function statusIcon(status: string): string {
  const key = status.toLowerCase()
  if (['failed', 'error', 'errored', 'killed', 'cancelled', 'canceled'].includes(key)) return '✖'
  if (['completed', 'done', 'finished', 'success'].includes(key)) return '✓'
  if (['running', 'working', 'in_progress'].includes(key)) return '●'
  return '○'
}

function ensurePanel(info: AgentInfo): AgentPanel {
  const existing = panels.get(info.id)
  if (existing) {
    existing.info = info
    return existing
  }

  const panel: AgentPanel = {
    info,
    activity: 'starting',
    entries: [],
  }
  panels.set(info.id, panel)
  return panel
}

function appendLog(agentId: string, kind: LogKind, text: string): void {
  const panel = panels.get(agentId)
  if (!panel) return

  const value = clipText(text)
  if (!value) return

  const last = panel.entries.at(-1)
  if (last && last.kind === kind && (kind === 'thinking' || kind === 'text')) {
    last.text = clipText(`${last.text}${value}`, MAX_ENTRY_LENGTH)
    return
  }

  panel.entries.push({ kind, text: value })
  if (panel.entries.length > MAX_LOG_ENTRIES) {
    panel.entries.splice(0, panel.entries.length - MAX_LOG_ENTRIES)
  }
}

function setActivity(agentId: string, activity: string): void {
  const panel = panels.get(agentId)
  if (panel) panel.activity = clipText(activity, 80)
}

async function refreshAgents($: EngineInterface, pruneMissing = false): Promise<void> {
  try {
    const agents = await $.agent.list()
    const listedAgentIds = new Set<string>()
    for (const info of agents) {
      listedAgentIds.add(info.id)
      if (isFinishedAgentStatus(info.status)) {
        panels.delete(info.id)
      } else {
        ensurePanel(info)
      }
    }

    if (pruneMissing) {
      for (const agentId of panels.keys()) {
        if (!listedAgentIds.has(agentId)) panels.delete(agentId)
      }
    }
  } catch {
    // The panel keeps the last known state if the task list is unavailable.
  }
}

async function closePaneIfEmpty($: EngineInterface): Promise<void> {
  if (!paneOpenRequested || panels.size > 0) return
  await $.ui.close({ id: PANE_ID })
  paneOpenRequested = false
}

function invalidate($: EngineInterface): void {
  $.ui.invalidate('ui.render')
}

function toolInputText(event: { tool: string; [key: string]: unknown }): string {
  const input = Object.entries(event)
    .filter(([key]) => !['tool', 'tool_use_id', 'agentId'].includes(key))
    .map(([key, value]) => `${key}=${typeof value === 'string' ? value : JSON.stringify(value)}`)
    .join(' ')
  return input ? `${event.tool} ${input}` : event.tool
}

function toolResultText(result: ToolCallResult): string {
  if ('deny' in result && result.deny) return `denied: ${result.deny}`
  if ('isError' in result && result.isError) return result.text ?? 'tool failed'
  return result.text ?? 'done'
}

function orderedPanels(): AgentPanel[] {
  return [...panels.values()]
    .sort((left, right) => {
      const leftRunning = ['running', 'working', 'in_progress'].includes(left.info.status.toLowerCase())
      const rightRunning = ['running', 'working', 'in_progress'].includes(right.info.status.toLowerCase())
      if (leftRunning !== rightRunning) return leftRunning ? -1 : 1
      return left.info.id.localeCompare(right.info.id)
    })
    .slice(0, MAX_VISIBLE_AGENTS)
}

export function formatPanelHeader(panelsCount: number, runningCount: number): string {
  return `Subagents · ${runningCount} running · ${panelsCount} tracked`
}

export function formatLogEntry(entry: LogEntry): string {
  const prefix: Record<LogKind, string> = {
    event: '•',
    thinking: '…',
    text: '←',
    tool: '▶',
    result: '✓',
  }
  return `${prefix[entry.kind]} ${entry.text}`
}

function renderPanel($: EngineInterface, e: any): any {
  const { Box, Text } = $.ui.resolve(e)
  const currentPanels = orderedPanels()
  const runningCount = currentPanels.filter(panel => ['running', 'working', 'in_progress'].includes(panel.info.status.toLowerCase())).length
  const children: any[] = [
    Text({ color: COLORS.cyan, bold: true, children: [formatPanelHeader(panels.size, runningCount)] }),
    Text({ color: COLORS.gray, children: ['Live output from each subagent. Esc closes this pane.'] }),
  ]

  if (currentPanels.length === 0) {
    children.push(Text({ color: COLORS.gray, children: ['No subagents have started yet.'] }))
  }

  for (const panel of currentPanels) {
    const status = panel.info.status || 'unknown'
    const name = panel.info.name ?? panel.info.type ?? 'agent'
    const title = `${statusIcon(status)} ${name} · ${panel.model ?? 'model pending'} · ${status}`
    const task = clipText(panel.info.description, 100)
    const logRows = panel.entries.slice(-12).map(entry => Text({
      color: entry.kind === 'tool' ? COLORS.purple : entry.kind === 'result' ? COLORS.green : entry.kind === 'thinking' ? COLORS.gray : COLORS.blue,
      wrap: 'truncate-end',
      children: [formatLogEntry(entry)],
    }))

    children.push(Box({
      key: `agent-panel-${panel.info.id}`,
      flexDirection: 'column',
      borderStyle: 'single',
      borderColor: statusColor(status),
      paddingX: 1,
      children: [
        Text({ color: statusColor(status), bold: true, children: [title] }),
        Text({ color: COLORS.gray, wrap: 'truncate-end', children: [`task: ${task || '(no description)'}`] }),
        Text({ color: COLORS.yellow, wrap: 'truncate-end', children: [`activity: ${panel.activity}`] }),
        ...logRows,
      ],
    }))
  }

  return Box({ flexDirection: 'column', children })
}

async function openPane($: EngineInterface): Promise<void> {
  if (paneOpenRequested) return
  paneOpenRequested = true
  const result = await $.ui.open({
    id: PANE_ID,
    title: 'Subagents',
    columns: 72,
    closeOnEscape: true,
  })
  if (!result.isPlaced) {
    $.ui.toast('Subagent view waits for a wide terminal; run /subagent-view to open it.')
  }
}

export const register: Register = on => {
  on('ui.render', { component: 'Pane', requestId: PANE_ID }, ($, e) => renderPanel($, e))

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'subagent-view',
      description: 'Open the live Subagent execution pane. Use "clear" to remove its log.',
      argumentHint: '[clear]',
    })
    await refreshAgents($)
    return next(e)
  })

  on('command.run', { command: 'subagent-view' }, async ($, e) => {
    if (e.args.trim().toLowerCase() === 'clear') {
      panels.clear()
      $.ui.invalidate('ui.render')
      return { text: 'Subagent execution log cleared.' }
    }

    paneOpenRequested = false
    await openPane($)
    return { text: 'Subagent execution pane opened.' }
  })

  on('agent.spawn', async ($, e, next) => {
    const result = await next(e)
    if (result.agentId) {
      const info: AgentInfo = {
        id: result.agentId,
        description: e.description,
        type: e.subagentType,
        status: 'running',
        parentId: e.parentAgentId,
        name: e.name,
      }
      const panel = ensurePanel(info)
      panel.model = result.model
      appendLog(result.agentId, 'event', `started: ${e.description}`)
      setActivity(result.agentId, 'starting turn')
      await openPane($)
    }
    await refreshAgents($, false)
    invalidate($)
    return result
  })

  on('turn.step', async function* ($, e, next) {
    if (!e.agentId) {
      yield* next(e)
      return
    }

    const panel = panels.get(e.agentId)
    if (panel) {
      panel.model = e.model
      setActivity(e.agentId, `thinking · step ${e.index + 1}`)
      invalidate($)
    }

    for await (const chunk of next(e)) {
      const current = panels.get(e.agentId)
      if (current) {
        const streamChunk = chunk as TurnStepChunk
        if (streamChunk.kind === 'thinking') {
          appendLog(e.agentId, 'thinking', streamChunk.text)
          setActivity(e.agentId, 'thinking')
        } else if (streamChunk.kind === 'text') {
          appendLog(e.agentId, 'text', streamChunk.text)
          setActivity(e.agentId, 'answering')
        } else if (streamChunk.kind === 'stop') {
          setActivity(e.agentId, 'waiting for next step')
        }
        invalidate($)
      }
      yield chunk
    }
  })

  on('tool.call', async ($, e, next) => {
    if (!e.agentId) return next(e)

    ensurePanel({
      id: e.agentId,
      description: 'Subagent',
      type: 'agent',
      status: 'running',
    })
    appendLog(e.agentId, 'tool', toolInputText(e))
    setActivity(e.agentId, `tool: ${e.tool}`)
    invalidate($)

    try {
      const result = await next(e)
      appendLog(e.agentId, 'result', toolResultText(result))
      setActivity(e.agentId, 'waiting for next step')
      return result
    } finally {
      invalidate($)
    }
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (e.agentId) {
      await refreshAgents($, true)
      panels.delete(e.agentId)
      await closePaneIfEmpty($)
      invalidate($)
    }
    return result
  })
}
