/**
 * PNG 头部解析：`Image` 元素只接受 PNG 或 RGBA 字节，且必须给出终端单元格尺寸。
 * 这里只读取 24 字节 IHDR，不复制整张图片。
 */
export type PngSize = { width: number; height: number }

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const
const HEADER_BYTES = 24
const HEADER_BASE64_LENGTH = 32

function readUint32(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset] << 24) |
      (bytes[offset + 1] << 16) |
      (bytes[offset + 2] << 8) |
      bytes[offset + 3]) >>>
    0
  )
}

/** 读取 PNG 的宽高；非 PNG 或头部不完整时返回 undefined。 */
export function pngSize(bytes: Uint8Array): PngSize | undefined {
  if (bytes.length < HEADER_BYTES) return undefined

  for (let index = 0; index < PNG_SIGNATURE.length; index += 1) {
    if (bytes[index] !== PNG_SIGNATURE[index]) return undefined
  }

  // 第一个块必须是 IHDR，宽高位于 16..23。
  if (bytes[12] !== 0x49 || bytes[13] !== 0x48 || bytes[14] !== 0x44 || bytes[15] !== 0x52) {
    return undefined
  }

  const width = readUint32(bytes, 16)
  const height = readUint32(bytes, 20)
  return width > 0 && height > 0 ? { width, height } : undefined
}

/** 从 base64 的 PNG 头部读取宽高，不完整或非法时返回 undefined。 */
export function pngBase64Size(base64: string): PngSize | undefined {
  if (base64.length < HEADER_BASE64_LENGTH) return undefined
  try {
    return pngSize(Uint8Array.fromBase64(base64.slice(0, HEADER_BASE64_LENGTH)))
  } catch {
    return undefined
  }
}
