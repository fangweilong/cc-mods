import { expect, test } from 'claude-code/testing'
import { DEFAULT_SOURCE, canonicalLanguage, languageCodes, parseLanguagePack, resolveSource } from '../hooks/language'
import { ORIGINAL_PACK } from '../hooks/original'
import { JA_DATA, ZH_DATA } from './fixtures'

const ROOT = 'D:/mods/i18n-mod'

test('resolves language codes without a hardcoded registry', () => {
  expect(DEFAULT_SOURCE).toBe('zh-CN')
  expect(resolveSource(' ZH-cn ', ROOT)).toEqual({ source: 'zh-CN', path: `${ROOT}/locales/zh-CN.json`, id: 'zh-CN' })
  expect(resolveSource('ja', ROOT)).toEqual({ source: 'ja', path: `${ROOT}/locales/ja.json`, id: 'ja' })
  expect(resolveSource(' EN ', ROOT)).toEqual({ source: 'en' })
  expect(canonicalLanguage('zh-hans-cn')).toBe('zh-Hans-CN')
})

test('resolves plugin-relative, Windows and Unix absolute JSON paths', () => {
  expect(resolveSource('./packs/ja.json', ROOT)).toEqual({ source: './packs/ja.json', path: `${ROOT}/./packs/ja.json` })
  expect(resolveSource('../lang/ja.json', ROOT).path).toBe(`${ROOT}/../lang/ja.json`)
  expect(resolveSource('"D:/Lang files/ja.json"', ROOT)).toEqual({ source: 'D:/Lang files/ja.json', path: 'D:/Lang files/ja.json' })
  expect(resolveSource(['D:', 'Lang files', 'ja.json'].join(String.fromCharCode(92)), ROOT).path).toBe('D:/Lang files/ja.json')
  expect(resolveSource('/opt/lang/ja.json', ROOT).path).toBe('/opt/lang/ja.json')
})

for (const source of ['', 'https://example.com/ja.json', '~/ja.json', 'ja.toml', 'ja.ts', null, 42, 'ja.json\nextra']) {
  test(`rejects invalid source ${String(source)}`, () => {
    expect(() => resolveSource(source, ROOT)).toThrow()
  })
}

test('discovers codes from filenames without reading language data', () => {
  expect(languageCodes(['ja.json', 'zh-CN.json', 'de.json', 'en.json', 'index.ts', 'bad.name.json', 'not-a-code.txt', 'ja.JSON', 'ZH-cn.json'])).toEqual(['en', 'de', 'ja', 'zh-CN'])
})

test('parses a minimal new language without editing code or manifest', () => {
  const pack = parseLanguagePack(JSON.stringify(JA_DATA), 'ja')
  expect(pack.id).toBe('ja')
  expect(pack.hints?.shortcuts).toBe('ショートカット')
  expect(pack.command).toEqual(ORIGINAL_PACK.command)
  expect(pack.running).toBeUndefined()
  expect(pack.preserveOriginal).toBeUndefined()
})

test('supports BOM and partial command translations with original-text fallback', () => {
  const pack = parseLanguagePack(String.fromCharCode(0xfeff) + JSON.stringify(ZH_DATA), 'zh-CN')
  expect(pack.command.current).toBe('当前界面语言：{language}')
  expect(pack.command.description).toBe(ORIGINAL_PACK.command.description)
  expect(pack.hints?.interrupt).toBe('中断')
})

for (const value of [
  null, [], {}, { id: 'en', name: 'Reserved' }, { id: '../ja', name: 'Bad' }, { id: 'ja', name: '' },
  { ...JA_DATA, running: 1 }, { ...JA_DATA, completed: false }, { ...JA_DATA, duration: [] },
  { ...JA_DATA, duration: '{word}' }, { ...JA_DATA, hints: [] }, { ...JA_DATA, hints: { shortcuts: 1 } },
  { ...JA_DATA, hints: { typo: 'value' } }, { ...JA_DATA, modes: { focus: null } },
  { ...JA_DATA, notices: true }, { ...JA_DATA, messages: { Thinking: { bad: true } } },
  { ...JA_DATA, command: { current: [] } }, { ...JA_DATA, command: { typo: 'value' } },
  { ...JA_DATA, preserveOriginal: true }, { ...JA_DATA, spinnerWords: ['Working'] },
  { ...JA_DATA, name: 'Bad' + String.fromCharCode(27) },
]) {
  test(`rejects invalid language data ${JSON.stringify(value)}`, () => {
    expect(() => parseLanguagePack(JSON.stringify(value))).toThrow()
  })
}

test('rejects mismatched ids and hides source content in JSON syntax errors', () => {
  expect(() => parseLanguagePack(JSON.stringify(JA_DATA), 'de')).toThrow()
  expect(() => parseLanguagePack('{ secret-token')).toThrow('Invalid JSON')
})

test('keeps dictionary keys as data without prototype inheritance', () => {
  const pack = parseLanguagePack('{"id":"ja","name":"日本語","messages":{"__proto__":"literal","constructor":"literal"}}')
  expect(Object.prototype.hasOwnProperty.call(pack.messages, '__proto__')).toBe(true)
  expect(pack.messages?.constructor).toBe('literal')
})
