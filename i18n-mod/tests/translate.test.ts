import { expect, test } from 'claude-code/testing'
import { ORIGINAL_PACK as en } from '../hooks/original'
import { zhCN } from './fixtures'
import { formatMessage, translateCommand, translateConfig, translateExact, translateHint, translateNotice, translatePromptHint, translateSingleHint } from '../hooks/translate'

for (const [original, translated] of [
  ['? for shortcuts', '? 查看快捷键'],
  ['esc to interrupt', 'esc 中断'],
  ['(ctrl+b to run in background)', '(ctrl+b 转入后台运行)'],
  ['(alt+r to run in background)', '(alt+r 转入后台运行)'],
  ['ctrl+o to expand', 'ctrl+o 展开'],
  ['ctrl+o to collapse', 'ctrl+o 收起'],
  ['↑ for history', '↑ 查看历史'],
  ['shift+tab to cycle modes', 'shift+tab 切换模式'],
  ['(shift+tab to cycle)', '(shift+tab 切换模式)'],
  ['tab to accept suggestion', 'tab 接受建议'],
  ['  ? for shortcuts  ', '  ? 查看快捷键  '],
  ['? for shortcuts · esc to interrupt | custom hint', '? 查看快捷键 · esc 中断 | custom hint'],
  ['ctrl+o to expand  esc to interrupt', 'ctrl+o 展开  esc 中断'],
] as const) {
  test(`translates hint ${original} without changing the binding`, () => {
    expect(translateHint(original, zhCN)).toBe(translated)
    expect(translateHint(original, en)).toBe(original)
  })
}

test('only translates complete single-line hints for PromptHint', () => {
  expect(translateSingleHint('  ? for shortcuts  ', zhCN)).toBe('  ? 查看快捷键  ')
  expect(translateSingleHint('(alt+r to run in background)', zhCN)).toBe('(alt+r 转入后台运行)')
  expect(translateSingleHint('? for shortcuts', en)).toBe('? for shortcuts')
  expect(translateSingleHint('? for shortcuts', { ...zhCN, hints: {} })).toBe('? for shortcuts')
  for (const text of [
    '? for shortcuts · esc to interrupt',
    'ctrl+o to expand  esc to interrupt',
    '2 background tasks · esc to interrupt',
    '2 background tasks esc to interrupt',
    'custom hint | esc to interrupt',
    'custom hint • esc to interrupt',
    'esc to interrupt\n2 background tasks',
    'esc to interrupt\n',
    '\resc to interrupt',
  ]) {
    expect(translateSingleHint(text, zhCN)).toBe(text)
  }
})

test('translates verified static PromptHint fragments without losing separators or untranslated hints', () => {
  const text = 'install gh for PR status · esc to interrupt · ← for agents'
  expect(translatePromptHint(text, zhCN)).toBe('install gh for PR status · esc 中断 · ← for agents')
  expect(translatePromptHint(text, en)).toBe(text)
  expect(translatePromptHint('? for shortcuts  |  esc to interrupt', { ...zhCN, hints: { shortcuts: '快捷键' } }))
    .toBe('? 快捷键  |  esc to interrupt')
  expect(translatePromptHint(text, { ...zhCN, hints: {} })).toBe(text)
})

test('preserves task controls, links, unknown fragments and multiline PromptHint rows', () => {
  for (const text of [
    'install gh for PR status · 1 shell · esc to interrupt · ← for agents',
    '2 background tasks · esc to interrupt',
    'PR #123 · esc to interrupt · ← for agents',
    'custom hint | esc to interrupt',
    '← 1 agent · esc to interrupt',
    'esc to interrupt\n',
    'esc to interrupt\n2 background tasks',
  ]) {
    expect(translatePromptHint(text, zhCN)).toBe(text)
  }
})

test('preserves unknown hints, incomplete translations and arbitrary text', () => {
  for (const text of ['custom to expand', '/my-file to expand', '(esc to interrupt', 'esc to interrupt)', 'Run esc to interrupt now', '处理中', '']) {
    expect(translateHint(text, zhCN)).toBe(text)
    expect(translateSingleHint(text, zhCN)).toBe(text)
  }
  expect(translateHint('? for shortcuts', { ...zhCN, hints: {} })).toBe('? for shortcuts')
  expect(translateExact('unknown', zhCN.notices)).toBe('unknown')
  expect(translateExact('constructor', zhCN.notices)).toBe('constructor')
  expect(translateExact('__proto__', zhCN.notices)).toBe('__proto__')
  expect(translateExact('Welcome back!', zhCN.notices)).toBe('欢迎回来！')
})

test('matches notice prefixes and preserves dynamic suffixes', () => {
  expect(translateNotice('Update available: 2.1.301', zhCN.notices)).toBe('有可用更新: 2.1.301')
  expect(translateNotice('Update available for D:/work/project', zhCN.notices)).toBe('有可用更新 for D:/work/project')
  expect(translateNotice('Update availableXYZ', zhCN.notices)).toBe('Update availableXYZ')
  expect(translateNotice('Welcome back!', zhCN.notices)).toBe('欢迎回来！')
})

test('translates config labels and descriptions without changing missing fields', () => {
  const entries = {
    theme: { label: '主题', description: '选择配色主题' },
    tips: { label: '提示' },
    verbose: { description: '显示详细日志' },
  }
  expect(translateConfig('theme', 'Theme', 'Choose a theme', entries)).toEqual({ label: '主题', description: '选择配色主题' })
  expect(translateConfig('tips', 'Tips', 'Show tips', entries)).toEqual({ label: '提示', description: 'Show tips' })
  expect(translateConfig('verbose', 'Verbose', undefined, entries)).toEqual({ label: 'Verbose', description: '显示详细日志' })
  expect(translateConfig('unknown', 'Unknown', undefined, entries)).toEqual({ label: 'Unknown' })
})

test('translates slash command display fields and preserves missing ones', () => {
  const entries = {
    clear: { description: '清空会话', argumentHint: '[名称]' },
    compact: { description: '压缩会话' },
  }
  expect(translateCommand('clear', 'Clear', '[name]', entries)).toEqual({ description: '清空会话', argumentHint: '[名称]' })
  expect(translateCommand('compact', 'Compact', undefined, entries)).toEqual({ description: '压缩会话' })
  expect(translateCommand('unknown', 'Unknown', '[name]', entries)).toEqual({ description: 'Unknown', argumentHint: '[name]' })
  expect(translateCommand('constructor', 'Constructor', undefined, entries)).toEqual({ description: 'Constructor' })
})

test('preserves values, unknown placeholders and inherited property names', () => {
  const value = '$&' + String.fromCharCode(92) + 'en'
  expect(formatMessage('{language} / {missing}', { language: value })).toBe(value + ' / {missing}')
  expect(formatMessage('{constructor}', {})).toBe('{constructor}')
})
