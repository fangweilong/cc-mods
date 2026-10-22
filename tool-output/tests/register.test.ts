import { expect, mock, test } from 'claude-code/testing'
import {
  DEFAULT_TOOL_OUTPUT_CONFIG,
  formatOutputSize,
  normalizeToolOutputConfig,
  shouldFold,
  summarizeOutput,
} from '../hooks/register'

const longOutput = { stdout: Array.from({ length: 40 }, (_, index) => `line ${index}`).join('\n') }

function configFile(value: unknown) {
  return JSON.stringify(value)
}

test('normalizes tool output configuration', () => {
  expect(normalizeToolOutputConfig(undefined)).toEqual(DEFAULT_TOOL_OUTPUT_CONFIG)
  expect(normalizeToolOutputConfig({ toolOutput: { mode: 'flat', foldAfterLines: 0, keepErrorsExpanded: false } }))
    .toEqual({ mode: 'flat', foldAfterLines: 1, keepErrorsExpanded: false })
  expect(normalizeToolOutputConfig({ mode: 'bogus' }).mode).toBe('fold')
})

test('summarizes and folds long output only', () => {
  const summary = summarizeOutput(longOutput)
  expect(summary.lines).toBe(40)
  expect(summary.chars).toBeGreaterThan(0)
  expect(shouldFold(longOutput)).toBe(true)
  expect(shouldFold('short')).toBe(false)
  expect(formatOutputSize(512)).toBe('512 B')
  expect(formatOutputSize(2048)).toBe('2.0 KB')
})

test('folds a long standalone result and expands it on demand', async ($, on) => {
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('fs.read', () => ({ value: configFile({ toolOutput: { mode: 'fold' } }) }))
  on('ui.render', { component: 'ToolResult' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    return Text({ children: ['native result'] })
  })
  mock.env(on, { HOME: '/test-home' })

  await $.session.start({ cwd: '/work/project', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({
    plugin: 'tool-output',
    surface: 'terminal',
    component: 'ToolResult',
    requestId: 'call-long',
    props: { tool_use_id: 'call-long', tool: 'Bash', output: longOutput, isErrored: false },
  })

  expect(await ui.find({ type: 'Button', key: 'tool-output-expand-call-long' })).toBeDefined()
  await ui.press({ key: 'tool-output-expand-call-long' })
  expect(await ui.find({ type: 'Button', key: 'tool-output-collapse-call-long' })).toBeDefined()
  await ui.press({ key: 'tool-output-collapse-call-long' })
  expect(await ui.find({ type: 'Button', key: 'tool-output-expand-call-long' })).toBeDefined()
  await ui.unmount()
})

test('leaves short and errored results to the native renderer', async ($, on) => {
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('fs.read', () => ({ value: configFile({ toolOutput: { mode: 'fold', keepErrorsExpanded: true } }) }))
  on('ui.render', { component: 'ToolResult' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    return Text({ children: ['native result'] })
  })
  mock.env(on, { HOME: '/test-home' })

  await $.session.start({ cwd: '/work/project', surface: 'terminal', isInteractive: true })
  const short = await $.ui.mount({
    plugin: 'tool-output',
    surface: 'terminal',
    component: 'ToolResult',
    requestId: 'call-short',
    props: { tool_use_id: 'call-short', tool: 'Bash', output: 'ok', isErrored: false },
  })
  expect(await short.find({ type: 'Button', key: 'tool-output-expand-call-short' })).toBeUndefined()
  await short.unmount()

  const errored = await $.ui.mount({
    plugin: 'tool-output',
    surface: 'terminal',
    component: 'ToolResult',
    requestId: 'call-error',
    props: { tool_use_id: 'call-error', tool: 'Bash', output: longOutput, isErrored: true },
  })
  expect(await errored.find({ type: 'Button', key: 'tool-output-expand-call-error' })).toBeUndefined()
  await errored.unmount()
})

test('flat mode unfolds tool groups', async ($, on) => {
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('fs.read', () => ({ value: configFile({ toolOutput: { mode: 'flat' } }) }))
  mock.env(on, { HOME: '/test-home' })
  let seen: boolean | undefined
  on('ui.render', { component: 'ToolGroup' }, ($, e) => {
    seen = (e.props as { isExpanded: boolean }).isExpanded
    const { Text } = $.ui.resolve(e)
    return Text({ children: ['native group'] })
  })

  await $.session.start({ cwd: '/work/project', surface: 'terminal', isInteractive: true })
  const group = await $.ui.mount({
    plugin: 'tool-output',
    surface: 'terminal',
    component: 'ToolGroup',
    requestId: 'group-1',
    props: { calls: [], isActive: false, isExpanded: false },
  })
  expect(seen).toBe(true)
  await group.unmount()
})

test('off mode leaves tool groups alone', async ($, on) => {
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('fs.read', () => ({ value: configFile({ toolOutput: { mode: 'off' } }) }))
  mock.env(on, { HOME: '/test-home' })
  let seen: boolean | undefined
  on('ui.render', { component: 'ToolGroup' }, ($, e) => {
    seen = (e.props as { isExpanded: boolean }).isExpanded
    const { Text } = $.ui.resolve(e)
    return Text({ children: ['native group'] })
  })

  await $.session.start({ cwd: '/work/project', surface: 'terminal', isInteractive: true })
  const untouched = await $.ui.mount({
    plugin: 'tool-output',
    surface: 'terminal',
    component: 'ToolGroup',
    requestId: 'group-2',
    props: { calls: [], isActive: false, isExpanded: false },
  })
  expect(seen).toBe(false)
  await untouched.unmount()
})
