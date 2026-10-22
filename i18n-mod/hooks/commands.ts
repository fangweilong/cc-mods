import type { EngineInterface, On } from 'claude-code'
import type { LanguageSelection } from '../types'
import { ORIGINAL_SELECTION } from './original'
import { translateCommand } from './translate'

const selectionRef = { plugin: 'i18n-mod', key: 'selection' } as const

async function currentLanguage($: EngineInterface): Promise<LanguageSelection> {
  const { value } = await $.state.get(selectionRef)
  return value ?? ORIGINAL_SELECTION
}

// 命令展示文案独立于主注册流程：只读取已激活的语言包，不改变执行、可见性或 provider。
export function registerCommandDescribe(on: On): void {
  on('command.describe', async ($, e, next) => {
    const { pack } = await currentLanguage($)
    // 只处理宿主内置命令，避免同名插件命令被误译。
    if (pack.preserveOriginal || e.provider.plugin !== 'engine') return next(e)
    const translated = translateCommand(e.command, e.description, e.argumentHint, pack.commands)
    return translated.description === e.description && translated.argumentHint === e.argumentHint
      ? next(e)
      : next({ ...e, ...translated })
  })
}
