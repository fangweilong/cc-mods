import type { EngineInterface, Register, TurnCompleteInput } from 'claude-code'

const NOTIFIED_TURNS = { plugin: 'notification-mod', key: 'notifiedTurnIds' } as const
const MAX_REMEMBERED_TURNS = 200

let notifiedTurnIds = new Set<string>()
const inFlightTurnIds = new Set<string>()

function trimTurnIds(ids: Iterable<string>): string[] {
  return Array.from(ids).slice(-MAX_REMEMBERED_TURNS)
}

async function loadNotifiedTurnIds($: EngineInterface): Promise<void> {
  try {
    const saved = await $.state.get(NOTIFIED_TURNS)
    if (saved.value) notifiedTurnIds = new Set(saved.value.slice(-MAX_REMEMBERED_TURNS))
  } catch {
    // 去重状态读取失败时保留当前模块内存，不影响主会话。
  }
}

async function rememberTurn($: EngineInterface, turnId: string): Promise<boolean> {
  if (notifiedTurnIds.has(turnId) || inFlightTurnIds.has(turnId)) return false
  inFlightTurnIds.add(turnId)
  notifiedTurnIds.add(turnId)
  try {
    await $.state.set(NOTIFIED_TURNS, trimTurnIds(notifiedTurnIds))
  } catch {
    // 持久化失败不应阻断通知或主会话。
  } finally {
    inFlightTurnIds.delete(turnId)
  }
  return true
}

function notificationFor(event: TurnCompleteInput): { text: string; title: string } | undefined {
  if (event.reason === 'aborted' || event.isAborted) return undefined
  if (event.reason === 'answer') return { text: '任务完成', title: 'Claude Code 成功' }
  if (event.reason === 'error' || event.reason === 'refusal') return { text: '任务失败', title: 'Claude Code 失败' }
  return undefined
}

async function notifyTurn($: EngineInterface, event: TurnCompleteInput): Promise<void> {
  const notification = notificationFor(event)
  if (!notification || !(await rememberTurn($, event.turnId))) return
  try {
    await $.ui.notify(notification.text, { title: notification.title })
  } catch {
    // 通知通道失败时安全忽略，不回退为 toast。
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await loadNotifiedTurnIds($)
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (e.agentId === undefined) await notifyTurn($, e)
    return result
  })
}

export { notificationFor }
