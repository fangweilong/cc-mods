import type { CommandTranslation, ConfigTranslation, HintKey, LanguagePack } from '../types'

// 只匹配完整快捷键提示片段，避免改动文件名、命令、内容中的同名词。
const HINT_RULES: readonly { pattern: RegExp; key: HintKey }[] = [
  { pattern: /^(.*?) for shortcuts$/i, key: 'shortcuts' },
  { pattern: /^(.*?) to interrupt$/i, key: 'interrupt' },
  { pattern: /^(.*?) to run in background$/i, key: 'background' },
  { pattern: /^(.*?) to expand$/i, key: 'expand' },
  { pattern: /^(.*?) to collapse$/i, key: 'collapse' },
  { pattern: /^(.*?) for history$/i, key: 'history' },
  { pattern: /^(.*?) to cycle(?: modes?)?$/i, key: 'cycleMode' },
  { pattern: /^(.*?) to accept suggestion$/i, key: 'acceptSuggestion' },
]
const KEY_BINDING = /^(?:\?|(?:ctrl|alt|shift|cmd|meta)\+[a-z0-9+]+|esc|escape|tab|enter|↑|↓|↑\/↓|up|down)$/i
const HINT_SEPARATOR = /(\s*[·•|]\s*|\s{2,})/u
// 已核对原生实现：这些确切文案是淡色 Text，不是任务按钮或链接。
const PASSIVE_PROMPT_HINTS = new Set(['install gh for PR status', 'gh auth login for PR status', '← for agents'])

function matchHint(text: string) {
  const match = /^(\s*)(\(?)(.*?)(\)?)(\s*)$/u.exec(text)
  if (!match) return undefined
  const [, leading, open, body = '', close, trailing] = match
  if ((open === '(') !== (close === ')')) return undefined
  for (const rule of HINT_RULES) {
    const key = rule.pattern.exec(body)?.[1]
    if (key && KEY_BINDING.test(key)) {
      return { key: rule.key, prefix: `${leading}${open}${key} `, suffix: `${close}${trailing}` }
    }
  }
  return undefined
}

/** 只翻译一个完整的已知快捷提示。 */
export function translateSingleHint(text: string, pack: LanguagePack): string {
  if (pack.preserveOriginal || /[\r\n]/u.test(text)) return text
  const match = matchHint(text)
  const translated = match && pack.hints?.[match.key]
  return match && translated ? `${match.prefix}${translated}${match.suffix}` : text
}

/** 只有每一段都确认是静态文本时才改写整行，未知内容保守透传。 */
export function translatePromptHint(text: string, pack: LanguagePack): string {
  if (pack.preserveOriginal || /[\r\n]/u.test(text)) return text
  const parts = text.split(HINT_SEPARATOR)
  if (parts.some(part => !/^[\s·•|]*$/u.test(part) && !PASSIVE_PROMPT_HINTS.has(part.trim()) && !matchHint(part))) return text
  return parts.map(part => translateSingleHint(part, pack)).join('')
}

/** 保留分隔符、括号和实际快捷键；供不会替换交互行的提示位置使用。 */
export function translateHint(text: string, pack: LanguagePack): string {
  if (pack.preserveOriginal) return text
  return text.split(HINT_SEPARATOR).map(part => translateSingleHint(part, pack)).join('')
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

/** 配置行只翻译宿主提供的 label/description，不修改 key、provider 或隐藏状态。 */
export function translateConfig(
  key: string,
  label: string,
  description: string | undefined,
  entries?: Readonly<Record<string, ConfigTranslation>>,
): { label: string; description?: string } {
  const translation = entries && Object.prototype.hasOwnProperty.call(entries, key) ? entries[key] : undefined
  if (!translation) return { label, ...(description === undefined ? {} : { description }) }
  return {
    label: translation.label ?? label,
    ...(translation.description === undefined ? (description === undefined ? {} : { description }) : { description: translation.description }),
  }
}

/** 斜杠命令只翻译展示字段，命令名、可见性和执行协议保持宿主原样。 */
export function translateCommand(
  command: string,
  description: string,
  argumentHint: string | undefined,
  entries?: Readonly<Record<string, CommandTranslation>>,
): { description: string; argumentHint?: string } {
  const translation = entries && Object.prototype.hasOwnProperty.call(entries, command) ? entries[command] : undefined
  if (!translation) return { description, ...(argumentHint === undefined ? {} : { argumentHint }) }
  return {
    description: translation.description ?? description,
    ...(translation.argumentHint === undefined ? (argumentHint === undefined ? {} : { argumentHint }) : { argumentHint: translation.argumentHint }),
  }
}

/** 使用回调替换占位符，保持动态值中的 $、反斜杠等字符不变。 */
export function formatMessage(template: string, values: Readonly<Record<string, string>>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => Object.prototype.hasOwnProperty.call(values, key) ? values[key] ?? match : match)
}
