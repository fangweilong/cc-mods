import type { On } from 'claude-code'
import { parseLanguagePack } from '../hooks/language'

// 最小测试词典，不导入生产语言包，真实 JSON 文件另行进行资产校验。
export const ZH_DATA = {
  id: 'zh-CN', name: '简体中文', running: '处理中', completed: '已完成', duration: '{word}，用时 {duration}',
  hints: {
    shortcuts: '查看快捷键', interrupt: '中断', background: '转入后台运行', expand: '展开',
    collapse: '收起', history: '查看历史', cycleMode: '切换模式', acceptSuggestion: '接受建议',
  },
  modes: { focus: '专注模式', 'memory paused': '记忆已暂停' },
  messages: { 'Thinking…': '思考中…' },
  notices: { 'Update available': '有可用更新', 'Welcome back!': '欢迎回来！' },
  command: {
    current: '当前界面语言：{language}', switched: '界面语言已切换为 {language}。',
    loadFailed: '语言包加载失败，已保留当前语言：{reason}', saveFailed: '界面语言保存失败：{reason}',
    reloaded: '语言包已重新加载：{language}。',
  },
}
export const zhCN = parseLanguagePack(JSON.stringify(ZH_DATA))
export const JA_DATA = { id: 'ja', name: '日本語', hints: { shortcuts: 'ショートカット' } }

export function mockWorld(on: On) {
  const world = {
    files: { 'locales/zh-CN.json': JSON.stringify(ZH_DATA) } as Record<string, string>,
    reads: [] as string[], saves: [] as unknown[], toasts: [] as string[],
    denySave: '', rewriteSave: undefined as string | undefined,
    lists: 0, description: '',
  }
  on('fs.read', ($, e) => {
    const path = e.path.split(String.fromCharCode(92)).join('/')
    const marker = '/i18n-mod/'
    const offset = path.indexOf(marker)
    const relative = offset >= 0 ? path.slice(offset + marker.length) : path
    const posix = relative.replace(/^[a-z]:/i, '')
    const name = Object.prototype.hasOwnProperty.call(world.files, relative) ? relative : posix
    world.reads.push(name)
    return Object.prototype.hasOwnProperty.call(world.files, name)
      ? { value: world.files[name]! }
      : { deny: 'ENOENT: language file not found' }
  })
  on('fs.list', () => {
    world.lists++
    const names = Object.keys(world.files).filter(name => name.startsWith('locales/') && !name.slice(8).includes('/'))
    return { value: names.map(name => ({
      name: name.slice(8), kind: 'file' as const, size: world.files[name]!.length, mtimeMs: 0, isLink: false,
    })) }
  })
  on('command.register', ($, e) => {
    world.description = e.description
    return { value: { command: e.name } }
  })
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('config.set', ($, e) => {
    if (world.denySave) return { deny: world.denySave }
    world.saves.push({ key: e.key, value: e.value })
    return { value: world.rewriteSave ?? e.value }
  })
  on('ui.toast', ($, e) => {
    world.toasts.push(e.text)
    return { value: undefined }
  })
  return world
}
