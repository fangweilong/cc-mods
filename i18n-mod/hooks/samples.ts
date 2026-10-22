export type SampleKind = 'user-message' | 'toast' | 'notice' | 'info-notice' | 'spinner' | 'prompt-hint'

type Sample = { kind: SampleKind; text: string; count: number }

const MAX_SAMPLES = 200
const MAX_TEXT = 500
// 仅保存在当前进程内；不写文件、不自动上报，/i18n samples 才输出。
const samples = new Map<string, Sample>()

function truncated(text: string): string {
  return text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT)}…` : text
}

/** 记录一条未命中的英文样本；重复文本只累加次数。 */
export function recordSample(kind: SampleKind, text: string): void {
  if (!text || !/[A-Za-z]/u.test(text)) return
  const clipped = truncated(text)
  const key = `${kind}\u0000${clipped}`
  const existing = samples.get(key)
  if (existing) {
    existing.count++
    return
  }
  if (samples.size >= MAX_SAMPLES) return
  samples.set(key, { kind, text: clipped, count: 1 })
}

export function clearSamples(): void {
  samples.clear()
}

export function collectedSamples(): { count: number; text: string } {
  const entries = [...samples.values()]
  return {
    count: entries.length,
    text: entries.map(sample => `${sample.kind}\t${JSON.stringify(sample.text)}${sample.count > 1 ? `\t×${sample.count}` : ''}`).join('\n'),
  }
}
