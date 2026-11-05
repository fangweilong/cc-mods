import { expect, test } from 'claude-code/testing'

import { blockCells, contentKey, renderBlocks, resetBlockCache } from '../hooks/blocks'

const RGBA_2X2 =
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR42mP4z8DwHwgbGME0EAEAPeIHe2LfOEQAAAAASUVORK5CYII='

const RGBA = Uint8Array.of(
  255, 0, 0, 255,
  0, 255, 0, 128,
  0, 0, 255, 0,
  255, 255, 255, 255,
)

function words(cells: string): number[] {
  const bytes = Uint8Array.fromBase64(cells)
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const result: number[] = []
  for (let offset = 0; offset < bytes.length; offset += 4) {
    result.push(view.getUint32(offset, true))
  }
  return result
}

test('packs top and bottom pixels into one upper-half-block cell', () => {
  const cells = renderBlocks(RGBA, 2, 2, 1, 1, 0)
  expect(words(cells)).toEqual([0x2580, 0x00804000, 0x00808080])
})

test('maps columns to source columns and keeps background for transparent pixels', () => {
  const cells = renderBlocks(RGBA, 2, 2, 2, 1, 0)
  expect(words(cells)).toEqual([
    0x2580, 0xff0000, 0x000000,
    0x2580, 0x008000, 0xffffff,
  ])
})

test('uses COLORFGBG background for transparent pixels', () => {
  const cells = renderBlocks(RGBA, 2, 2, 2, 1, 0xffffff)
  expect(words(cells)[2]).toBe(0xffffff)
})

test('renders the fixture PNG through the cache and honours content keys', () => {
  resetBlockCache()
  const first = blockCells(RGBA_2X2, 'inline:fixture', 1, 1, 0)
  const second = blockCells(RGBA_2X2, 'inline:fixture', 1, 1, 0)
  expect(second).toBe(first)
  expect(words(first)).toEqual([0x2580, 0x00804000, 0x00808080])

  // 命中缓存时不触碰载荷：同一 key 下传入坏数据仍返回上次结果。
  expect(blockCells('not-base64', 'inline:fixture', 1, 1, 0)).toBe(first)

  resetBlockCache()
  const afterReset = blockCells(RGBA_2X2, 'inline:fixture', 1, 1, 0)
  expect(afterReset).toBe(first)

  resetBlockCache()
  expect(() => blockCells('not-base64', 'inline:fixture', 1, 1, 0)).toThrow()
})

test('content keys separate different payloads of equal length', () => {
  expect(contentKey('AAAA')).not.toBe(contentKey('AAAB'))
  expect(contentKey('AAAA')).toBe(contentKey('AAAA'))
})

test('rejects invalid grid sizes', () => {
  expect(() => renderBlocks(RGBA, 2, 2, 0, 1, 0)).toThrow('out of range')
  expect(() => renderBlocks(RGBA, 2, 2, 1, 257, 0)).toThrow('out of range')
})