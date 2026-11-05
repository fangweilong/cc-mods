import { expect, test } from 'claude-code/testing'

import { inflateZlib } from '../hooks/inflate'
import { decodePng, PngError } from '../hooks/png-decode'

const RGBA_2X2 =
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR42mP4z8DwHwgbGME0EAEAPeIHe2LfOEQAAAAASUVORK5CYII='
const RGB_16 =
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAABEAIAAAAr0DSeAAAABnRSTlMAAQACAAPJS6v1AAAAFUlEQVR42mNhYGRgYmD+/5+RgYEBAAtsAgrKHuEBAAAAAElFTkSuQmCC'
const PALETTE =
  'iVBORw0KGgoAAAANSUhEUgAAAAQAAAABAgMAAACEUudeAAAACVBMVEX/AAAA/wAAAP8tSs2KAAAAAnRSTlMAgJsrThgAAAAKSURBVHjaY5YEAAAhAB1XEjf/AAAAAElFTkSuQmCC'
const GRAY_1 =
  'iVBORw0KGgoAAAANSUhEUgAAAAgAAAABAQAAAADLe9LuAAAACklEQVR42mPaCAAAtwC09e83hwAAAABJRU5ErkJggg=='
const GRAY_16 =
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAABEAAAAACB2fwVAAAADUlEQVR42mMQMvn/HwAD5gJF8RyEZQAAAABJRU5ErkJggg=='
const INTERLACED =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAFoEvQfAAAAAUlEQVR4duaE5gAAAABJRU5ErkJggg=='
const OVERSIZED =
  'iVBORw0KGgoAAAANSUhEUgAAE4gAABOICAYAAABdmIfLAAAAAUlEQVR4duaE5gAAAABJRU5ErkJggg=='
const CORRUPT =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNgZGJmAQAAAAAAAAAAAAAAAAAAAAAAAAAAAA=='

const REAL_64 =
  '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'

const ZLIB = {
  stored: 'eAEBCQD2/2FiY2FiY2FiYxE9A3M=',
  fixed: 'eAFzdBwFxIYAAMueTC0=',
  dynamic: 'eNrLSM3JyVfIQCcBaAMIsQ==',
}
const TEXT = {
  stored: 'abcabcabc',
  fixed: 'A'.repeat(300),
  dynamic: 'hello hello hello hello',
}

function bytes(base64: string): Uint8Array {
  return Uint8Array.fromBase64(base64)
}

test('inflates stored, fixed and dynamic deflate blocks', () => {
  for (const kind of ['stored', 'fixed', 'dynamic'] as const) {
    const output = inflateZlib(bytes(ZLIB[kind]), 4096)
    expect(new TextDecoder().decode(output)).toBe(TEXT[kind])
  }
})

test('refuses inflate output beyond the caller limit', () => {
  expect(() => inflateZlib(bytes(ZLIB.fixed), 10)).toThrow('exceeds limit')
})

test('decodes RGBA rows with Sub filtering', () => {
  const image = decodePng(bytes(RGBA_2X2))
  expect(image.width).toBe(2)
  expect(image.height).toBe(2)
  expect([...image.rgba]).toEqual([
    255, 0, 0, 255, 0, 255, 0, 128, 0, 0, 255, 0, 255, 255, 255, 255,
  ])
})

test('decodes 16-bit RGB and applies a tRNS key', () => {
  const image = decodePng(bytes(RGB_16))
  expect([...image.rgba]).toEqual([0, 0, 0, 0, 255, 1, 0, 255])
})

test('decodes indexed PNG through PLTE and tRNS', () => {
  const image = decodePng(bytes(PALETTE))
  expect([...image.rgba]).toEqual([
    255, 0, 0, 0, 0, 255, 0, 128, 0, 0, 255, 255, 0, 255, 0, 128,
  ])
})

test('decodes sub-byte grayscale', () => {
  const image = decodePng(bytes(GRAY_1))
  expect([...image.rgba]).toEqual([
    255, 255, 255, 255, 0, 0, 0, 255, 255, 255, 255, 255, 255, 255, 255, 255, 0, 0, 0, 255,
    0, 0, 0, 255, 0, 0, 0, 255, 255, 255, 255, 255,
  ])
})

test('decodes 16-bit grayscale to the high byte', () => {
  const image = decodePng(bytes(GRAY_16))
  expect([...image.rgba]).toEqual([0x12, 0x12, 0x12, 255, 0xff, 0xff, 0xff, 255])
})

test('decodes a real Pillow PNG with adaptive filters', async () => {
  const image = decodePng(bytes(REAL_64))
  expect(image.width).toBe(64)
  expect(image.height).toBe(64)
  const digest = await crypto.subtle.digest('SHA-256', image.rgba)
  const hex = [...new Uint8Array(digest)]
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('')
  expect(hex).toBe('a04eb171dac963daeb1dca20c9cf64744ddc47be9d2d02e5db43e65a9997a972')
})

test('rejects interlaced, oversized and corrupt PNGs', () => {
  expect(() => decodePng(bytes(INTERLACED))).toThrow('interlaced')
  expect(() => decodePng(bytes(OVERSIZED))).toThrow('pixel limit')
  expect(() => decodePng(bytes(CORRUPT))).toThrow(PngError)
})