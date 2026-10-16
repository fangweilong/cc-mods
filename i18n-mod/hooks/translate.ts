import type { HintKey, LanguagePack } from '../types'

// 只匹配完整快捷键提示片段，避免改动文件名、命令、内容中的同名词。
const HINT_RULES: readonly { pattern: RegExp; key: HintKey }[] = [
  { pattern: /^(.*?) for shortcuts$/i, key: 'shortcuts' },
  { pattern: /^(.*?) to interrupt$/i, key: 'interrupt' },
  { pattern: /^(.*?) to run in background$/i, key: 'background' },
  { pattern: /^(.*?) to expand$/i, key: 'expand' },
  { pattern: /^(.*?) to collapse$/i, key: 'collapse' },
  { pattern: /^(.*?) for history$/i, key: 'history' },
  { pattern: /^(.*?) to cycle modes?$/i, key: 'cycleMode' },
  { pattern: /^(.*?) to accept suggestion$/i, key: 'acceptSuggestion' },
]
const KEY_BINDING = /^(?:\?|(?:ctrl|alt|shift|cmd|meta)\+[a-z0-9+]+|esc|escape|tab|enter|↑|↓|↑\/↓|up|down)$/i

/** 保留分隔符、括号和实际快捷键；未知片段与缺失译文原样返回。 */
export function translateHint(text: string, pack: LanguagePack): string {
  if (pack.preserveOriginal) return text
  return text.split(/(\s*[·•|]\s*|\s{2,})/u).map(part => {
    const match = /^(\s*)(\(?)(.*?)(\)?)(\s*)$/u.exec(part)
    if (!match) return part
    const [, leading, open, body = '', close, trailing] = match
    if ((open === '(') !== (close === ')')) return part
    for (const rule of HINT_RULES) {
      const hit = rule.pattern.exec(body)
      const key = hit?.[1]
      const translated = pack.hints?.[rule.key]
      if (key && KEY_BINDING.test(key) && translated) {
        return `${leading}${open}${key} ${translated}${close}${trailing}`
      }
    }
    return part
  }).join('')
}

/** 语言包只对精确匹配的文案负责，不对任意文本进行词语替换。 */
export function translateExact(text: string, entries?: Readonly<Record<string, string>>): string {
  return entries && Object.prototype.hasOwnProperty.call(entries, text) ? entries[text] ?? text : text
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
}

/**
 * 先精确匹配，再按已知通知文本的前缀匹配并保留动态后缀。
 * 语言包只能提供普通文本键，不执行语言包中的正则，避免误匹配和正则注入。
 */
export function translateNotice(text: string, entries?: Readonly<Record<string, string>>): string {
  const exact = translateExact(text, entries)
  if (exact !== text || !entries) return exact

  const candidates = Object.entries(entries).sort((left, right) => right[0].length - left[0].length)
  for (const [prefix, translated] of candidates) {
    if (!prefix || !translated) continue
    const pattern = new RegExp(`^${escapeRegExp(prefix)}(?=$|[\\s:：])`, 'u')
    if (pattern.test(text)) return `${translated}${text.slice(prefix.length)}`
  }
  return text
}

/** 使用回调替换占位符，保持动态值中的 $、反斜杠等字符不变。 */
export function formatMessage(template: string, values: Readonly<Record<string, string>>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => Object.prototype.hasOwnProperty.call(values, key) ? values[key] ?? match : match)
}

/** 耗时行沿用简洁单位，非有限或负数输入不输出错误数字。 */
export function formatDuration(durationMs: number): string {
  const seconds = Math.floor(Math.max(0, Number.isFinite(durationMs) ? durationMs : 0) / 1000)
  if (seconds < 60) return `${seconds}s`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`
  return `${Math.floor(seconds / 3600)}h ${Math.floor(seconds % 3600 / 60)}m ${seconds % 60}s`
}
