import type { EngineInterface } from 'claude-code'
import { expect, test } from 'claude-code/testing'

import { DEFAULT_IMAGE_CONFIG, type ImageConfig } from '../hooks/config'
import {
  parseColorFgBg,
  resetImageSupport,
  resolveRenderKind,
  type ImageSupport,
} from '../hooks/detect'

function engine(env: Record<string, string> = {}): EngineInterface {
  return {
    env: { get: async (name: string) => env[name] },
  } as unknown as EngineInterface
}

function config(overrides: Partial<ImageConfig> = {}): ImageConfig {
  return { ...DEFAULT_IMAGE_CONFIG, ...overrides }
}

async function kind(
  support: ImageSupport,
  overrides: Partial<ImageConfig> = {},
  env: Record<string, string> = {},
): Promise<string> {
  resetImageSupport()
  return resolveRenderKind(engine(env), support, config(overrides))
}

test('auto falls back to blocks only for terminals without graphics', async () => {
  expect(await kind('unsupported')).toBe('blocks')
  expect(await kind('supported')).toBe('image')
  expect(await kind('unknown')).toBe('image')
})

test('blocks=off keeps the pre-existing hide behaviour', async () => {
  expect(await kind('unsupported', { blocks: 'off' })).toBe('none')
  expect(await kind('supported', { blocks: 'off' })).toBe('image')
})

test('blocks=on forces character cells everywhere', async () => {
  expect(await kind('supported', { blocks: 'on' })).toBe('blocks')
  expect(await kind('unknown', { blocks: 'on' })).toBe('blocks')
})

test('dumb terminals never fall back to coloured cells', async () => {
  expect(await kind('unsupported', {}, { TERM: 'dumb' })).toBe('none')
  expect(await kind('unsupported', { blocks: 'on' }, { TERM: 'dumb' })).toBe('none')
})

test('disabled plugin and mode=off draw nothing', async () => {
  expect(await kind('supported', { enabled: false })).toBe('none')
  expect(await kind('unsupported', { mode: 'off' })).toBe('none')
})

test('CC_TERMINAL_IMAGE off wins over every renderer', async () => {
  expect(await kind('unsupported', { blocks: 'on' }, { CC_TERMINAL_IMAGE: 'off' })).toBe('none')
})

test('CC_TERMINAL_IMAGE on keeps the native element', async () => {
  expect(await kind('supported', {}, { CC_TERMINAL_IMAGE: 'on' })).toBe('image')
})

test('reads the terminal background from COLORFGBG', () => {
  expect(parseColorFgBg(undefined)).toBe(0x000000)
  expect(parseColorFgBg('15;0')).toBe(0x000000)
  expect(parseColorFgBg('0;15')).toBe(0xffffff)
  expect(parseColorFgBg('15;4')).toBe(0x000080)
  expect(parseColorFgBg('15;99')).toBe(0x000000)
  expect(parseColorFgBg('nonsense')).toBe(0x000000)
})