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
  samplesHeader: string
  samplesEmpty: string
  samplesCleared: string
}

export type TurnDurationMode = 'native' | 'custom'
export type TurnDurationSpacing = 'compact' | 'separated'

/** 自定义耗时行的规范化配置；只保存当前设置，不记录回合元数据。 */
export type TurnDurationConfig = {
  mode: TurnDurationMode
  visible: boolean
  spacing: TurnDurationSpacing
}

export type TurnDurationMessages = {
  /** 存在时必须是含 {duration} 的安全非空模板；缺失时整行回退原生。 */
  elapsed?: string
}

export type ConfigTranslation = {
  /** 配置项标签；缺失时保留宿主原文。 */
  label?: string
  /** 配置项说明；缺失时保留宿主原文，空字符串可显式移除说明。 */
  description?: string
}

export type CommandTranslation = {
  /** 斜杠命令的一行描述；缺失时保留宿主原文。 */
  description?: string
  /** 参数提示；只应翻译占位说明，不能改写用户需要原样输入的取值。 */
  argumentHint?: string
}

export type LanguagePack = {
  id: string
  name: string
  /** 仅内置 en 原文模式使用；JSON 语言包不能设置该字段。 */
  preserveOriginal?: boolean
  running?: string
  completed?: string
  duration?: string
  turnDuration?: TurnDurationMessages
  hints?: Partial<Record<HintKey, string>>
  modes?: Readonly<Record<string, string>>
  notices?: Readonly<Record<string, string>>
  messages?: Readonly<Record<string, string>>
  /** 工具完整 description 的精确原文到译文映射。 */
  tools?: Readonly<Record<string, string>>
  config?: Readonly<Record<string, ConfigTranslation>>
  /** 斜杠命令名（不带 /）到展示文案的映射。 */
  commands?: Readonly<Record<string, CommandTranslation>>
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
      turnDuration: TurnDurationConfig
    }
  }
}
