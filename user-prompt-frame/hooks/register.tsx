import type { EngineInterface, Register } from 'claude-code'

const DEFAULT_WIDTH = 72
const MIN_WIDTH = 24
const VIEWPORT_GUTTER = 4
const HORIZONTAL = '─'
const NON_BREAKING_SPACE = ' '

const DEFAULT_FRAME_CONFIG = {
  title: '用户输入',
  color: 'cyan',
  horizontal: '─',
  vertical: '│',
  topLeft: '┌',
  topRight: '┐',
  bottomLeft: '└',
  bottomRight: '┘',
} as const

type FrameConfig = {
  title: string
  color: string
  horizontal: string
  vertical: string
  topLeft: string
  topRight: string
  bottomLeft: string
  bottomRight: string
}

function normalizeFrameConfig(value: unknown): FrameConfig {
  const result: FrameConfig = { ...DEFAULT_FRAME_CONFIG }
  if (!value || typeof value !== 'object') return result

  const frame = value as Record<string, unknown>
  for (const field of Object.keys(result) as Array<keyof FrameConfig>) {
    if (typeof frame[field] === 'string' && frame[field].length > 0) {
      result[field] = frame[field]
    }
  }
  return result
}

async function loadFrameConfig($: EngineInterface): Promise<FrameConfig> {
  try {
    const home = (await $.env.get('HOME')) ?? (await $.env.get('USERPROFILE'))
    if (!home) return { ...DEFAULT_FRAME_CONFIG }

    const path = `${home.replace(/[\\/]+$/u, '')}/.config/my-cc-mods/config.json`
    const content = await $.fs.read(path)
    if (typeof content !== 'string') return { ...DEFAULT_FRAME_CONFIG }
    const data = JSON.parse(content) as { promptFrame?: unknown }
    return normalizeFrameConfig(data.promptFrame)
  } catch {
    return { ...DEFAULT_FRAME_CONFIG }
  }
}

function characterWidth(character: string): number {
  const codePoint = character.codePointAt(0) ?? 0

  if (
    (codePoint >= 0x1100 && codePoint <= 0x115f) ||
    codePoint === 0x2329 ||
    codePoint === 0x232a ||
    (codePoint >= 0x2e80 && codePoint <= 0xa4cf) ||
    (codePoint >= 0xac00 && codePoint <= 0xd7a3) ||
    (codePoint >= 0xf900 && codePoint <= 0xfaff) ||
    (codePoint >= 0xfe10 && codePoint <= 0xfe6f) ||
    (codePoint >= 0xff00 && codePoint <= 0xff60) ||
    (codePoint >= 0xffe0 && codePoint <= 0xffe6) ||
    (codePoint >= 0x1f300 && codePoint <= 0x1faff)
  ) {
    return 2
  }

  return 1
}

function displayWidth(text: string): number {
  return Array.from(text).reduce((width, character) => width + characterWidth(character), 0)
}

function wrapText(text: string, width: number): string[] {
  const lines: string[] = []

  for (const paragraph of text.split('\n')) {
    if (paragraph.length === 0) {
      lines.push('')
      continue
    }

    let line = ''
    let lineWidth = 0

    for (const character of Array.from(paragraph)) {
      const characterWidthValue = characterWidth(character)
      if (line && lineWidth + characterWidthValue > width) {
        lines.push(line)
        line = ''
        lineWidth = 0
      }

      line += character
      lineWidth += characterWidthValue
    }

    lines.push(line)
  }

  return lines.length > 0 ? lines : ['']
}

function padLine(line: string, width: number): string {
  return line + NON_BREAKING_SPACE.repeat(Math.max(0, width - displayWidth(line)))
}

export const register: Register = on => {
  on('ui.render', { component: 'UserMessage' }, async ($, e, next) => {
    const isComposerPrompt = e.props.origin.kind === 'composer'
    const isUnclassifiedUserPrompt = e.props.origin.kind === 'unclassified' &&
      e.props.from === undefined && e.props.task === undefined

    if (!isComposerPrompt && !isUnclassifiedUserPrompt) {
      return next(e)
    }

    const frame = await loadFrameConfig($)
    const { Box, Text } = $.ui.resolve(e)
    const viewportWidth = e.viewport?.columns ?? DEFAULT_WIDTH
    const width = Math.max(MIN_WIDTH, viewportWidth - VIEWPORT_GUTTER)
    const contentWidth = width - 6
    const body = wrapText(e.props.text, contentWidth)
    const title = ` ${frame.title.replace(/[\r\n]/gu, ' ').trim()} `
    const innerWidth = width - 2
    const top = `${frame.topLeft}${frame.horizontal}${title}${frame.horizontal.repeat(Math.max(0, innerWidth - 1 - displayWidth(title)))}${frame.topRight}`
    const bottom = `${frame.bottomLeft}${frame.horizontal.repeat(width - 2)}${frame.bottomRight}`

    return (
      <Box key={`prompt-frame-${e.requestId}`} width={width} flexDirection="column">
        <Text bold color={frame.color}>{top}</Text>
        {body.map((line, index) => (
          <Text key={`prompt-line-${index}`}>{frame.vertical}{NON_BREAKING_SPACE.repeat(2)}{padLine(line, contentWidth)}{NON_BREAKING_SPACE.repeat(2)}{frame.vertical}</Text>
        ))}
        <Text bold color={frame.color}>{bottom}</Text>
      </Box>
    )
  })
}
