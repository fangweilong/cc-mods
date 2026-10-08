import { expect, test } from 'claude-code/testing'
import { ORIGINAL_PACK as en } from '../hooks/original'
import { zhCN } from './fixtures'
import { formatDuration, formatMessage, translateExact, translateHint } from '../hooks/translate'

for (const [original, translated] of [
  ['? for shortcuts', '? 查看快捷键'],
  ['esc to interrupt', 'esc 中断'],
  ['(ctrl+b to run in background)', '(ctrl+b 转入后台运行)'],
  ['(alt+r to run in background)', '(alt+r 转入后台运行)'],
  ['ctrl+o to expand', 'ctrl+o 展开'],
  ['ctrl+o to collapse', 'ctrl+o 收起'],
  ['↑ for history', '↑ 查看历史'],
  ['shift+tab to cycle modes', 'shift+tab 切换模式'],
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

test('preserves unknown hints, incomplete translations and arbitrary text', () => {
  for (const text of ['custom to expand', '/my-file to expand', '(esc to interrupt', 'esc to interrupt)', 'Run esc to interrupt now', '处理中', '']) {
    expect(translateHint(text, zhCN)).toBe(text)
  }
  expect(translateHint('? for shortcuts', { ...zhCN, hints: {} })).toBe('? for shortcuts')
  expect(translateExact('unknown', zhCN.notices)).toBe('unknown')
  expect(translateExact('constructor', zhCN.notices)).toBe('constructor')
  expect(translateExact('__proto__', zhCN.notices)).toBe('__proto__')
  expect(translateExact('Welcome back!', zhCN.notices)).toBe('欢迎回来！')
})

test('preserves values, unknown placeholders and inherited property names', () => {
  const value = '$&' + String.fromCharCode(92) + 'en'
  expect(formatMessage('{language} / {missing}', { language: value })).toBe(value + ' / {missing}')
  expect(formatMessage('{constructor}', {})).toBe('{constructor}')
})

test('formats short, long and invalid durations', () => {
  expect(formatDuration(0)).toBe('0s')
  expect(formatDuration(3599)).toBe('3s')
  expect(formatDuration(64000)).toBe('1m 4s')
  expect(formatDuration(3661000)).toBe('1h 1m 1s')
  expect(formatDuration(-1000)).toBe('0s')
  expect(formatDuration(Infinity)).toBe('0s')
  expect(formatDuration(NaN)).toBe('0s')
})
