import type { EngineInterface, Register } from 'claude-code'
import type { LanguageSelection, TurnDurationConfig } from '../types'
import { DEFAULT_SOURCE, languageCodes, parseLanguagePack, resolveSource } from './language'
import { ORIGINAL_SELECTION } from './original'
import { SPINNER_WORDS } from './source'
import { registerCommandDescribe } from './commands'
import { clearSamples, collectedSamples, recordSample } from './samples'
import { formatMessage, translateConfig, translateExact, translateHint, translateNotice, translatePromptHint } from './translate'
import { createTurnDurationViewModel, normalizeTurnDurationConfig, renderTurnDuration } from './turn-duration'

const selectionRef = { plugin: 'i18n-mod', key: 'selection' } as const
const turnDurationRef = { plugin: 'i18n-mod', key: 'turnDuration' } as const

function reason(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

// 宿主只能追踪同文件内的 $ 调用，I/O 留在注册模块；解析与匹配保持纯函数。
async function loadLanguage($: EngineInterface, source: unknown): Promise<LanguageSelection> {
  const resolved = resolveSource(source, $.plugin.root)
  if (resolved.source === 'en') return ORIGINAL_SELECTION
  const content = await $.fs.read(resolved.path!)
  if (typeof content !== 'string') throw new Error('Language pack must be UTF-8 text')
  return { source: resolved.source, pack: parseLanguagePack(content, resolved.id) }
}

async function listLanguages($: EngineInterface): Promise<string[]> {
  const entries = await $.fs.list(`${$.plugin.root}/locales`)
  return languageCodes(entries.filter(entry => entry.kind === 'file').map(entry => entry.name))
}

async function currentLanguage($: EngineInterface): Promise<LanguageSelection> {
  const { value } = await $.state.get(selectionRef)
  return value ?? ORIGINAL_SELECTION
}

async function currentTurnDuration($: EngineInterface): Promise<TurnDurationConfig> {
  const { value } = await $.state.get(turnDurationRef)
  return value ?? normalizeTurnDurationConfig()
}

async function activate($: EngineInterface, selection: LanguageSelection): Promise<void> {
  await $.state.set(selectionRef, selection)
  await $.command.register({
    name: 'i18n',
    description: selection.pack.command.description,
    argumentHint: '[list | reload | <language or JSON path>]',
  })
  // 菜单与 /help 会缓存描述；切换语言后必须让宿主重新询问 hook。
  $.ui.invalidate('command.describe')
  $.ui.invalidate('config.describe')
  $.ui.invalidate('tool.describe')
}

async function selectLanguage($: EngineInterface, source: unknown, current: LanguageSelection): Promise<LanguageSelection> {
  const resolved = resolveSource(source, $.plugin.root)
  return resolved.source === current.source ? current : loadLanguage($, resolved.source)
}

export const register: Register = (on, options) => {
  registerCommandDescribe(on)

  // 候选包只在保存期间暂存，避免宿主再次派发 config.set 时重复读取；不作为语言缓存。
  let pendingSelection: LanguageSelection | undefined
  on('session.start', async ($, e, next) => {
    // 每次 activation（含热重载）以宿主 options 重建，而不是保留模块内的配置副本。
    await $.state.set(turnDurationRef, normalizeTurnDurationConfig(options))
    let selection = await currentLanguage($)
    try {
      selection = await loadLanguage($, options.language ?? DEFAULT_SOURCE)
    } catch (error) {
      $.ui.toast(formatMessage(selection.pack.command.loadFailed, { reason: reason(error) }))
    }
    await activate($, selection)
    return next(e)
  })

  on('config.set', { key: [
    'i18n-mod.turnDurationMode', 'i18n-mod.turnDurationVisible', 'i18n-mod.turnDurationSpacing',
  ] }, async ($, e, next) => {
    const valid = e.key === 'i18n-mod.turnDurationMode'
      ? e.value === 'native' || e.value === 'custom'
      : e.key === 'i18n-mod.turnDurationVisible'
        ? typeof e.value === 'boolean'
        : e.value === 'compact' || e.value === 'separated'
    if (!valid) return { deny: 'Invalid turn duration configuration value' }
    const saved = await next(e)
    if (saved.deny === undefined) {
      // 保存期间其他字段可能已更新；只用宿主最终值替换本次字段。
      const current = await currentTurnDuration($)
      await $.state.set(turnDurationRef, normalizeTurnDurationConfig({
        turnDurationMode: current.mode,
        turnDurationVisible: current.visible,
        turnDurationSpacing: current.spacing,
        [e.key.slice('i18n-mod.'.length)]: saved.value,
      }))
    }
    return saved
  }).catch(($, e, next) => next.called ? next(e) : { deny: 'Turn duration configuration validation failed' })

  on('config.set', { key: 'i18n-mod.language' }, async ($, e, next) => {
    if (pendingSelection && pendingSelection.source === e.value) return next(e)
    const current = await currentLanguage($)
    let candidate: LanguageSelection
    try {
      candidate = await selectLanguage($, e.value, current)
    } catch (error) {
      return { deny: formatMessage(current.pack.command.loadFailed, { reason: reason(error) }) }
    }
    const saved = await next({ ...e, value: candidate.source })
    if (saved.deny === undefined) {
      try {
        const applied = saved.value === candidate.source ? candidate : await loadLanguage($, saved.value)
        await activate($, applied)
      } catch (error) {
        $.ui.toast(formatMessage(current.pack.command.loadFailed, { reason: reason(error) }))
      }
    }
    return saved
  }).catch(($, e, next) => next.called ? next(e) : { deny: 'Language configuration validation failed' })

  on('command.run', { command: 'i18n' }, async ($, e) => {
    const current = await currentLanguage($)
    const pack = current.pack
    const argument = e.args.trim()
    if (!argument || argument === 'list') {
      let languages = ['en', pack.id]
      try {
        languages = await listLanguages($)
      } catch (error) {
        $.ui.toast(formatMessage(pack.command.loadFailed, { reason: reason(error) }))
      }
      return { text: [
        formatMessage(pack.command.current, { language: `${pack.id} (${pack.name})` }),
        formatMessage(pack.command.source, { source: current.source }),
        formatMessage(pack.command.available, { languages: [...new Set(languages)].join(', ') }),
        pack.command.usage,
      ].join('\n') }
    }
    if (argument === 'samples' || argument === 'samples clear') {
      if (argument === 'samples clear') {
        clearSamples()
        return { text: pack.command.samplesCleared }
      }
      const collected = collectedSamples()
      return { text: collected.count === 0
        ? pack.command.samplesEmpty
        : `${formatMessage(pack.command.samplesHeader, { count: String(collected.count) })}\n${collected.text}` }
    }
    let candidate: LanguageSelection
    try {
      candidate = argument === 'reload'
        ? await loadLanguage($, current.source)
        : await selectLanguage($, argument, current)
    } catch (error) {
      return { text: formatMessage(pack.command.loadFailed, { reason: reason(error) }) }
    }
    if (argument !== 'reload') {
      pendingSelection = candidate
      try {
        const saved = await $.config.set({ key: 'i18n-mod.language', value: candidate.source })
        if (saved.deny !== undefined) {
          return { text: formatMessage(pack.command.saveFailed, { reason: saved.deny }) }
        }
        if (saved.value !== candidate.source) candidate = await loadLanguage($, saved.value)
      } catch (error) {
        return { text: formatMessage(pack.command.saveFailed, { reason: reason(error) }) }
      } finally {
        pendingSelection = undefined
      }
    }
    await activate($, candidate)
    return { text: formatMessage(candidate.pack.command[argument === 'reload' ? 'reloaded' : 'switched'], {
      language: `${candidate.pack.id} (${candidate.pack.name})`,
    }) }
  })

  on('config.describe', async ($, e, next) => {
    const { pack } = await currentLanguage($)
    if (pack.preserveOriginal || !pack.config?.[e.key]) return next(e)
    const translated = translateConfig(e.key, e.label, e.description, pack.config)
    // 宿主原本没有说明时不新增说明行，只翻译已有内容。
    return next({
      ...e,
      label: translated.label,
      ...(e.description === undefined ? {} : { description: translated.description }),
    })
  })

  on('tool.describe', async ($, e, next) => {
    const { pack } = await currentLanguage($)
    const description = translateExact(e.description, pack.tools)
    return description === e.description ? next(e) : next({ ...e, description })
  })

  on('ui.toast', async ($, e, next) => {
    const { pack } = await currentLanguage($)
    if (pack.preserveOriginal) return next(e)
    const text = translateNotice(e.text, pack.notices)
    if (text === e.text) {
      recordSample('toast', e.text)
      return next(e)
    }
    return next({ ...e, text })
  })

  on('ui.notice', async ($, e, next) => {
    if (e.text === undefined) return next(e)
    const { pack } = await currentLanguage($)
    if (pack.preserveOriginal) return next(e)
    const text = translateNotice(e.text, pack.notices)
    if (text === e.text) {
      recordSample('notice', e.text)
      return next(e)
    }
    return next({ ...e, text })
  })

  on('ui.render', { component: 'UserMessage' }, async ($, e, next) => {
    // 只处理后台任务通知；用户输入、其他会话和 teammate 消息保持原样。
    if (e.props.origin.kind !== 'task-notification') return next(e)
    const { pack } = await currentLanguage($)
    if (pack.preserveOriginal) return next(e)
    const text = translateNotice(e.props.text, pack.notices)
    if (text === e.props.text) {
      recordSample('user-message', e.props.text)
      return next(e)
    }
    return next({ ...e, props: { ...e.props, text } })
  })

  on('ui.render', { component: ['Spinner', 'InfoNotice', 'SessionMode', 'PromptHint', 'ToolProgress', 'TurnDuration'] }, async ($, e, next) => {
    const { pack } = await currentLanguage($)
    if (pack.preserveOriginal) return next(e)

    switch (e.component) {
      case 'TurnDuration': {
        // 仅耗时组件订阅独立配置；不从 word/onScreen 推断原生隐藏、后台状态或统计。
        const config = await currentTurnDuration($)
        const model = createTurnDurationViewModel(e.props.durationMs, pack.turnDuration?.elapsed, config)
        const tree = renderTurnDuration(model)
        return tree === undefined ? next(e) : tree
      }
      case 'Spinner': {
        const word = SPINNER_WORDS.has(e.props.word.toLowerCase()) && pack.running ? pack.running : e.props.word
        const message = e.props.message === null ? null : translateExact(e.props.message, pack.messages)
        if (message !== e.props.message) return next({ ...e, props: { ...e.props, word, message } })
        if (message !== null) recordSample('spinner', message)
        return word === e.props.word ? next(e) : next({ ...e, props: { ...e.props, word } })
      }
      case 'InfoNotice': {
        const text = translateNotice(e.props.text, pack.notices)
        if (text === e.props.text) {
          recordSample('info-notice', e.props.text)
          return next(e)
        }
        return next({ ...e, props: { ...e.props, text } })
      }
      case 'SessionMode': {
        const modes = e.props.modes.map(mode => translateExact(mode, pack.modes))
        const changed = modes.some((mode, index) => mode !== e.props.modes[index])
        if (!changed) {
          for (const mode of e.props.modes) recordSample('notice', mode)
          return next(e)
        }
        return next({ ...e, props: { ...e.props, modes } })
      }
      case 'PromptHint': {
        // 改写 hint 会替换原生整行及 tail；仅允许已确认的纯文本组合。
        if (e.props.tail !== undefined) return next(e)
        const hint = translatePromptHint(e.props.hint, pack)
        if (hint === e.props.hint) {
          if (/^[\x20-\x7e]{1,200}$/u.test(e.props.hint)) recordSample('prompt-hint', e.props.hint)
          return next(e)
        }
        return next({ ...e, props: { ...e.props, hint } })
      }
      case 'ToolProgress': {
        const hint = translateHint(e.props.hint, pack)
        if (hint === e.props.hint) {
          recordSample('notice', e.props.hint)
          return next(e)
        }
        return next({ ...e, props: { ...e.props, hint } })
      }
    }
  })
}
