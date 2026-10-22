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

export type ToolOutputMode = 'off' | 'fold' | 'flat'

export type ToolOutputConfig = {
  mode: ToolOutputMode
  foldAfterLines: number
  keepErrorsExpanded: boolean
}

export type SubagentViewConfig = {
  maxVisibleAgents: number
  maxFinishedAgents: number
  maxLogEntries: number
}

export type ProjectFilesConfig = {
  maxPreviewChars: number
  maxListEntries: number
}

declare module 'claude-code' {
  interface PluginState {
    'cc-mods-config': {
      config: StatuslineConfig & {
        timestamp: TimestampConfig
        toolOutput: ToolOutputConfig
        subagentSplitView: SubagentViewConfig
        projectFiles: ProjectFilesConfig
      }
      i18nDraft: I18nConfigDraft
      turnDurationDraft: TurnDurationConfigDraft
    }
  }
}
