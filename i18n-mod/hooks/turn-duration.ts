import type { RenderElement } from 'claude-code'
import type { TurnDurationConfig } from '../types'

export type TurnDurationViewModel =
  | { kind: 'native'; reason: 'native-mode' | 'missing-template' | 'invalid-template' | 'invalid-duration' | 'missing-waiting-template' | 'invalid-waiting-template' | 'workflow-waiting' }
  | { kind: 'hidden' }
  | { kind: 'custom'; text: string; marginTop: 0 | 1 }

/** 原生等待行报告的后台任务；workflow 无法用单个 Agent 模板准确表达。 */
export type TurnDurationWaiting = { agents: number; workflows: number }

/** 接受注册入口的原始 options；只认可精确值，不将字符串或数字强制转为 boolean。 */
export function normalizeTurnDurationConfig(options: Readonly<Record<string, unknown>> = {}): TurnDurationConfig {
  return {
    mode: options.turnDurationMode === 'custom' ? 'custom' : 'native',
    visible: typeof options.turnDurationVisible === 'boolean' ? options.turnDurationVisible : true,
    spacing: options.turnDurationSpacing === 'separated' ? 'separated' : 'compact',
  }
}

/** 非负有限毫秒向下取整到秒；省略为零的单位，只有总计零秒时显示 0s。 */
export function formatTurnDuration(durationMs: number): string | undefined {
  if (!Number.isFinite(durationMs) || durationMs < 0) return undefined
  let seconds = Math.floor(durationMs / 1000)
  const parts: string[] = []
  for (const [unit, size] of [['d', 86400], ['h', 3600], ['m', 60], ['s', 1]] as const) {
    const count = Math.floor(seconds / size)
    if (count > 0) parts.push(`${count}${unit}`)
    seconds %= size
  }
  return parts.join(' ') || '0s'
}

/** 和语言包 schema 保持一致；防御未经解析或由其他调用方构造的模板。 */
function validTemplate(template: string): boolean {
  return template.includes('{duration}')
    && !/[{}]/u.test(template.replace(/\{duration\}/gu, ''))
    && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(template)
}

function validWaitingTemplate(template: string): boolean {
  return template.includes('{agents}')
    && !/[{}]/u.test(template.replace(/\{agents\}/gu, ''))
    && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(template)
}

/**
 * 不接受 word、回合历史或任务状态；原文模式由注册模块提前透传。
 * 等待行只替换后台 Agent 数；含 workflow 时回退原生，避免少报等待项。
 */
export function createTurnDurationViewModel(
  durationMs: number,
  template: string | undefined,
  config: TurnDurationConfig,
  waiting?: TurnDurationWaiting,
  waitingTemplate?: string,
): TurnDurationViewModel {
  if (config.mode === 'native') return { kind: 'native', reason: 'native-mode' }
  if (!config.visible) return { kind: 'hidden' }
  if (waiting && (waiting.agents > 0 || waiting.workflows > 0)) {
    if (waiting.workflows > 0) return { kind: 'native', reason: 'workflow-waiting' }
    if (waitingTemplate === undefined) return { kind: 'native', reason: 'missing-waiting-template' }
    if (typeof waitingTemplate !== 'string' || !validWaitingTemplate(waitingTemplate)) {
      return { kind: 'native', reason: 'invalid-waiting-template' }
    }
    return {
      kind: 'custom',
      text: waitingTemplate.replace(/\{agents\}/gu, () => String(waiting.agents)),
      marginTop: config.spacing === 'separated' ? 1 : 0,
    }
  }
  if (template === undefined) return { kind: 'native', reason: 'missing-template' }
  if (typeof template !== 'string' || !validTemplate(template)) return { kind: 'native', reason: 'invalid-template' }
  const duration = formatTurnDuration(durationMs)
  if (duration === undefined) return { kind: 'native', reason: 'invalid-duration' }
  return {
    kind: 'custom',
    text: template.replace(/\{duration\}/gu, () => duration),
    marginTop: config.spacing === 'separated' ? 1 : 0,
  }
}

/** 只构造公开的 plain-data RenderElement；undefined 明确要求调用方整行回退原生。 */
export function renderTurnDuration(model: TurnDurationViewModel): RenderElement | undefined {
  if (model.kind === 'native') return undefined
  if (model.kind === 'hidden') return { type: 'Box', children: [] }
  return {
    type: 'Box', props: { width: '100%', flexDirection: 'row', marginTop: model.marginTop },
    children: [
      { type: 'Box', props: { width: 2, minWidth: 2, flexShrink: 0 }, children: [{ type: 'Text', children: ['✻'] }] },
      { type: 'Text', props: { dimColor: true }, children: [model.text] },
    ],
  }
}
