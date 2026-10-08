import type { EngineInterface, Register } from 'claude-code'
import type { LanguageSelection } from '../types'
import { DEFAULT_SOURCE, languageCodes, parseLanguagePack, resolveSource } from './language'
import { ORIGINAL_SELECTION } from './original'
import { DURATION_WORDS, SPINNER_WORDS } from './source'
import { formatDuration, formatMessage, translateExact, translateHint } from './translate'

const selectionRef = { plugin: 'i18n-mod', key: 'selection' } as const

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

async function activate($: EngineInterface, selection: LanguageSelection): Promise<void> {
  await $.state.set(selectionRef, selection)
  await $.command.register({
    name: 'i18n',
    description: selection.pack.command.description,
    argumentHint: '[list | reload | <language or JSON path>]',
  })
}

async function selectLanguage($: EngineInterface, source: unknown, current: LanguageSelection): Promise<LanguageSelection> {
  const resolved = resolveSource(source, $.plugin.root)
  return resolved.source === current.source ? current : loadLanguage($, resolved.source)
}

export const register: Register = (on, options) => {
  // 候选包只在保存期间暂存，避免宿主再次派发 config.set 时重复读取；不作为语言缓存。
  let pendingSelection: LanguageSelection | undefined
  on('session.start', async ($, e, next) => {
    let selection = await currentLanguage($)
    try {
      selection = await loadLanguage($, options.language ?? DEFAULT_SOURCE)
    } catch (error) {
      $.ui.toast(formatMessage(selection.pack.command.loadFailed, { reason: reason(error) }))
    }
    await activate($, selection)
    return next(e)
  })

  // /config 修改前验证文件；自己的命令已验证候选包，跳过重复读取。
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

  on('ui.render', { component: ['Spinner', 'TurnDuration', 'InfoNotice', 'SessionMode', 'PromptHint', 'ToolProgress'] }, async ($, e, next) => {
    const { pack } = await currentLanguage($)
    if (pack.preserveOriginal) return next(e)

    switch (e.component) {
      case 'Spinner': {
        const word = SPINNER_WORDS.has(e.props.word.toLowerCase()) && pack.running ? pack.running : e.props.word
        const message = e.props.message === null ? null : translateExact(e.props.message, pack.messages)
        return word === e.props.word && message === e.props.message
          ? next(e)
          : next({ ...e, props: { ...e.props, word, message } })
      }
      case 'TurnDuration': {
        if (!DURATION_WORDS.has(e.props.word.toLowerCase()) || !pack.completed || !pack.duration) return next(e)
        const { Text } = $.ui.resolve(e)
        return Text({ dimColor: true, children: formatMessage(pack.duration, {
          word: pack.completed,
          duration: formatDuration(e.props.durationMs),
        }) })
      }
      case 'InfoNotice': {
        const text = translateExact(e.props.text, pack.notices)
        return text === e.props.text ? next(e) : next({ ...e, props: { ...e.props, text } })
      }
      case 'SessionMode': {
        const modes = e.props.modes.map(mode => translateExact(mode, pack.modes))
        return modes.every((mode, index) => mode === e.props.modes[index])
          ? next(e)
          : next({ ...e, props: { ...e.props, modes } })
      }
      case 'PromptHint': {
        const hint = translateHint(e.props.hint, pack)
        return hint === e.props.hint ? next(e) : next({ ...e, props: { ...e.props, hint } })
      }
      case 'ToolProgress': {
        const hint = translateHint(e.props.hint, pack)
        return hint === e.props.hint ? next(e) : next({ ...e, props: { ...e.props, hint } })
      }
    }
  })
}
