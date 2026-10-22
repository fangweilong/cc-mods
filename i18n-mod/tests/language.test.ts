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
  expect(pack.tools?.['Run a shell command']).toBe('运行 Shell 命令')
})

test('parses optional config row translations with per-field fallback', () => {
  const pack = parseLanguagePack(JSON.stringify({
    ...JA_DATA,
    tools: { 'Run a shell command': '运行 Shell 命令' },
    config: { theme: { label: '主题', description: '选择配色主题' }, tips: { description: '显示提示' } },
  }))
  expect(pack.tools).toEqual({ 'Run a shell command': '运行 Shell 命令' })
  expect(pack.config).toEqual({
    theme: { label: '主题', description: '选择配色主题' },
    tips: { description: '显示提示' },
  })
})

test('parses slash command translations with per-field fallback', () => {
  const pack = parseLanguagePack(JSON.stringify({
    ...JA_DATA,
    commands: { clear: { description: '清空会话', argumentHint: '[名称]' }, compact: { description: '压缩会话' } },
  }))
  expect(pack.commands).toEqual({
    clear: { description: '清空会话', argumentHint: '[名称]' },
    compact: { description: '压缩会话' },
  })
})

for (const value of [
  null, [], {}, { id: 'en', name: 'Reserved' }, { id: '../ja', name: 'Bad' }, { id: 'ja', name: '' },
  { ...JA_DATA, running: 1 }, { ...JA_DATA, completed: false }, { ...JA_DATA, duration: [] },
  { ...JA_DATA, duration: '{word}' }, { ...JA_DATA, hints: [] }, { ...JA_DATA, hints: { shortcuts: 1 } },
  { ...JA_DATA, hints: { typo: 'value' } }, { ...JA_DATA, modes: { focus: null } },
  { ...JA_DATA, notices: true }, { ...JA_DATA, messages: { Thinking: { bad: true } } }, { ...JA_DATA, tools: { Bash: 1 } },
  { ...JA_DATA, config: { theme: { options: [] } } },
  { ...JA_DATA, config: [] }, { ...JA_DATA, config: { theme: [] } },
  { ...JA_DATA, config: { theme: { unknown: 'value' } } },
  { ...JA_DATA, config: { theme: { label: 1 } } }, { ...JA_DATA, config: { theme: { description: false } } },
  { ...JA_DATA, commands: [] }, { ...JA_DATA, commands: { clear: [] } },
  { ...JA_DATA, commands: { clear: { unknown: 'value' } } },
  { ...JA_DATA, commands: { clear: { description: 1 } } }, { ...JA_DATA, commands: { 'bad/name': { description: 'x' } } },
  { ...JA_DATA, commands: { clear: { argumentHint: false } } },
  { ...JA_DATA, command: { current: [] } }, { ...JA_DATA, command: { typo: 'value' } },
  { ...JA_DATA, preserveOriginal: true }, { ...JA_DATA, spinnerWords: ['Working'] },
  { ...JA_DATA, name: 'Bad' + String.fromCharCode(27) },
]) {
  test(`rejects invalid language data ${JSON.stringify(value)}`, () => {
    expect(() => parseLanguagePack(JSON.stringify(value))).toThrow()
  })
}

test('loads the optional turn-duration elapsed template without changing legacy fields', () => {
  const pack = parseLanguagePack(JSON.stringify({
    ...ZH_DATA,
    turnDuration: { elapsed: '本轮用时 {duration}（{duration}）' },
  }))
  expect(pack).toEqual({
    ...parseLanguagePack(JSON.stringify(ZH_DATA)),
    turnDuration: { elapsed: '本轮用时 {duration}（{duration}）' },
  })
})

test('loads legacy packs without mapping completed or duration into turnDuration', () => {
  const pack = parseLanguagePack(JSON.stringify(ZH_DATA))
  expect(pack.completed).toBe(ZH_DATA.completed)
  expect(pack.duration).toBe(ZH_DATA.duration)
  expect(Object.prototype.hasOwnProperty.call(pack, 'turnDuration')).toBe(false)
})

test('allows a missing elapsed template for whole-line native fallback without legacy mapping', () => {
  expect(parseLanguagePack(JSON.stringify({ ...ZH_DATA, turnDuration: {} }))).toEqual({
    ...parseLanguagePack(JSON.stringify(ZH_DATA)),
    turnDuration: {},
  })
})

for (const turnDuration of [null, [], '本轮用时 {duration}', false, 42]) {
  test(`rejects a non-object turnDuration namespace ${JSON.stringify(turnDuration)}`, () => {
    expect(() => parseLanguagePack(JSON.stringify({ ...JA_DATA, turnDuration }))).toThrow('turnDuration: expected an object')
  })
}

for (const elapsed of [null, [], {}, false, 42]) {
  test(`rejects a non-string elapsed template ${JSON.stringify(elapsed)}`, () => {
    expect(() => parseLanguagePack(JSON.stringify({ ...JA_DATA, turnDuration: { elapsed } }))).toThrow('turnDuration.elapsed: expected a string')
  })
}

for (const elapsed of ['', ' \t\n', '本轮用时', '{word}', 'secret-template']) {
  test(`rejects an elapsed template without duration ${JSON.stringify(elapsed)}`, () => {
    expect(() => parseLanguagePack(JSON.stringify({ ...JA_DATA, turnDuration: { elapsed } }))).toThrow('turnDuration.elapsed: must include {duration}')
  })
}

for (const elapsed of [
  '{duration} {word}', '{duration} {doneAt}', '{duration} {budget}', '{duration} { duration }',
  '{duration} ${secret-expression}', '{{duration}}', '{duration} {', '{duration} }',
]) {
  test(`rejects unknown or malformed elapsed placeholders ${JSON.stringify(elapsed)}`, () => {
    expect(() => parseLanguagePack(JSON.stringify({ ...JA_DATA, turnDuration: { elapsed } }))).toThrow('turnDuration.elapsed: only {duration} is allowed')
  })
}

for (const code of [0, 8, 11, 12, 27, 31, 127]) {
  test(`rejects unsafe control character ${code} in elapsed templates`, () => {
    const elapsed = `secret-template {duration}${String.fromCharCode(code)}`
    expect(() => parseLanguagePack(JSON.stringify({ ...JA_DATA, turnDuration: { elapsed } }))).toThrow('turnDuration.elapsed: control characters are not allowed')
  })
}

for (const key of ['doneAt', 'budget', 'waiting', 'completed', '__proto__', 'secret-file-content']) {
  test(`rejects unsupported turn-duration template keys without disclosing them: ${key}`, () => {
    const turnDuration = { elapsed: '本轮用时 {duration}', [key]: 'secret-template' }
    expect(() => parseLanguagePack(JSON.stringify({ ...JA_DATA, turnDuration }))).toThrow('turnDuration: unknown template key')
  })
}

test('keeps legacy completed and duration validation even when elapsed is valid', () => {
  for (const fields of [
    { completed: false }, { completed: `secret${String.fromCharCode(27)}` },
    { duration: [] }, { duration: '{word}' }, { duration: `{duration}${String.fromCharCode(0)}` },
  ]) {
    expect(() => parseLanguagePack(JSON.stringify({
      ...JA_DATA, ...fields, turnDuration: { elapsed: '本轮用时 {duration}' },
    }))).toThrow()
  }
})

test('rejects mismatched ids and hides source content in JSON syntax errors', () => {
  expect(() => parseLanguagePack(JSON.stringify(JA_DATA), 'de')).toThrow()
  expect(() => parseLanguagePack('{ secret-token')).toThrow('Invalid JSON')
})

test('keeps dictionary keys as data without prototype inheritance', () => {
  const pack = parseLanguagePack('{"id":"ja","name":"日本語","messages":{"__proto__":"literal","constructor":"literal"}}')
  expect(Object.prototype.hasOwnProperty.call(pack.messages, '__proto__')).toBe(true)
  expect(pack.messages?.constructor).toBe('literal')
})
