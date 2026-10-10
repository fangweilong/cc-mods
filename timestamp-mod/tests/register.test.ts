import { expect, test } from 'claude-code/testing'
import { DEFAULT_CONFIG, formatTimestamp, formatToolTiming, normalizeConfig } from '../hooks/register'

test('merges tool start, end and duration into one line', () => {
  const start = new Date(2026, 0, 2, 12, 55, 10, 0).getTime()
  expect(formatToolTiming({ startedAt: start })).toBe('[12:55:10] → running')
  expect(formatToolTiming({ startedAt: start, finishedAt: start + 3200 })).toBe('[12:55:10] → [12:55:13] · 3.2s')
})

test('formats supported timestamp tokens', () => {
  const value = new Date(2026, 0, 2, 3, 4, 5, 678).getTime()
  expect(formatTimestamp(value, 'YYYY/YY-MM-DD HH:mm:ss.SSS')).toBe('2026/26-01-02 03:04:05.678')
})

test('keeps literal format text and normalizes invalid configuration', () => {
  const value = new Date(2026, 0, 2, 3, 4, 5, 678).getTime()
  expect(formatTimestamp(value, '[HH] HH:mm')).toBe('[03] 03:04')
  expect(normalizeConfig(undefined)).toEqual(DEFAULT_CONFIG)
  expect(normalizeConfig({ enabled: false, format: 'YYYY-MM-DD' })).toEqual({ enabled: false, format: 'YYYY-MM-DD' })
  expect(normalizeConfig({ enabled: 'false', format: '' })).toEqual(DEFAULT_CONFIG)
})
