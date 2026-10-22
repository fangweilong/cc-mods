import { expect, mock, test } from 'claude-code/testing'
import { notificationFor } from '../hooks/register'

const mainTurn = {
  turnId: 'main-turn',
  answer: 'done',
  durationMs: 10,
  isAborted: false,
  reason: 'answer' as const,
}

test('maps answer and failure reasons without treating aborted turns as failures', () => {
  expect(notificationFor(mainTurn)).toEqual({ text: '任务完成', title: 'Claude Code 成功' })
  expect(notificationFor({ ...mainTurn, reason: 'error' })).toEqual({ text: '任务失败', title: 'Claude Code 失败' })
  expect(notificationFor({ ...mainTurn, reason: 'refusal', refusal: { category: null, explanation: null } })).toEqual({ text: '任务失败', title: 'Claude Code 失败' })
  expect(notificationFor({ ...mainTurn, reason: 'aborted', isAborted: true })).toBeUndefined()
})

test('notifies only the main answer turn and deduplicates repeated completion events', async ($, on) => {
  const notifications: Array<{ text: string; title: string }> = []
  mock.env(on, { HOME: '/test-home' })
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('state.get', () => ({ value: { value: undefined, version: 0 } }))
  on('state.set', ($, e) => ({ value: { isSet: true, version: 1 } }))
  on('ui.notify', ($, e) => {
    notifications.push({ text: e.text, title: e.title ?? '' })
    return { value: { isSent: true, channel: 'terminal_bell' } }
  })
  on('turn.complete', ($, e) => ({ text: e.answer }))

  await $.session.start({ cwd: '/work/project', surface: 'terminal', isInteractive: true })
  await $.turn.complete({ ...mainTurn })
  await $.turn.complete({ ...mainTurn })
  await $.turn.complete({ ...mainTurn, turnId: 'agent-turn', agentId: 'agent-1' })
  await $.turn.complete({ ...mainTurn, turnId: 'error-turn', reason: 'error' })
  await $.turn.complete({ ...mainTurn, turnId: 'aborted-turn', reason: 'aborted', isAborted: true })

  expect(notifications).toEqual([
    { text: '任务完成', title: 'Claude Code 成功' },
    { text: '任务失败', title: 'Claude Code 失败' },
  ])
})

test('ignores notification failures without falling back to toast', async ($, on) => {
  let toastCalls = 0
  mock.env(on, { HOME: '/test-home' })
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('state.get', () => ({ value: { value: undefined, version: 0 } }))
  on('state.set', () => ({ value: { isSet: true, version: 1 } }))
  on('ui.notify', () => { throw new Error('notification unavailable') })
  on('ui.toast', () => { toastCalls += 1; return { value: undefined } })
  on('turn.complete', ($, e) => ({ text: e.answer }))

  await $.session.start({ cwd: '/work/project', surface: 'terminal', isInteractive: true })
  await $.turn.complete({ ...mainTurn, turnId: 'failed-notification' })

  expect(toastCalls).toBe(0)
})
