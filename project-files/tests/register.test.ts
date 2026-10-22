import { expect, test } from 'claude-code/testing'
import { isPathInside, register, truncatePreview } from '../hooks/register'

function mockFs(on: Parameters<typeof register>[0]) {
  const world = {
    cwd: 'C:/work/project',
    lists: [] as string[],
    reads: [] as string[],
    opened: [] as string[],
    closed: 0,
  }
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('session.cwd', () => ({ value: world.cwd }))
  on('command.register', () => ({ value: { command: 'project-files' } }))
  on('ui.open', ($, e) => {
    world.opened.push(e.title ?? '')
    return { value: { isPlaced: true } }
  })
  on('ui.close', () => {
    world.closed += 1
    return { value: undefined }
  })
  on('fs.stat', ($, e) => ({
    value: { kind: 'dir', size: 0, mtimeMs: 0, isLink: false, realPath: e.path },
  }))
  on('fs.list', ($, e) => {
    world.lists.push(e.path)
    return { value: [
      { name: 'src', kind: 'dir', size: 0, mtimeMs: 0, isLink: false },
      { name: 'README.md', kind: 'file', size: 12, mtimeMs: 0, isLink: false },
    ] }
  })
  on('fs.read', ($, e) => {
    world.reads.push(e.path)
    return { value: { base64: btoa('# hello') } }
  })
  return world
}

test('rejects parent traversal and paths outside the session directory', () => {
  expect(isPathInside('C:/work/project', 'C:/work/project/src')).toBe(true)
  expect(isPathInside('C:/work/project', 'C:/work/project/../secrets')).toBe(false)
  expect(isPathInside('C:/work/project', 'C:/work/projects-other')).toBe(false)
})

test('truncates long previews with an explicit marker', () => {
  const result = truncatePreview('x'.repeat(12_001))
  expect(result.endsWith('…（内容已截断）')).toBe(true)
  expect(result.length).toBe(12_009)
})

test('opens, refreshes and closes the independent pane', async ($, on) => {
  const world = mockFs(on)
  await $.session.start({ cwd: world.cwd, surface: 'terminal', isInteractive: true })
  await $.command.run({ origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 }, command: 'project-files', args: '' })
  expect(world.opened).toEqual(['项目文件'])
  expect(world.lists).toEqual(['C:\\work\\project'])

  await $.command.run({ origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 }, command: 'project-files', args: 'refresh' })
  expect(world.lists).toEqual(['C:\\work\\project', 'C:\\work\\project'])
  await $.command.run({ origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 }, command: 'project-files', args: 'close' })
  expect(world.closed).toBe(1)
})
