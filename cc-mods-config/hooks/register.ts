import { atom, read, update } from 'claude-code'
import type { ConfigRow, EngineInterface, Register } from 'claude-code'
import type { I18nConfigDraft, StatuslineConfig, StatuslineDisplayMode, StatuslineModule, StatuslinePosition, TimestampConfig, TurnDurationConfigDraft } from '../types'

const UI_COLORS = { cyan: '#50c8ff', red: '#ff5a64', gray: '#8791a0' } as const

const DEFAULT_ORDER = [
  'model',
  'state',
  'env',
  'git',
  'git_stat',
  'context',
  'tokens',
  'cache',
  'quota',
  'cost',
  'cwd',
] as const

export type ModuleId = StatuslineModule
export type Language = 'en' | 'zh'

export type StatusConfig = StatuslineConfig & {
  timestamp: TimestampConfig
}

export const DEFAULT_CONFIG: StatusConfig = {
  position: 'session-mode',
  displayMode: 'compact',
  language: 'en',
  order: [...DEFAULT_ORDER],
  modules: {
    model: true,
    state: true,
    env: true,
    git: true,
    git_stat: true,
    context: true,
    tokens: true,
    cache: true,
    quota: true,
    cost: true,
    cwd: true,
  },
  promptFrame: {
    title: '用户输入',
    color: 'cyan',
    horizontal: '─',
    vertical: '│',
    topLeft: '┌',
    topRight: '┐',
    bottomLeft: '└',
    bottomRight: '┘',
  },
  timestamp: {
    enabled: true,
    format: 'HH:mm:ss',
    tps: true,
  },
}

const configAtom = atom({ plugin: 'cc-mods-config', key: 'config' } as const, cloneConfig(DEFAULT_CONFIG))
const i18nDraftAtom = atom({ plugin: 'cc-mods-config', key: 'i18nDraft' } as const, { source: null, error: '' } as I18nConfigDraft)

const turnDurationDraftAtom = atom({ plugin: 'cc-mods-config', key: 'turnDurationDraft' } as const, { values: {}, error: '' } as TurnDurationConfigDraft)
const TURN_DURATION_FIELDS = ['turnDurationMode', 'turnDurationVisible', 'turnDurationSpacing'] as const

const CONFIG_PANE = 'my-cc-mods-config'
type ConfigTab = 'statusline' | 'prompt-frame' | 'language-time' | 'subagents'

const CONFIG_TABS: readonly ConfigTab[] = ['statusline', 'prompt-frame', 'language-time', 'subagents']
let activeTab: ConfigTab = 'statusline'
let config: StatusConfig = cloneConfig(DEFAULT_CONFIG)
let configPath = ''
let draftConfig: StatusConfig | undefined

function cloneConfig(value: StatusConfig): StatusConfig {
  return {
    position: value.position,
    displayMode: value.displayMode,
    language: value.language,
    order: [...value.order],
    modules: { ...value.modules },
    promptFrame: { ...value.promptFrame },
    timestamp: { ...value.timestamp },
  }
}

export function normalizeConfig(value: unknown): StatusConfig {
  const result = cloneConfig(DEFAULT_CONFIG)
  if (!value || typeof value !== 'object') return result

  const data = value as {
    position?: unknown
    displayMode?: unknown
    language?: unknown
    order?: unknown
    modules?: unknown
    promptFrame?: unknown
    timestamp?: unknown
  }

  if (data.position === 'session-mode' || data.position === 'below-prompt') {
    result.position = data.position
  }

  if (data.displayMode === 'full' || data.displayMode === 'compact') {
    result.displayMode = data.displayMode
  }

  if (data.language === 'en' || data.language === 'zh') {
    result.language = data.language
  }

  if (Array.isArray(data.order) && data.order.length > 0) {
    const requested = data.order.filter(
      (item): item is ModuleId => typeof item === 'string' && DEFAULT_ORDER.includes(item as ModuleId),
    )
    for (const item of DEFAULT_ORDER) {
      if (requested.includes(item)) continue
      const defaultIndex = DEFAULT_ORDER.indexOf(item)
      let insertAt = requested.length
      for (const previous of DEFAULT_ORDER.slice(0, defaultIndex).reverse()) {
        const previousIndex = requested.indexOf(previous)
        if (previousIndex >= 0) {
          insertAt = previousIndex + 1
          break
        }
      }
      requested.splice(insertAt, 0, item)
    }
    result.order = requested
  }

  if (data.modules && typeof data.modules === 'object') {
    const modules = data.modules as Record<string, unknown>
    for (const item of DEFAULT_ORDER) {
      if (item in modules) result.modules[item] = Boolean(modules[item])
    }
  }

  if (data.promptFrame && typeof data.promptFrame === 'object') {
    const frame = data.promptFrame as Record<string, unknown>
    const fields = ['title', 'color', 'horizontal', 'vertical', 'topLeft', 'topRight', 'bottomLeft', 'bottomRight'] as const
    for (const field of fields) {
      if (typeof frame[field] === 'string' && frame[field].length > 0) {
        result.promptFrame[field] = frame[field]
      }
    }
  }

  if (data.timestamp && typeof data.timestamp === 'object') {
    const timestamp = data.timestamp as Record<string, unknown>
    if (typeof timestamp.enabled === 'boolean') result.timestamp.enabled = timestamp.enabled
    if (typeof timestamp.format === 'string' && timestamp.format.length > 0) result.timestamp.format = timestamp.format
    if (typeof timestamp.tps === 'boolean') result.timestamp.tps = timestamp.tps
  }

  return result
}

async function homeDirectory($: EngineInterface): Promise<string> {
  return (await $.env.get('HOME')) ?? (await $.env.get('USERPROFILE')) ?? ''
}

function joinPath(base: string, child: string): string {
  return `${base.replace(/[\\/]+$/u, '')}/${child}`
}

async function readConfig($: EngineInterface, home: string): Promise<void> {
  config = cloneConfig(DEFAULT_CONFIG)
  configPath = ''
  draftConfig = undefined
  if (!home) return
  configPath = joinPath(home, '.config/my-cc-mods/config.json')
  try {
    const content = await $.fs.read(configPath)
    if (typeof content === 'string') config = normalizeConfig(JSON.parse(content))
  } catch {
    config = cloneConfig(DEFAULT_CONFIG)
  }
}

async function syncConfigState($: EngineInterface): Promise<void> {
  await update($, configAtom, () => cloneConfig(config))
}

async function updateConfigDraft($: EngineInterface, mutate: (current: StatusConfig) => StatusConfig): Promise<void> {
  const current = await read($, configAtom)
  const next = mutate(cloneConfig(draftConfig ?? current ?? DEFAULT_CONFIG))
  draftConfig = next
  await update($, configAtom, () => cloneConfig(next))
}

async function i18nConfigRow($: EngineInterface): Promise<ConfigRow | undefined> {
  return (await $.config.list()).find(row => row.key === 'i18n-mod.language' && typeof row.value === 'string')
}

async function setI18nDraft($: EngineInterface, source: string): Promise<void> {
  await update($, i18nDraftAtom, () => ({ source, error: '' }))
}

async function resetI18nDraft($: EngineInterface): Promise<void> {
  await update($, i18nDraftAtom, () => ({ source: null, error: '' }))
}

async function resetTurnDurationDraft($: EngineInterface): Promise<void> {
  await update($, turnDurationDraftAtom, () => ({ values: {}, error: '' }))
}

function turnDurationRow(rows: ConfigRow[], field: typeof TURN_DURATION_FIELDS[number]): ConfigRow | undefined {
  return rows.find(row => row.key === `i18n-mod.${field}` && (field === 'turnDurationVisible'
    ? row.kind === 'boolean' && typeof row.value === 'boolean'
    : row.kind === 'choice' && (field === 'turnDurationMode'
      ? row.value === 'native' || row.value === 'custom'
      : row.value === 'compact' || row.value === 'separated')))
}

function partialSaveMessage(language: Language, saved: string[], failure: string): string {
  return language === 'zh'
    ? `部分保存：已保存 ${saved.join(', ')}；${failure}。失败及剩余草稿已保留，请重试。`
    : `Partial save: saved ${saved.join(', ')}; ${failure}. Failed and remaining drafts preserved; retry saving.`
}

async function saveCurrentConfig($: EngineInterface): Promise<void> {
  const current = draftConfig ?? await read($, configAtom)
  const savedConfig = cloneConfig(current ?? config)
  const i18nDraft = await read($, i18nDraftAtom)
  const savedKeys: string[] = []
  // 先走宿主的 i18n 校验和锁定策略；失败不写入其他 Mod 的配置文件。
  if (i18nDraft.source !== null) {
    try {
      const row = await i18nConfigRow($)
      if (!row) throw new Error('i18n-mod is not loaded.')
      if (row.isLocked) throw new Error('The i18n language is locked by host policy.')
      const saved = await $.config.set({ key: row.key, value: i18nDraft.source })
      if (saved.deny !== undefined) throw new Error(saved.deny)
      savedKeys.push(row.key)
      await resetI18nDraft($)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      await update($, i18nDraftAtom, draft => ({ ...draft, error: message }))
      $.ui.toast(message)
      return
    }
  }
  const durationDraft = await read($, turnDurationDraftAtom)
  await update($, turnDurationDraftAtom, draft => ({ ...draft, error: '' }))
  for (const field of TURN_DURATION_FIELDS) {
    const value = durationDraft.values[field]
    if (value === undefined) continue
    const key = `i18n-mod.${field}`
    try {
      // 每项保存前重新检查真实可见行和锁；不把多次 set 伪装成原子事务。
      const row = turnDurationRow(await $.config.list(), field)
      if (!row) throw new Error('configuration row unavailable; load/update i18n-mod.')
      if (row.isLocked) throw new Error('Locked by host policy.')
      const saved = await $.config.set({ key: row.key, value })
      if (saved.deny !== undefined) throw new Error(saved.deny)
      savedKeys.push(row.key)
      // 只清除成功项；重绘从宿主配置行读取最终值，而不是继续展示提交的草稿。
      await update($, turnDurationDraftAtom, draft => {
        const values = { ...draft.values }
        delete values[field]
        return { values, error: '' }
      })
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      const failure = `${key}: ${reason}`
      const message = savedKeys.length > 0
        ? partialSaveMessage(savedConfig.language, savedKeys, failure)
        : (savedConfig.language === 'zh' ? `${failure}；保存失败，草稿已保留。` : `${failure}; save failed, drafts preserved.`)
      await update($, turnDurationDraftAtom, draft => ({ ...draft, error: message }))
      $.ui.toast(message)
      return
    }
  }
  try {
    if (!configPath) throw new Error('Configuration file path is unavailable; reopen the configuration panel.')
    await $.fs.write(configPath, `${JSON.stringify(savedConfig, null, 2)}\n`)
    config = savedConfig
    draftConfig = undefined
    await update($, configAtom, () => cloneConfig(config))
    $.ui.toast(config.language === 'zh' ? '配置已保存。' : 'Configuration saved.')
  } catch {
    $.ui.toast(savedKeys.some(key => key !== 'i18n-mod.language')
      ? partialSaveMessage(savedConfig.language, savedKeys, savedConfig.language === 'zh' ? '状态栏/输入框配置保存失败' : 'statusline/prompt-frame save failed')
      : savedKeys.length > 0
        ? (savedConfig.language === 'zh' ? 'i18n 已保存，但状态栏/输入框配置保存失败，请重试。' : 'i18n saved, but statusline/prompt-frame save failed; retry saving.')
        : (savedConfig.language === 'zh' ? '配置保存失败，草稿已保留。' : 'Configuration save failed; draft preserved.'))
  }
}

async function reloadI18n($: EngineInterface): Promise<void> {
  const draft = await read($, i18nDraftAtom)
  if (draft.source !== null) {
    $.ui.toast(config.language === 'zh' ? '请先保存或取消 i18n 草稿，再重新加载。' : 'Save or discard the i18n draft before reloading.')
    return
  }
  try {
    const result = await $.command.run({ command: 'i18n', args: 'reload' })
    $.ui.toast(result.text ?? 'i18n reload returned no message.')
  } catch (error) {
    $.ui.toast(error instanceof Error ? error.message : String(error))
  }
}

async function changeConfig($: EngineInterface, mutate: (current: StatusConfig) => StatusConfig): Promise<void> {
  await updateConfigDraft($, mutate)
}

function configModuleLabel(module: ModuleId, language: Language): string {
  const labels: Record<ModuleId, { en: string; zh: string }> = {
    model: { en: 'Model', zh: '模型' },
    state: { en: 'State', zh: '状态' },
    env: { en: 'Environment', zh: '环境' },
    git: { en: 'Git', zh: 'Git' },
    git_stat: { en: 'Git diff', zh: 'Git 增删' },
    context: { en: 'Context', zh: '上下文' },
    tokens: { en: 'Tokens', zh: 'Token' },
    cache: { en: 'Cache', zh: '缓存' },
    quota: { en: 'Quota', zh: '配额' },
    cost: { en: 'Cost', zh: '花费' },
    cwd: { en: 'Workspace', zh: '目录' },
  }
  return labels[module][language]
}

function configTabLabel(tab: ConfigTab, language: Language): string {
  const labels: Record<ConfigTab, { en: string; zh: string }> = {
    statusline: { en: 'Statusline', zh: '状态栏' },
    'prompt-frame': { en: 'Prompt frame', zh: '输入框' },
    'language-time': { en: 'Language & time', zh: '语言与时间' },
    subagents: { en: 'Subagents', zh: 'Subagent' },
  }
  return labels[tab][language]
}


async function renderConfigPane($: EngineInterface, e: any): Promise<any> {
  const stateConfig = await read($, configAtom)
  const current = draftConfig ?? cloneConfig(stateConfig ?? DEFAULT_CONFIG)
  if (!draftConfig) draftConfig = cloneConfig(current)
  const { Box, Button, Input, Select, Text } = $.ui.resolve(e)
  const language = current.language
  const title = language === 'zh' ? 'CC Mods 配置' : 'CC Mods Configuration'
  const enabled = language === 'zh' ? '启用' : 'ON'
  const disabled = language === 'zh' ? '停用' : 'OFF'
  const moveUp = language === 'zh' ? '上移' : '↑'
  const moveDown = language === 'zh' ? '下移' : '↓'
  const close = language === 'zh' ? '关闭' : 'Close'
  const save = language === 'zh' ? '保存配置' : 'Save configuration'
  const i18nDraft = await read($, i18nDraftAtom)
  const durationDraft = await read($, turnDurationDraftAtom)
  let rows: ConfigRow[] = []
  try {
    rows = await $.config.list()
  } catch {
    // 独立加载配置插件或宿主未提供 i18n 配置时，其他设置仍可使用。
  }
  const i18nRow = rows.find(row => row.key === 'i18n-mod.language' && typeof row.value === 'string')
  const i18nSource = i18nDraft.source ?? String(i18nRow?.value ?? '')
  const i18nControls = !i18nRow
    ? [Text({ dimColor: true, children: [language === 'zh' ? 'i18n-mod 未加载；加载后可在这里设置界面语言。' : 'i18n-mod is not loaded; load it to configure the UI language here.'] })]
    : [
        Text({ dimColor: true, children: [language === 'zh' ? '语言代码或 JSON 路径；相对路径以 i18n-mod 目录为基准。' : 'Language code or JSON path; relative paths use the i18n-mod directory.'] }),
        ...(i18nRow.isLocked
          ? [Text({ dimColor: true, children: [`${language === 'zh' ? '宿主策略已锁定' : 'Locked by host policy'}: ${String(i18nRow.value)}`] })]
          : [
              Input({
                key: 'i18n-language-source',
                label: language === 'zh' ? '界面语言 / JSON 路径' : 'UI language / JSON path',
                value: i18nSource,
                placeholder: 'zh-CN | en | ./locales/custom.json',
                submitLabel: '',
                onInput: (value: string) => setI18nDraft($, value),
                onSubmit: (value: string) => setI18nDraft($, value),
              }),
              // 一个原生选择控件持有焦点，方向键不再用作横排按钮之间的跨控件导航。
              Select({
                key: 'i18n-language-preset',
                label: language === 'zh' ? '语言选择' : 'Language selection',
                value: i18nSource,
                options: [
                  { value: 'zh-CN', label: '简体中文' },
                  { value: 'en', label: 'English' },
                  ...(!['zh-CN', 'en'].includes(i18nSource)
                    ? [{ value: i18nSource, label: language === 'zh' ? '自定义语言 / JSON' : 'Custom language / JSON' }]
                    : []),
                ],
                onSelect: (value: string) => setI18nDraft($, value),
              }),
              Text({ dimColor: true, children: [language === 'zh' ? '方向键选择，Enter 确认；Tab 切换控件。' : 'Arrow keys select, Enter confirms; Tab moves between controls.'] }),
            ]),
        Text({ dimColor: true, children: [language === 'zh' ? '点击保存配置后生效；重新加载只读取已保存的语言包。' : 'Apply with Save configuration; Reload reads the saved language pack only.'] }),
        Box({ children: [
          Button({ key: 'i18n-reload', label: language === 'zh' ? '重新加载语言包' : 'Reload language pack', onPress: () => reloadI18n($) }),
          Button({ key: 'i18n-cancel', label: language === 'zh' ? '取消语言修改' : 'Discard language changes', onPress: () => resetI18nDraft($) }),
        ] }),
      ]
  if (i18nDraft.error) i18nControls.push(Text({ color: UI_COLORS.red, children: [i18nDraft.error] }))
  const durationOptions = {
    turnDurationMode: [
      { value: 'native', label: language === 'zh' ? '原生' : 'Native' },
      { value: 'custom', label: language === 'zh' ? '自定义耗时行' : 'Custom duration line' },
    ],
    turnDurationVisible: [
      { value: 'true', label: language === 'zh' ? '显示' : 'Show' },
      { value: 'false', label: language === 'zh' ? '隐藏' : 'Hide' },
    ],
    turnDurationSpacing: [
      { value: 'compact', label: language === 'zh' ? '紧凑' : 'Compact' },
      { value: 'separated', label: language === 'zh' ? '留一行' : 'One blank line' },
    ],
  }
  const durationLabels = {
    turnDurationMode: { key: 'turn-duration-mode', label: language === 'zh' ? '耗时行模式' : 'Duration line mode' },
    turnDurationVisible: { key: 'turn-duration-visible', label: language === 'zh' ? '自定义行可见性' : 'Custom line visibility' },
    turnDurationSpacing: { key: 'turn-duration-spacing', label: language === 'zh' ? '自定义顶部间距' : 'Custom top spacing' },
  }
  const durationControls = TURN_DURATION_FIELDS.map(field => {
    const row = turnDurationRow(rows, field)
    const key = `i18n-mod.${field}`
    if (!row) return Text({ dimColor: true, children: [language === 'zh'
      ? `${key} 配置行不可用；请加载或更新 i18n-mod。`
      : `${key} unavailable; load or update i18n-mod.`] })
    if (row.isLocked) return Text({ dimColor: true, children: [`${key} · ${language === 'zh' ? '宿主策略已锁定' : 'Locked by host policy'}: ${String(row.value)}`] })
    return Select({
      ...durationLabels[field],
      value: String(durationDraft.values[field] ?? row.value),
      options: durationOptions[field],
      onSelect: (value: string) => update($, turnDurationDraftAtom, draft => ({
        values: { ...draft.values, [field]: field === 'turnDurationVisible' ? value === 'true' : value },
        error: '',
      })),
    })
  })
  const frameFields = [
    ['title', language === 'zh' ? '标题' : 'Title'],
    ['color', language === 'zh' ? '边框颜色' : 'Border color'],
    ['horizontal', language === 'zh' ? '横线符号' : 'Horizontal'],
    ['vertical', language === 'zh' ? '竖线符号' : 'Vertical'],
    ['topLeft', language === 'zh' ? '左上角' : 'Top-left'],
    ['topRight', language === 'zh' ? '右上角' : 'Top-right'],
    ['bottomLeft', language === 'zh' ? '左下角' : 'Bottom-left'],
    ['bottomRight', language === 'zh' ? '右下角' : 'Bottom-right'],
  ] as const
  const frameInputs = frameFields.map(([field, label]) => Input({
    key: `prompt-frame-${field}`,
    label,
    value: current.promptFrame[field],
    submitLabel: '',
    onInput: (value: string) => {
      const base = cloneConfig(draftConfig ?? config)
      draftConfig = {
        ...base,
        promptFrame: { ...base.promptFrame, [field]: value || base.promptFrame[field] },
      }
    },
    onSubmit: () => undefined,
  }))

  const moduleRows = current.order.map((module, index) => Box({
    children: [
      Text({ color: UI_COLORS.gray, children: [`${String(index + 1).padStart(2, ' ')}. ${configModuleLabel(module, language)} `] }),
      Button({
        key: `module-${module}-toggle`,
        label: current.modules[module] ? enabled : disabled,
        onPress: () => changeConfig($, latest => ({
          ...latest,
          modules: { ...latest.modules, [module]: !latest.modules[module] },
        })),
      }),
      Button({
        key: `module-${module}-up`,
        label: moveUp,
        onPress: () => changeConfig($, latest => {
          const position = latest.order.indexOf(module)
          if (position <= 0) return latest
          const order = [...latest.order]
          ;[order[position - 1], order[position]] = [order[position]!, order[position - 1]!]
          return { ...latest, order }
        }),
      }),
      Button({
        key: `module-${module}-down`,
        label: moveDown,
        onPress: () => changeConfig($, latest => {
          const position = latest.order.indexOf(module)
          if (position < 0 || position >= latest.order.length - 1) return latest
          const order = [...latest.order]
          ;[order[position], order[position + 1]] = [order[position + 1]!, order[position]!]
          return { ...latest, order }
        }),
      }),
    ],
  }))

  const statuslineSection = Box({
    key: 'statusline-config-section',
    flexDirection: 'column',
    flexShrink: 0,
    marginTop: 1,
    children: [
      Text({ key: 'statusline-config-heading', color: UI_COLORS.cyan, weight: 'bold', children: [language === 'zh' ? 'statusline-mod · 状态栏' : 'statusline-mod · Statusline'] }),
      Text({ color: UI_COLORS.gray, children: [language === 'zh' ? '状态栏与配置面板语言' : 'Statusline and panel language'] }),
      Select({
        key: 'panel-language',
        label: language === 'zh' ? '配置面板语言' : 'Panel language',
        value: current.language,
        options: [{ value: 'en', label: 'English' }, { value: 'zh', label: '简体中文' }],
        onSelect: (value: Language) => changeConfig($, latest => ({ ...latest, language: value })),
      }),
      Select({
        key: 'statusline-position',
        label: language === 'zh' ? '状态栏位置' : 'Statusline position',
        value: current.position,
        options: [
          { value: 'session-mode', label: language === 'zh' ? '模式提示区域（现有位置）' : 'Mode area (existing position)' },
          { value: 'below-prompt', label: language === 'zh' ? '输入框下方' : 'Below input box' },
        ],
        onSelect: (value: StatuslinePosition) => changeConfig($, latest => ({ ...latest, position: value })),
      }),
      Select({
        key: 'statusline-display-mode',
        label: language === 'zh' ? '状态栏显示模式' : 'Statusline display mode',
        value: current.displayMode,
        options: [
          { value: 'full', label: language === 'zh' ? '完整模式' : 'Full' },
          { value: 'compact', label: language === 'zh' ? '简洁模式' : 'Compact' },
        ],
        onSelect: (value: StatuslineDisplayMode) => changeConfig($, latest => ({ ...latest, displayMode: value })),
      }),
      Text({ color: UI_COLORS.gray, children: [language === 'zh' ? '模块：按钮可切换、↑/↓ 可排序' : 'Toggle modules or reorder them with the buttons'] }),
      ...moduleRows,
    ],
  })

  const promptFrameSection = Box({
    key: 'prompt-frame-config-section',
    flexDirection: 'column',
    flexShrink: 0,
    marginTop: 1,
    children: [
      Text({ key: 'prompt-frame-config-heading', color: UI_COLORS.cyan, weight: 'bold', children: [language === 'zh' ? 'user-prompt-frame · 用户输入框' : 'user-prompt-frame · User prompt frame'] }),
      Text({ color: UI_COLORS.gray, children: [language === 'zh' ? '修改字段后点击保存配置' : 'Edit fields, then click Save configuration'] }),
      ...frameInputs,
    ],
  })

  const languageTimeSection = Box({
    key: 'language-time-config-section',
    flexDirection: 'column',
    flexShrink: 0,
    marginTop: 1,
    children: [
      Text({ key: 'i18n-config-heading', color: UI_COLORS.cyan, weight: 'bold', children: [language === 'zh' ? 'i18n-mod · 原生界面语言' : 'i18n-mod · Native UI language'] }),
      ...i18nControls,
      Text({ key: 'turn-duration-heading', color: UI_COLORS.cyan, weight: 'bold', children: [language === 'zh' ? 'i18n-mod · 耗时行' : 'i18n-mod · Turn duration'] }),
      Text({ dimColor: true, children: [language === 'zh'
        ? '自定义模式使用独立显隐；v1 不显示原生结束时刻、后台等待和预算等统计。需要完整原生行为请切回 native。English 原文始终使用原生。语言沿用上方 i18n 来源。'
        : 'Custom mode uses independent visibility; v1 has no native end time, background waiting or budget statistics. For full native behavior switch back to native. English original always uses native. Language follows the i18n source above.'] }),
      ...durationControls,
      Text({ dimColor: true, children: [language === 'zh' ? '保存配置后生效；多项逐项保存，失败时保留剩余草稿。' : 'Apply with Save configuration; fields save individually, preserving remaining drafts on failure.'] }),
      Button({ key: 'turn-duration-cancel', label: language === 'zh' ? '取消耗时行修改' : 'Discard duration changes', onPress: () => resetTurnDurationDraft($) }),
      ...(durationDraft.error ? [Text({ key: 'turn-duration-error', color: UI_COLORS.red, children: [durationDraft.error] })] : []),
      Text({ key: 'timestamp-config-heading', color: UI_COLORS.cyan, weight: 'bold', children: [language === 'zh' ? 'timestamp-mod · 时间显示' : 'timestamp-mod · Timestamps'] }),
      Text({ color: UI_COLORS.gray, children: [language === 'zh' ? '显示用户消息发送时间、工具调用开始/结束时间与消耗的 Token。' : 'Show user message send time, tool call start/end times and their token usage.'] }),
      Box({ children: [
        Text({ color: UI_COLORS.gray, children: [language === 'zh' ? '插件状态：' : 'Plugin: '] }),
        Button({
          key: 'timestamp-enabled-toggle',
          label: current.timestamp.enabled ? enabled : disabled,
          onPress: () => changeConfig($, latest => ({ ...latest, timestamp: { ...latest.timestamp, enabled: !latest.timestamp.enabled } })),
        }),
      ] }),
      Box({ children: [
        Text({ color: UI_COLORS.gray, children: [language === 'zh' ? 'TPS / Token：' : 'TPS / tokens: '] }),
        Button({
          key: 'timestamp-tps-toggle',
          label: current.timestamp.tps ? enabled : disabled,
          onPress: () => changeConfig($, latest => ({ ...latest, timestamp: { ...latest.timestamp, tps: !latest.timestamp.tps } })),
        }),
      ] }),
      Input({
        key: 'timestamp-format',
        label: language === 'zh' ? '时间格式' : 'Time format',
        value: current.timestamp.format,
        placeholder: 'YYYY-MM-DD HH:mm:ss',
        submitLabel: '',
        onInput: (value: string) => changeConfig($, latest => ({ ...latest, timestamp: { ...latest.timestamp, format: value || latest.timestamp.format } })),
        onSubmit: (value: string) => changeConfig($, latest => ({ ...latest, timestamp: { ...latest.timestamp, format: value || latest.timestamp.format } })),
      }),
      Text({ dimColor: true, children: [language === 'zh' ? '占位符：YYYY、YY、MM、DD、HH、mm、ss、SSS；其他字符原样保留。' : 'Tokens: YYYY, YY, MM, DD, HH, mm, ss, SSS; other characters are kept.'] }),
    ],
  })

  const subagentSection = Box({
    key: 'subagent-config-section',
    flexDirection: 'column',
    flexShrink: 0,
    marginTop: 1,
    children: [
      Text({ key: 'subagent-config-heading', color: UI_COLORS.cyan, weight: 'bold', children: [language === 'zh' ? 'subagent-split-view · Subagent 面板' : 'subagent-split-view · Subagent pane'] }),
      Text({ dimColor: true, children: [language === 'zh' ? 'Subagent 面板自动显示，当前没有可调配置。' : 'The Subagent pane opens automatically and currently has no configurable options.'] }),
      Text({ dimColor: true, children: [language === 'zh' ? '可在 Subagent 面板中点击名称查看明细，再点击 ↩ main 返回主会话。' : 'Click a subagent name in its pane to inspect it, then use ↩ main to return.'] }),
    ],
  })

  const tabContent = { statusline: statuslineSection, 'prompt-frame': promptFrameSection, 'language-time': languageTimeSection, subagents: subagentSection }[activeTab]
  const tabButtons = CONFIG_TABS.map(tab => Button({
    key: `config-tab-${tab}`,
    label: configTabLabel(tab, language),
    variant: activeTab === tab ? 'primary' : 'secondary',
    onPress: () => {
      activeTab = tab
      $.ui.invalidate('ui.render')
    },
  }))

  return Box({
    flexDirection: 'column',
    children: [
      Text({ color: UI_COLORS.cyan, weight: 'bold', children: [title] }),
      Box({ key: 'config-tabs', flexDirection: 'row', gap: 1, children: tabButtons }),
      Text({ color: UI_COLORS.gray, children: [configTabLabel(activeTab, language)] }),
      tabContent,
      Box({
        key: 'config-actions',
        flexShrink: 0,
        marginTop: 1,
        children: [
          Button({ key: 'save-config', label: save, variant: 'primary', onPress: () => saveCurrentConfig($) }),
          Button({ key: 'close-config', label: close, role: 'dismiss', onPress: async () => {
            draftConfig = undefined
            await syncConfigState($)
            await resetI18nDraft($)
            await resetTurnDurationDraft($)
            activeTab = 'statusline'
            await $.ui.close({ id: CONFIG_PANE })
          } }),
        ],
      }),
    ],
  })
}

export const register: Register = on => {
  on('ui.input', { plugin: 'cc-mods-config', component: 'Pane', kind: 'submit' }, async ($, e) => {
    if (e.element === 'i18n-language-source') await setI18nDraft($, e.value)
    return { element: e.element, value: e.value }
  })

  on('ui.render', { component: 'Pane', requestId: CONFIG_PANE }, ($, e) => renderConfigPane($, e))

  // 外部配置修改只刷新宿主值，不覆盖尚未保存的草稿。
  on('config.set', { key: [
    'i18n-mod.language', 'i18n-mod.turnDurationMode', 'i18n-mod.turnDurationVisible', 'i18n-mod.turnDurationSpacing',
  ] }, async ($, e, next) => {
    const saved = await next(e)
    if (saved.deny === undefined) $.ui.invalidate('ui.render')
    return saved
  })

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'my-cc-mods-config',
      description: 'Open the unified visual configuration for all CC Mods.',
    })
    return next(e)
  })

  on('command.run', { command: 'my-cc-mods-config' }, async $ => {
    await readConfig($, await homeDirectory($))
    activeTab = 'statusline'
    await syncConfigState($)
    await resetI18nDraft($)
    await resetTurnDurationDraft($)
    await $.ui.open({ id: CONFIG_PANE, title: 'CC Mods Config', focus: true, closeOnEscape: true })
    return { text: 'CC Mods configuration panel opened.' }
  })
}
