import type { EngineInterface, Register } from 'claude-code'

/**
 * 气泡最大宽度占可用宽度的比例，右侧留白，贴近 IM 消息样式。
 *
 * 用百分比而不是按 `viewport.columns` 算出的列数：比例由引擎在布局时按真实
 * 带宽换算，模组这边即使拿到过期的视口宽度也不会把气泡撑出内容区。
 */
const MAX_BUBBLE_WIDTH = '70%'
/** 边框内左右留白，保持原自绘边框的视觉缩进。 */
const BUBBLE_PADDING_X = 2

/**
 * 引擎的边框样式。旧配置保存的是自绘的四个角符号，加载时映射回这里，
 * 避免升级后用户选过的圆角、双线边框直接失效。
 */
const BORDER_STYLES = ['single', 'round', 'bold', 'double', 'classic'] as const
type BorderStyle = (typeof BORDER_STYLES)[number]

/** 四角符号组合 → 引擎边框样式；未收录的组合退回 `single`。 */
const BORDER_STYLE_BY_CORNERS: Record<string, BorderStyle> = {
  '┌┐└┘': 'single',
  '╭╮╰╯': 'round',
  '┏┓┗┛': 'bold',
  '╔╗╚╝': 'double',
  '++++': 'classic',
}

type FrameConfig = {
  title: string
  color: string
  borderStyle: BorderStyle
}

const DEFAULT_FRAME_CONFIG: FrameConfig = {
  title: '用户输入',
  color: 'cyan',
  borderStyle: 'single',
}

function pickBorderStyle(value: unknown): BorderStyle | undefined {
  if (typeof value !== 'string') return undefined
  const match = BORDER_STYLES.find(style => style === value)
  return match
}

/**
 * 归一化 `promptFrame` 段。
 *
 * 优先读取显式的 `borderStyle`；没有时用旧配置的四个角符号反查样式，
 * 这样 `cc-mods-config` 面板里保存的旧格式仍然能决定边框外观。
 */
function normalizeFrameConfig(value: unknown): FrameConfig {
  const result: FrameConfig = { ...DEFAULT_FRAME_CONFIG }
  if (!value || typeof value !== 'object') return result

  const frame = value as Record<string, unknown>
  if (typeof frame.title === 'string' && frame.title.trim().length > 0) {
    result.title = frame.title
  }
  if (typeof frame.color === 'string' && frame.color.length > 0) {
    result.color = frame.color
  }

  const explicit = pickBorderStyle(frame.borderStyle)
  if (explicit) {
    result.borderStyle = explicit
    return result
  }

  const corners = [frame.topLeft, frame.topRight, frame.bottomLeft, frame.bottomRight]
  if (corners.every(corner => typeof corner === 'string' && corner.length > 0)) {
    result.borderStyle = BORDER_STYLE_BY_CORNERS[corners.join('')] ?? DEFAULT_FRAME_CONFIG.borderStyle
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
    const title = frame.title.replace(/[\r\n]/gu, ' ').trim()

    // 边框和换行都由引擎负责：自绘「│ 内容 │」这类定宽行一旦和引擎实际给出的带宽
    // 差一个格子，整行会被折到下一行第 0 列，多行消息看起来就像边框错位成两个框。
    // 中间那层定宽容器只负责给气泡设上限并右对齐，短消息仍由气泡自适应收缩。
    return (
      <Box
        key={`prompt-frame-${e.requestId}`}
        width="100%"
        flexDirection="column"
        alignItems="flex-end"
        gap={0}
      >
        <Text key={`prompt-frame-title-${e.requestId}`} color={frame.color}>{title}</Text>
        <Box
          key={`prompt-frame-bounds-${e.requestId}`}
          width={MAX_BUBBLE_WIDTH}
          flexDirection="column"
          alignItems="flex-end"
          gap={0}
        >
          <Box
            key={`prompt-bubble-${e.requestId}`}
            flexDirection="column"
            paddingX={BUBBLE_PADDING_X}
            borderStyle={frame.borderStyle}
            borderColor={frame.color}
          >
            <Text>{e.props.text}</Text>
          </Box>
        </Box>
      </Box>
    )
  })
}
