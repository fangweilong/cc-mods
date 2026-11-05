/**
 * 用 `<Raster>` 的单元格网格渲染图片：每格 `▀`，前景是上像素，背景是下像素。
 * 只保留最终 `cells`，避免每次重绘都重新解压和采样。
 */

import { decodePng } from './png-decode'

const MAX_COLUMNS = 512
const MAX_ROWS = 256
const MAX_CACHE = 32
const UPPER_HALF_BLOCK = 0x2580
const BASE64 =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

export class BlockError extends Error {}

const cache = new Map<string, string>()

/** 内联图片的内容键：长度 + FNV-1a，不把整串 base64 留在缓存键里。 */
export function contentKey(base64: string): string {
  let hash = 0x811c9dc5
  for (let index = 0; index < base64.length; index += 1) {
    hash ^= base64.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return `${base64.length.toString(36)}:${(hash >>> 0).toString(36)}`
}

function base64Encode(bytes: Uint8Array): string {
  let output = ''
  let index = 0
  for (; index + 2 < bytes.length; index += 3) {
    const value = (bytes[index]! << 16) | (bytes[index + 1]! << 8) | bytes[index + 2]!
    output +=
      BASE64[(value >> 18) & 63]! +
      BASE64[(value >> 12) & 63]! +
      BASE64[(value >> 6) & 63]! +
      BASE64[value & 63]!
  }
  const remaining = bytes.length - index
  if (remaining === 1) {
    const value = bytes[index]! << 16
    output += `${BASE64[(value >> 18) & 63]!}${BASE64[(value >> 12) & 63]!}==`
  } else if (remaining === 2) {
    const value = (bytes[index]! << 16) | (bytes[index + 1]! << 8)
    output += `${BASE64[(value >> 18) & 63]!}${BASE64[(value >> 12) & 63]!}${BASE64[(value >> 6) & 63]!}=`
  }
  return output
}

function writeUint32(target: Uint8Array, offset: number, value: number): void {
  target[offset] = value & 0xff
  target[offset + 1] = (value >>> 8) & 0xff
  target[offset + 2] = (value >>> 16) & 0xff
  target[offset + 3] = (value >>> 24) & 0xff
}

type Box = {
  startX: number
  endX: number
  startY: number
  endY: number
}

type Color = { red: number; green: number; blue: number }

function boxFor(index: number, target: number, source: number): [number, number] {
  if (target >= source) {
    const at = Math.min(source - 1, Math.floor(((index + 0.5) * source) / target))
    return [at, at + 1]
  }
  const start = Math.floor((index * source) / target)
  const end = Math.max(start + 1, Math.ceil(((index + 1) * source) / target))
  return [start, Math.min(source, end)]
}

function sample(
  rgba: Uint8Array,
  width: number,
  height: number,
  box: Box,
  background: number,
): Color {
  let sumAlpha = 0
  let sumRed = 0
  let sumGreen = 0
  let sumBlue = 0
  let count = 0

  for (let y = box.startY; y < box.endY; y += 1) {
    for (let x = box.startX; x < box.endX; x += 1) {
      const offset = (y * width + x) * 4
      const alpha = rgba[offset + 3]!
      sumAlpha += alpha
      sumRed += rgba[offset]! * alpha
      sumGreen += rgba[offset + 1]! * alpha
      sumBlue += rgba[offset + 2]! * alpha
      count += 1
    }
  }

  if (count === 0 || sumAlpha === 0) {
    const red = (background >> 16) & 0xff
    const green = (background >> 8) & 0xff
    const blue = background & 0xff
    return { red, green, blue }
  }

  // 合成公式：sum(r*a) + bg * (count*255 - sum(a))，再除以 count*255。
  // 用整数分子避免 127.5 这类中间值被浮点误差舍成 127。
  const denominator = count * 255
  const red = Math.round(
    (sumRed + ((background >> 16) & 0xff) * (denominator - sumAlpha)) / denominator,
  )
  const green = Math.round(
    (sumGreen + ((background >> 8) & 0xff) * (denominator - sumAlpha)) / denominator,
  )
  const blue = Math.round(
    (sumBlue + (background & 0xff) * (denominator - sumAlpha)) / denominator,
  )
  return { red, green, blue }
}

function pack(red: number, green: number, blue: number): number {
  return ((red & 0xff) << 16) | ((green & 0xff) << 8) | (blue & 0xff)
}

/** 把 RGBA 像素采样成 `columns × rows` 的 Raster `cells`。 */
export function renderBlocks(
  rgba: Uint8Array,
  width: number,
  height: number,
  columns: number,
  rows: number,
  background: number,
): string {
  if (width <= 0 || height <= 0) throw new BlockError('image dimensions must be positive')
  if (columns < 1 || columns > MAX_COLUMNS || rows < 1 || rows > MAX_ROWS) {
    throw new BlockError('block grid is out of range')
  }

  const pixelRows = rows * 2
  const cells = new Uint8Array(columns * rows * 12)
  let cursor = 0

  for (let row = 0; row < rows; row += 1) {
    const [topStart, topEnd] = boxFor(row * 2, pixelRows, height)
    const [bottomStart, bottomEnd] = boxFor(row * 2 + 1, pixelRows, height)
    for (let column = 0; column < columns; column += 1) {
      const [startX, endX] = boxFor(column, columns, width)
      const top = sample(rgba, width, height, { startX, endX, startY: topStart, endY: topEnd }, background)
      const bottom = sample(
        rgba,
        width,
        height,
        { startX, endX, startY: bottomStart, endY: bottomEnd },
        background,
      )
      writeUint32(cells, cursor, UPPER_HALF_BLOCK)
      writeUint32(cells, cursor + 4, pack(top.red, top.green, top.blue))
      writeUint32(cells, cursor + 8, pack(bottom.red, bottom.green, bottom.blue))
      cursor += 12
    }
  }

  return base64Encode(cells)
}

/**
 * 解码并渲染一张 PNG；相同内容、尺寸和背景直接复用上次的 `cells`。
 * `key` 由调用方提供：文件用路径+mtime+大小，内联图片用 `contentKey`。
 */
export function blockCells(
  base64: string,
  key: string,
  columns: number,
  rows: number,
  background: number,
): string {
  const cacheKey = `${key}|${columns}x${rows}|${background.toString(16)}`
  const cached = cache.get(cacheKey)
  if (cached !== undefined) {
    cache.delete(cacheKey)
    cache.set(cacheKey, cached)
    return cached
  }

  let bytes: Uint8Array
  try {
    bytes = Uint8Array.fromBase64(base64)
  } catch {
    throw new BlockError('image is not valid base64')
  }
  const decoded = decodePng(bytes)
  const cells = renderBlocks(decoded.rgba, decoded.width, decoded.height, columns, rows, background)

  cache.set(cacheKey, cells)
  while (cache.size > MAX_CACHE) {
    const oldest = cache.keys().next().value
    if (oldest === undefined) break
    cache.delete(oldest)
  }
  return cells
}

/** 会话切换或配置重载时清空，避免缓存跨会话累积。 */
export function resetBlockCache(): void {
  cache.clear()
}