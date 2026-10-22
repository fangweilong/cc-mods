export type ToolOutputMode = 'off' | 'fold' | 'flat'

export type ToolOutputConfig = {
  mode: ToolOutputMode
  foldAfterLines: number
  keepErrorsExpanded: boolean
}
