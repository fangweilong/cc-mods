import type { LanguagePack, LanguageSelection } from '../types'

// English 是无文件依赖的原文模式，也为不完整的 JSON 语言包提供命令文案。
export const ORIGINAL_PACK: LanguagePack = {
  id: 'en',
  name: 'English',
  preserveOriginal: true,
  command: {
    description: 'Select the UI language or a JSON language pack',
    current: 'Current UI language: {language}',
    source: 'Language source: {source}',
    available: 'Available language codes: {languages}; a JSON file path is also accepted.',
    switched: 'UI language set to {language}.',
    reloaded: 'Language pack reloaded: {language}.',
    unsupported: 'Invalid language code or JSON path: {language}',
    loadFailed: 'Could not load the language pack; keeping the current language: {reason}',
    saveFailed: 'Could not save the UI language: {reason}',
    usage: 'Usage: /i18n [list | reload | <language code or JSON path>]',
  },
}

export const ORIGINAL_SELECTION: LanguageSelection = { source: 'en', pack: ORIGINAL_PACK }
