/**
 * 纯 TypeScript 的 PNG 解码，输出 RGBA8 像素。
 *
 * 只覆盖终端图片会遇到的静态 PNG：非隔行、标准颜色类型；
 * 16 位样本取高字节降到 8 位。隔行、非法块和超限尺寸直接拒绝。
 */

import { InflateError, inflateZlib } from './inflate'

export type DecodedPng = {
  width: number
  height: number
  rgba: Uint8Array
}

export class PngError extends Error {}

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const
const MAX_PIXELS = 16_777_216
const MAX_RGBA_BYTES = 64 * 1024 * 1024

const CHANNELS: Record<number, number> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }
const ALLOWED_DEPTHS: Record<number, readonly number[]> = {
  0: [1, 2, 4, 8, 16],
  2: [8, 16],
  3: [1, 2, 4, 8],
  4: [8, 16],
  6: [8, 16],
}

function readUint32(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset]! << 24) |
      (bytes[offset + 1]! << 16) |
      (bytes[offset + 2]! << 8) |
      bytes[offset + 3]!) >>>
    0
  )
}

function chunkType(bytes: Uint8Array, offset: number): string {
  return String.fromCharCode(
    bytes[offset]!,
    bytes[offset + 1]!,
    bytes[offset + 2]!,
    bytes[offset + 3]!,
  )
}

function paeth(left: number, up: number, upLeft: number): number {
  const estimate = left + up - upLeft
  const distanceLeft = Math.abs(estimate - left)
  const distanceUp = Math.abs(estimate - up)
  const distanceUpLeft = Math.abs(estimate - upLeft)
  if (distanceLeft <= distanceUp && distanceLeft <= distanceUpLeft) return left
  return distanceUp <= distanceUpLeft ? up : upLeft
}

/** 逐行反滤波，原地修改解压后的数据。 */
function unfilter(data: Uint8Array, height: number, rowBytes: number, bpp: number): void {
  const stride = rowBytes + 1
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * stride + 1
    const filter = data[y * stride]!
    const priorStart = rowStart - stride

    for (let x = 0; x < rowBytes; x += 1) {
      const index = rowStart + x
      const left = x >= bpp ? data[index - bpp]! : 0
      const up = y > 0 ? data[priorStart + x]! : 0
      const upLeft = y > 0 && x >= bpp ? data[priorStart + x - bpp]! : 0

      let value = data[index]!
      switch (filter) {
        case 0:
          break
        case 1:
          value += left
          break
        case 2:
          value += up
          break
        case 3:
          value += (left + up) >> 1
          break
        case 4:
          value += paeth(left, up, upLeft)
          break
        default:
          throw new PngError(`unsupported PNG filter ${filter}`)
      }
      data[index] = value & 0xff
    }
  }
}

function sampleAt(row: Uint8Array, rowStart: number, index: number, depth: number): number {
  if (depth === 8) return row[rowStart + index]!
  const bit = index * depth
  const byte = row[rowStart + (bit >> 3)]!
  const shift = 8 - depth - (bit & 7)
  return (byte >> shift) & ((1 << depth) - 1)
}

type Palette = {
  rgb: Uint8Array
  alpha: Uint8Array | undefined
}

function toRgba(
  data: Uint8Array,
  width: number,
  height: number,
  rowBytes: number,
  depth: number,
  colorType: number,
  trns: Uint8Array | undefined,
  palette: Palette | undefined,
): Uint8Array {
  const output = new Uint8Array(width * height * 4)
  const stride = rowBytes + 1
  const channels = CHANNELS[colorType]!
  const scale = depth < 8 ? 255 / ((1 << depth) - 1) : 1
  const trnsGray = colorType === 0 && trns && trns.length >= 2 ? (trns[0]! << 8) | trns[1]! : undefined
  const trnsRgb =
    colorType === 2 && trns && trns.length >= 6
      ? [(trns[0]! << 8) | trns[1]!, (trns[2]! << 8) | trns[3]!, (trns[4]! << 8) | trns[5]!]
      : undefined

  let out = 0
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * stride + 1
    const row = data
    for (let x = 0; x < width; x += 1) {
      if (colorType === 0) {
        const raw =
          depth === 16
            ? (row[rowStart + x * 2]! << 8) | row[rowStart + x * 2 + 1]!
            : sampleAt(row, rowStart, x, depth)
        const value = depth === 16 ? raw >> 8 : Math.round(raw * scale)
        output[out] = value
        output[out + 1] = value
        output[out + 2] = value
        output[out + 3] = trnsGray !== undefined && raw === trnsGray ? 0 : 255
        out += 4
        continue
      }

      if (colorType === 2) {
        const offset = rowStart + x * channels * (depth === 16 ? 2 : 1)
        const r = depth === 16 ? (row[offset]! << 8) | row[offset + 1]! : row[offset]!
        const g = depth === 16 ? (row[offset + 2]! << 8) | row[offset + 3]! : row[offset + 1]!
        const b = depth === 16 ? (row[offset + 4]! << 8) | row[offset + 5]! : row[offset + 2]!
        output[out] = depth === 16 ? r >> 8 : r
        output[out + 1] = depth === 16 ? g >> 8 : g
        output[out + 2] = depth === 16 ? b >> 8 : b
        const transparent =
          trnsRgb !== undefined && trnsRgb[0] === r && trnsRgb[1] === g && trnsRgb[2] === b
        output[out + 3] = transparent ? 0 : 255
        out += 4
        continue
      }

      if (colorType === 3) {
        if (!palette) throw new PngError('indexed PNG is missing PLTE')
        const index = sampleAt(row, rowStart, x, depth)
        if (index * 3 + 2 >= palette.rgb.length) throw new PngError('palette index out of range')
        output[out] = palette.rgb[index * 3]!
        output[out + 1] = palette.rgb[index * 3 + 1]!
        output[out + 2] = palette.rgb[index * 3 + 2]!
        output[out + 3] = palette.alpha && index < palette.alpha.length ? palette.alpha[index]! : 255
        out += 4
        continue
      }

      if (colorType === 4) {
        const offset = rowStart + x * 2 * (depth === 16 ? 2 : 1)
        const gray = row[offset]!
        output[out] = gray
        output[out + 1] = gray
        output[out + 2] = gray
        output[out + 3] = depth === 16 ? row[offset + 2]! : row[offset + 1]!
        out += 4
        continue
      }

      // colorType === 6
      const offset = rowStart + x * 4 * (depth === 16 ? 2 : 1)
      if (depth === 16) {
        output[out] = row[offset]!
        output[out + 1] = row[offset + 2]!
        output[out + 2] = row[offset + 4]!
        output[out + 3] = row[offset + 6]!
      } else {
        output[out] = row[offset]!
        output[out + 1] = row[offset + 1]!
        output[out + 2] = row[offset + 2]!
        output[out + 3] = row[offset + 3]!
      }
      out += 4
    }
  }
  return output
}

/** 解码一张静态 PNG；不支持或损坏时抛出 PngError。 */
export function decodePng(bytes: Uint8Array): DecodedPng {
  if (bytes.length < 8 + 25 + 12) throw new PngError('PNG is too short')
  for (let index = 0; index < SIGNATURE.length; index += 1) {
    if (bytes[index] !== SIGNATURE[index]) throw new PngError('not a PNG')
  }

  let width = 0
  let height = 0
  let depth = 0
  let colorType = -1
  let palette: Palette | undefined
  let trns: Uint8Array | undefined
  const idat: Uint8Array[] = []
  let idatLength = 0
  let sawHeader = false
  let sawEnd = false

  let offset = 8
  while (offset + 12 <= bytes.length) {
    const length = readUint32(bytes, offset)
    const type = chunkType(bytes, offset + 4)
    const dataStart = offset + 8
    const dataEnd = dataStart + length
    const next = dataEnd + 4
    if (next > bytes.length) throw new PngError(`truncated ${type} chunk`)
    const chunk = bytes.subarray(dataStart, dataEnd)

    if (!sawHeader && type !== 'IHDR') throw new PngError('PNG does not start with IHDR')

    switch (type) {
      case 'IHDR': {
        if (sawHeader || length !== 13) throw new PngError('invalid IHDR')
        sawHeader = true
        width = readUint32(bytes, dataStart)
        height = readUint32(bytes, dataStart + 4)
        depth = bytes[dataStart + 8]!
        colorType = bytes[dataStart + 9]!
        const compression = bytes[dataStart + 10]!
        const filter = bytes[dataStart + 11]!
        const interlace = bytes[dataStart + 12]!
        if (width <= 0 || height <= 0) throw new PngError('PNG dimensions must be positive')
        if (width * height > MAX_PIXELS) throw new PngError('PNG exceeds the pixel limit')
        if (width * height * 4 > MAX_RGBA_BYTES) throw new PngError('PNG exceeds the decode limit')
        if (!(colorType in CHANNELS) || !ALLOWED_DEPTHS[colorType]!.includes(depth)) {
          throw new PngError('unsupported PNG color type or bit depth')
        }
        if (compression !== 0 || filter !== 0) throw new PngError('unsupported PNG compression or filter')
        if (interlace !== 0) throw new PngError('interlaced PNG is unsupported')
        break
      }
      case 'PLTE': {
        if (length % 3 !== 0 || length === 0 || length > 768) throw new PngError('invalid PLTE')
        palette = { rgb: chunk, alpha: undefined }
        break
      }
      case 'tRNS': {
        trns = chunk
        break
      }
      case 'IDAT': {
        idat.push(chunk)
        idatLength += chunk.length
        break
      }
      case 'IEND': {
        sawEnd = true
        break
      }
      default:
        // 未知的关键块（首字母大写）无法安全忽略；辅助块跳过。
        if (type.charCodeAt(0) < 0x61) throw new PngError(`unsupported critical chunk ${type}`)
        break
    }

    offset = next
    if (sawEnd) break
  }

  if (!sawHeader) throw new PngError('PNG is missing IHDR')
  if (idat.length === 0) throw new PngError('PNG is missing IDAT')

  if (colorType === 3) {
    if (!palette) throw new PngError('indexed PNG is missing PLTE')
    if (trns && trns.length > 0) palette = { rgb: palette.rgb, alpha: trns }
  }

  const channels = CHANNELS[colorType]!
  const bitsPerPixel = channels * depth
  const rowBytes = Math.ceil((width * bitsPerPixel) / 8)
  const bpp = Math.max(1, Math.ceil(bitsPerPixel / 8))
  const expected = height * (rowBytes + 1)
  if (expected > MAX_RGBA_BYTES * 2 + height) throw new PngError('PNG data exceeds the inflate limit')

  const compressed = new Uint8Array(idatLength)
  let cursor = 0
  for (const chunk of idat) {
    compressed.set(chunk, cursor)
    cursor += chunk.length
  }

  let inflated: Uint8Array
  try {
    inflated = inflateZlib(compressed, expected)
  } catch (error) {
    throw new PngError(error instanceof InflateError ? error.message : 'PNG inflate failed')
  }
  if (inflated.length !== expected) throw new PngError('PNG data length mismatch')

  unfilter(inflated, height, rowBytes, bpp)
  const rgba = toRgba(inflated, width, height, rowBytes, depth, colorType, trns, palette)
  return { width, height, rgba }
}