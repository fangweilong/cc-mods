/**
 * zlib/DEFLATE 解压，只服务 PNG 的 IDAT。
 *
 * 插件运行环境没有 Node zlib，也没有 Declared 的 DecompressionStream，
 * 因此这里自带最小实现：stored / fixed Huffman / dynamic Huffman 三种块，
 * 输出超过调用方上限立即失败。
 */

export class InflateError extends Error {}

class BitReader {
  private buffer = 0
  private count = 0
  private pos: number

  constructor(private readonly data: Uint8Array, start = 0) {
    this.pos = start
  }

  /** 读取 `count` 位，低位先出，与 DEFLATE 的位序一致。 */
  readBits(count: number): number {
    while (this.count < count) {
      if (this.pos >= this.data.length) throw new InflateError('unexpected end of deflate stream')
      this.buffer = (this.buffer | (this.data[this.pos]! << this.count)) >>> 0
      this.pos += 1
      this.count += 8
    }
    if (count === 0) return 0
    const value = this.buffer & ((1 << count) - 1)
    this.buffer >>>= count
    this.count -= count
    return value
  }

  /** 丢弃当前字节剩余的位；stored 块从下一个字节边界开始。 */
  alignToByte(): void {
    this.buffer = 0
    this.count = 0
  }
}

type Huffman = {
  maxBits: number
  symbols: Map<number, number>
}

const LENGTH_BASE = [
  3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131,
  163, 195, 227, 258,
]
const LENGTH_EXTRA = [
  0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0,
]
const DISTANCE_BASE = [
  1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049,
  3073, 4097, 6145, 8193, 12289, 16385, 24577,
]
const DISTANCE_EXTRA = [
  0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13,
]
const CODE_LENGTH_ORDER = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15]

function buildHuffman(lengths: readonly number[]): Huffman {
  let maxBits = 0
  for (const length of lengths) {
    if (length > 15) throw new InflateError('huffman code length exceeds 15')
    if (length > maxBits) maxBits = length
  }
  if (maxBits === 0) return { maxBits: 0, symbols: new Map() }

  const counts = new Array<number>(maxBits + 1).fill(0)
  for (const length of lengths) {
    if (length > 0) counts[length] += 1
  }

  // 过订阅（码字总和超过 2^bits）非法；未用满允许，距离树可只有一个码。
  let left = 1
  for (let bits = 1; bits <= maxBits; bits += 1) {
    left = (left << 1) - counts[bits]!
    if (left < 0) throw new InflateError('oversubscribed huffman tree')
  }

  const nextCode = new Array<number>(maxBits + 1).fill(0)
  let code = 0
  for (let bits = 1; bits <= maxBits; bits += 1) {
    code = (code + counts[bits - 1]!) << 1
    nextCode[bits] = code
  }

  const symbols = new Map<number, number>()
  for (let symbol = 0; symbol < lengths.length; symbol += 1) {
    const length = lengths[symbol]!
    if (length === 0) continue
    symbols.set((length << 16) | nextCode[length]!, symbol)
    nextCode[length] += 1
  }
  return { maxBits, symbols }
}

function decodeSymbol(reader: BitReader, tree: Huffman): number {
  let code = 0
  for (let length = 1; length <= tree.maxBits; length += 1) {
    code = (code << 1) | reader.readBits(1)
    const symbol = tree.symbols.get((length << 16) | code)
    if (symbol !== undefined) return symbol
  }
  throw new InflateError('invalid huffman code')
}

const FIXED_LITERAL = (() => {
  const lengths = new Array<number>(288).fill(0)
  for (let symbol = 0; symbol <= 143; symbol += 1) lengths[symbol] = 8
  for (let symbol = 144; symbol <= 255; symbol += 1) lengths[symbol] = 9
  for (let symbol = 256; symbol <= 279; symbol += 1) lengths[symbol] = 7
  for (let symbol = 280; symbol <= 287; symbol += 1) lengths[symbol] = 8
  return buildHuffman(lengths)
})()

const FIXED_DISTANCE = buildHuffman(new Array<number>(32).fill(5))

class Output {
  private data: Uint8Array
  private length = 0

  constructor(private readonly limit: number) {
    if (!Number.isSafeInteger(limit) || limit <= 0) throw new InflateError('invalid inflate limit')
    this.data = new Uint8Array(Math.min(limit, 64 * 1024))
  }

  push(value: number): void {
    if (this.length >= this.limit) throw new InflateError('inflate output exceeds limit')
    if (this.length === this.data.length) {
      const next = new Uint8Array(Math.min(this.limit, this.data.length * 2))
      next.set(this.data)
      this.data = next
    }
    this.data[this.length] = value
    this.length += 1
  }

  /** 回引；允许与已输出区域重叠（逐字节复制）。 */
  back(distance: number): void {
    if (distance <= 0 || distance > this.length) throw new InflateError('invalid back-reference')
    this.push(this.data[this.length - distance]!)
  }

  finish(): Uint8Array {
    return this.data.slice(0, this.length)
  }
}

function inflateBlocks(reader: BitReader, output: Output): void {
  let final = false
  while (!final) {
    final = reader.readBits(1) === 1
    const type = reader.readBits(2)

    if (type === 0) {
      reader.alignToByte()
      const length = reader.readBits(16)
      const complement = reader.readBits(16)
      if ((length ^ 0xffff) !== complement) throw new InflateError('stored block length mismatch')
      for (let index = 0; index < length; index += 1) output.push(reader.readBits(8))
      continue
    }

    if (type === 3) throw new InflateError('reserved deflate block type')

    let literalTree: Huffman
    let distanceTree: Huffman
    if (type === 1) {
      literalTree = FIXED_LITERAL
      distanceTree = FIXED_DISTANCE
    } else {
      const literalCount = reader.readBits(5) + 257
      const distanceCount = reader.readBits(5) + 1
      const codeLengthCount = reader.readBits(4) + 4
      if (literalCount > 286 || distanceCount > 32) throw new InflateError('invalid dynamic block counts')

      const codeLengths = new Array<number>(19).fill(0)
      for (let index = 0; index < codeLengthCount; index += 1) {
        codeLengths[CODE_LENGTH_ORDER[index]!] = reader.readBits(3)
      }
      const codeTree = buildHuffman(codeLengths)

      const lengths = new Array<number>(literalCount + distanceCount).fill(0)
      let cursor = 0
      while (cursor < lengths.length) {
        const symbol = decodeSymbol(reader, codeTree)
        if (symbol <= 15) {
          lengths[cursor] = symbol
          cursor += 1
          continue
        }
        let repeat: number
        let value: number
        if (symbol === 16) {
          if (cursor === 0) throw new InflateError('repeat with no previous code length')
          value = lengths[cursor - 1]!
          repeat = 3 + reader.readBits(2)
        } else if (symbol === 17) {
          value = 0
          repeat = 3 + reader.readBits(3)
        } else if (symbol === 18) {
          value = 0
          repeat = 11 + reader.readBits(7)
        } else {
          throw new InflateError('invalid code length symbol')
        }
        if (cursor + repeat > lengths.length) throw new InflateError('code length repeat overflows')
        for (let index = 0; index < repeat; index += 1) lengths[cursor + index] = value
        cursor += repeat
      }

      literalTree = buildHuffman(lengths.slice(0, literalCount))
      distanceTree = buildHuffman(lengths.slice(literalCount))
    }

    for (;;) {
      const symbol = decodeSymbol(reader, literalTree)
      if (symbol < 256) {
        output.push(symbol)
        continue
      }
      if (symbol === 256) break

      const lengthIndex = symbol - 257
      if (lengthIndex >= LENGTH_BASE.length) throw new InflateError('invalid length symbol')
      const length = LENGTH_BASE[lengthIndex]! + reader.readBits(LENGTH_EXTRA[lengthIndex]!)

      const distanceSymbol = decodeSymbol(reader, distanceTree)
      if (distanceSymbol >= DISTANCE_BASE.length) throw new InflateError('invalid distance symbol')
      const distance = DISTANCE_BASE[distanceSymbol]! + reader.readBits(DISTANCE_EXTRA[distanceSymbol]!)

      for (let index = 0; index < length; index += 1) output.back(distance)
    }
  }
}

/** 解压 zlib 流（RFC 1950）中的 DEFLATE 数据，最多输出 `maxOutput` 字节。 */
export function inflateZlib(data: Uint8Array, maxOutput: number): Uint8Array {
  if (data.length < 6) throw new InflateError('zlib stream is too short')
  const method = data[0]! & 0x0f
  const flags = data[1]!
  if (method !== 8) throw new InflateError('zlib method is not deflate')
  if (data[0]! >> 4 > 7) throw new InflateError('zlib window exceeds 32 KiB')
  if (((data[0]! << 8) | flags) % 31 !== 0) throw new InflateError('zlib header check failed')
  if (flags & 0x20) throw new InflateError('zlib preset dictionary is unsupported')

  const output = new Output(maxOutput)
  inflateBlocks(new BitReader(data, 2), output)
  return output.finish()
}