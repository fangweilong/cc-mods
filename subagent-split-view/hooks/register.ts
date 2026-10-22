import type {
  AgentInfo,
  EngineInterface,
  Register,
  ToolCallResult,
  TurnStepChunk,
} from 'claude-code'

const PANE_ID = 'subagent-split-view'
const MAX_LOG_ENTRIES = 120
const MAX_VISIBLE_AGENTS = 12
const MAX_FINISHED_AGENTS = 6
const MAX_ENTRY_LENGTH = 220

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
  startedAt: number
  finishedAt?: number
}

const panels = new Map<string, AgentPanel>()
let paneOpenRequested = false
let viewedAgentId: string | undefined

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
    startedAt: Date.now(),
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

function pruneFinished(): void {
  const finished = [...panels.values()]
    .filter(panel => panel.finishedAt !== undefined)
    .sort((left, right) => (left.finishedAt ?? 0) - (right.finishedAt ?? 0))
  while (finished.length > MAX_FINISHED_AGENTS) {
    const panel = finished.shift()
    if (panel) panels.delete(panel.info.id)
  }
}

async function refreshAgents($: EngineInterface, pruneMissing = false): Promise<void> {
  try {
    const agents = await $.agent.list()
    const listedAgentIds = new Set<string>()
    for (const info of agents) {
      listedAgentIds.add(info.id)
      const panel = ensurePanel(info)
      if (isFinishedAgentStatus(info.status)) {
        panel.finishedAt ??= Date.now()
      } else {
        panel.finishedAt = undefined
      }
    }

    if (pruneMissing) {
      for (const agentId of panels.keys()) {
        if (!listedAgentIds.has(agentId)) panels.delete(agentId)
      }
    }
    pruneFinished()
  } catch {
    // The panel keeps the last known state if the task list is unavailable.
  }
}

function invalidate($: EngineInterface): void {
  $.ui.invalidate('ui.render')
}

function toolInputText(event: { tool: string; [key: string]: unknown }): string {
  const input = Object.entries(event)
    .filter(([key]) => !['tool', 'tool_use_id', 'agentId'].includes(key))
    .map(([key, value]) => {
      const text = typeof value === 'string' ? value : JSON.stringify(value)
      return `${key}=${clipText(text ?? '', 60)}`
    })
    .join(' ')
  return clipText(input ? `${event.tool} ${input}` : event.tool, 180)
}

function toolResultText(result: ToolCallResult): string {
  if ('deny' in result && result.deny) return `denied: ${result.deny}`
  if ('isError' in result && result.isError) return result.text ?? 'tool failed'
  return result.text ?? 'done'
}

function lastLogRows(panel: AgentPanel): LogEntry[] {
  return panel.entries.slice(-3)
}

function orderedPanels(): AgentPanel[] {
  return [...panels.values()]
    .sort((left, right) => {
      const leftRunning = left.finishedAt === undefined
      const rightRunning = right.finishedAt === undefined
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

async function switchMainView($: EngineInterface, agentId?: string): Promise<void> {
  try {
    const result = await $.ui.view(agentId ? { agentId } : {})
    if (result && typeof result === 'object' && 'deny' in result && result.deny) {
      $.ui.toast(String(result.deny))
      return
    }
    viewedAgentId = agentId
    invalidate($)
  } catch {
    $.ui.toast(agentId ? 'Unable to open the native subagent transcript.' : 'Unable to return to the main transcript.')
  }
}

function renderPanel($: EngineInterface, e: any): any {
  const { Box, Text, Button } = $.ui.resolve(e)
  const currentPanels = orderedPanels()
  const runningCount = currentPanels.filter(panel => panel.finishedAt === undefined).length
  const viewing = viewedAgentId
    ? currentPanels.find(panel => panel.info.id === viewedAgentId)
    : undefined
  const children: any[] = [
    Box({
      flexDirection: 'row',
      gap: 1,
      children: [
        Text({ color: COLORS.cyan, weight: 'bold', children: [formatPanelHeader(panels.size, runningCount)] }),
        Button({
          key: 'view-main-transcript',
          label: '↩ 主会话',
          plain: true,
          onPress: () => void switchMainView($),
        }),
        Button({
          key: 'clear-subagents',
          label: '清除',
          plain: true,
          onPress: () => {
            panels.clear()
            viewedAgentId = undefined
            invalidate($)
          },
        }),
      ],
    }),
    Text({
      color: COLORS.gray,
      children: [viewing
        ? `正在查看：${viewing.info.name ?? viewing.info.type} 的原生转录。`
        : '点击「查看转录」打开原生 Subagent 转录（等同鼠标点击 Subagent）。'],
    }),
  ]

  if (currentPanels.length === 0) {
    children.push(Text({ color: COLORS.gray, children: ['No subagents have started yet.'] }))
  }

  for (const panel of currentPanels) {
    const status = panel.info.status || 'unknown'
    const name = panel.info.name ?? panel.info.type ?? 'agent'
    const isViewed = viewedAgentId === panel.info.id
    const title = `${statusIcon(status)} ${name} · ${panel.info.type ?? 'agent'} · ${panel.model ?? 'model pending'} · ${status}`
    const task = clipText(panel.info.description, 120)
    const logRows = lastLogRows(panel).map(entry => Text({
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
        Box({ flexDirection: 'row', gap: 1, children: [
          Text({ color: statusColor(status), weight: 'bold', wrap: 'truncate-end', children: [title] }),
          Button({
            key: `view-agent-${panel.info.id}`,
            label: isViewed ? '返回主会话' : '查看转录',
            variant: isViewed ? 'secondary' : 'primary',
            onPress: () => void switchMainView($, isViewed ? undefined : panel.info.id),
          }),
        ] }),
        Text({ color: COLORS.gray, wrap: 'truncate-end', children: [`task: ${task || '(no description)'}`] }),
        Text({ color: COLORS.yellow, wrap: 'truncate-end', children: [`当前：${panel.activity}`] }),
        ...logRows,
        ...(panel.finishedAt === undefined
          ? []
          : [Text({ color: COLORS.gray, children: ['已结束，可点击「查看转录」查看完整过程。'] })]),
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
    panels.clear()
    viewedAgentId = undefined
    paneOpenRequested = false
    await $.command.register({
      name: 'subagent-view',
      description: 'Open the live Subagent pane. Click "查看转录" to open the native transcript. Use "clear" to forget tracked agents.',
      argumentHint: '[clear]',
    })
    await refreshAgents($)
    return next(e)
  })

  on('command.run', { command: 'subagent-view' }, async ($, e) => {
    if (e.args.trim().toLowerCase() === 'clear') {
      panels.clear()
      viewedAgentId = undefined
      $.ui.invalidate('ui.render')
      return { text: 'Subagent log cleared.' }
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
      await refreshAgents($, false)
      const panel = panels.get(e.agentId)
      if (panel) {
        panel.info = {
          ...panel.info,
          status: e.reason === 'error' ? 'failed' : 'completed',
        }
        panel.finishedAt ??= Date.now()
        setActivity(e.agentId, e.reason === 'error' ? 'failed' : 'completed')
      }
      invalidate($)
    }
    return result
  })
}
