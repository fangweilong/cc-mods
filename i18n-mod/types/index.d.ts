export type HintKey =
  | 'shortcuts'
  | 'interrupt'
  | 'background'
  | 'expand'
  | 'collapse'
  | 'history'
  | 'cycleMode'
  | 'acceptSuggestion'

export type CommandMessages = {
  description: string
  current: string
  source: string
  available: string
  switched: string
  reloaded: string
  unsupported: string
  loadFailed: string
  saveFailed: string
  usage: string
}

export type LanguagePack = {
  id: string
  name: string
  /** 仅内置 en 原文模式使用；JSON 语言包不能设置该字段。 */
  preserveOriginal?: boolean
  running?: string
  completed?: string
  duration?: string
  hints?: Partial<Record<HintKey, string>>
  modes?: Readonly<Record<string, string>>
  notices?: Readonly<Record<string, string>>
  messages?: Readonly<Record<string, string>>
  command: CommandMessages
}

export type LanguageSelection = {
  /** 语言代码或文件路径，沿用宿主保存的来源而非文件中的 id。 */
  source: string
  pack: LanguagePack
}

declare module 'claude-code' {
  interface PluginState {
    'i18n-mod': {
      selection: LanguageSelection
    }
  }
}
