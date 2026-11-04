export type StatuslineModule =
  | 'model'
  | 'state'
  | 'env'
  | 'git'
  | 'git_stat'
  | 'context'
  | 'tokens'
  | 'cache'
  | 'quota'
  | 'cost'
  | 'cwd'
  | 'turn_step'
  | 'turn_reason'
  | 'tool_count'

export type PromptFrameConfig = {
  title: string
  color: string
  horizontal: string
  vertical: string
  topLeft: string
  topRight: string
  bottomLeft: string
  bottomRight: string
}

export type StatuslinePosition = 'session-mode' | 'below-prompt'
export type StatuslineDisplayMode = 'full' | 'compact'

export type StatuslineConfig = {
  enabled: boolean
  position: StatuslinePosition
  displayMode: StatuslineDisplayMode
  language: 'en' | 'zh'
  order: StatuslineModule[]
  modules: Record<StatuslineModule, boolean>
  promptFrame: PromptFrameConfig
}

export type I18nConfigDraft = {
  source: string | null
  error: string
}

export type TurnDurationConfigDraft = {
  values: {
    turnDurationMode?: 'native' | 'custom'
    turnDurationVisible?: boolean
    turnDurationSpacing?: 'compact' | 'separated'
  }
  error: string
}

export type TimestampConfig = {
  enabled: boolean
  format: string
  tps: boolean
  autoExpandToolGroups: boolean
}

export type ImageMode = 'auto' | 'on' | 'off'

export type ImageConfig = {
  enabled: boolean
  mode: ImageMode
  maxColumns: number
  maxRows: number
  showUserImages: boolean
  showAssistantImages: boolean
  showToolImages: boolean
}

declare module 'claude-code' {
  interface PluginState {
    'cc-mods-config': {
      config: StatuslineConfig & { timestamp: TimestampConfig; image: ImageConfig }
      i18nDraft: I18nConfigDraft
      turnDurationDraft: TurnDurationConfigDraft
    }
  }
}
