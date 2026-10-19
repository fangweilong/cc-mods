export type ToolUsage = {
  input: number
  output: number
}

export type ToolTiming = {
  startedAt: number
  finishedAt?: number
  usage?: ToolUsage
}

export type TimestampConfig = {
  enabled: boolean
  format: string
  tps: boolean
  autoExpandToolGroups: boolean
}

declare module 'claude-code' {
  interface PluginState {
    'timestamp-mod': {
      toolTimings: StateFamily<ToolTiming>
    }
  }
}
