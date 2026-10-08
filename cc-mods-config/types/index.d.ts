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

export type StatuslineConfig = {
  language: 'en' | 'zh'
  order: StatuslineModule[]
  modules: Record<StatuslineModule, boolean>
  promptFrame: PromptFrameConfig
}

export type I18nConfigDraft = {
  source: string | null
  error: string
}

declare module 'claude-code' {
  interface PluginState {
    'cc-mods-config': {
      config: StatuslineConfig
      i18nDraft: I18nConfigDraft
    }
  }
}
