import type { HintKey, LanguagePack } from '../types'
import { ORIGINAL_PACK } from './original'

export const DEFAULT_SOURCE = 'zh-CN'
const LANGUAGE_ID = /^[a-z]{2,8}(?:-[a-z0-9]{1,8})*$/i
const HINT_KEYS: readonly HintKey[] = [
  'shortcuts', 'interrupt', 'background', 'expand', 'collapse', 'history', 'cycleMode', 'acceptSuggestion',
]
const PACK_KEYS = ['id', 'name', 'running', 'completed', 'duration', 'hints', 'modes', 'notices', 'messages', 'command']

function object(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${field}: expected an object`)
  return value as Record<string, unknown>
}

function text(value: unknown, field: string): string {
  if (typeof value !== 'string') throw new Error(`${field}: expected a string`)
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value)) {
    throw new Error(`${field}: control characters are not allowed`)
  }
  return value
}

function dictionary(value: unknown, field: string, keys?: readonly string[]): Record<string, string> {
  const entries = Object.entries(object(value, field))
  for (const [key, entry] of entries) {
    if (keys && !keys.includes(key)) throw new Error(`${field}: unknown key ${key}`)
    text(entry, `${field}.${key}`)
  }
  return Object.fromEntries(entries) as Record<string, string>
}

/** 语言代码规范化；不将用户提供的文件路径当成代码转换。 */
export function canonicalLanguage(id: string): string {
  return id.split('-').map((part, index) => {
    if (index === 0) return part.toLowerCase()
    if (/^[a-z]{2}$/i.test(part)) return part.toUpperCase()
    if (/^[a-z]{4}$/i.test(part)) return part[0]!.toUpperCase() + part.slice(1).toLowerCase()
    return part.toLowerCase()
  }).join('-')
}

/** 配置支持语言代码或 JSON 路径；相对路径以插件目录为基准。 */
export function resolveSource(value: unknown, root: string): { source: string; path?: string; id?: string } {
  if (typeof value !== 'string' || !value.trim()) throw new Error('Expected a language code or JSON file path')
  let source = value.trim()
  if (source.startsWith('"') && source.endsWith('"')) source = source.slice(1, -1)
  if (LANGUAGE_ID.test(source)) {
    source = canonicalLanguage(source)
    return source === 'en'
      ? { source }
      : { source, path: `${root.replace(/[\\/]+$/u, '')}/locales/${source}.json`, id: source }
  }
  source = source.replace(/\\/g, '/')
  if (!/\.json$/i.test(source) || source.includes('://') || source.startsWith('~') || /[\u0000-\u001f]/u.test(source)) {
    throw new Error('Expected a language code or a local .json path (no URL or ~ expansion)')
  }
  const absolute = source.startsWith('/') || /^[a-z]:\//i.test(source)
  return { source, path: absolute ? source : `${root.replace(/[\\/]+$/u, '')}/${source}` }
}

/** JSON 只承载数据；校验后构造受限对象，不执行代码或接受匹配规则。 */
export function parseLanguagePack(content: string, expectedId?: string): LanguagePack {
  let parsed: unknown
  try {
    parsed = JSON.parse(content.replace(/^\uFEFF/u, ''))
  } catch {
    // 不转发 JSON.parse 的原文片段，避免错误消息泄露误选文件的内容。
    throw new Error('Invalid JSON')
  }
  const data = object(parsed, 'language pack')
  for (const key of Object.keys(data)) {
    if (!PACK_KEYS.includes(key)) throw new Error(`language pack: unknown field ${key}`)
  }
  const id = text(data.id, 'id')
  const name = text(data.name, 'name')
  if (!LANGUAGE_ID.test(id) || canonicalLanguage(id) === 'en') throw new Error('id: expected a language code other than reserved en')
  if (!name.trim()) throw new Error('name: must not be empty')
  if (expectedId && canonicalLanguage(id) !== expectedId) throw new Error('id: does not match the selected language code')
  const command = data.command === undefined ? {} : dictionary(data.command, 'command', Object.keys(ORIGINAL_PACK.command))
  const pack: LanguagePack = {
    id: canonicalLanguage(id), name,
    command: { ...ORIGINAL_PACK.command, ...command },
  }
  for (const key of ['running', 'completed', 'duration'] as const) {
    if (data[key] !== undefined) pack[key] = text(data[key], key)
  }
  if (pack.duration !== undefined && !pack.duration.includes('{duration}')) {
    throw new Error('duration: must include {duration}')
  }
  if (data.hints !== undefined) pack.hints = dictionary(data.hints, 'hints', HINT_KEYS)
  for (const key of ['modes', 'notices', 'messages'] as const) {
    if (data[key] !== undefined) pack[key] = dictionary(data[key], key)
  }
  return pack
}

/** 仅从文件名发现语言，不读取或解析其他包。 */
export function languageCodes(names: readonly string[]): string[] {
  const ids = names.filter(name => name.endsWith('.json')).map(name => name.slice(0, -5))
    .filter(id => LANGUAGE_ID.test(id) && id === canonicalLanguage(id) && id !== 'en')
    .map(canonicalLanguage)
  return ['en', ...new Set(ids.sort())]
}
