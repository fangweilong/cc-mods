import type { RenderElement } from 'claude-code'
import { expect, test } from 'claude-code/testing'
import type { TurnDurationConfig } from '../types'
import { parseLanguagePack } from '../hooks/language'
import {
  createTurnDurationViewModel,
  formatTurnDuration,
  normalizeTurnDurationConfig,
  renderTurnDuration,
} from '../hooks/turn-duration'

const defaults: TurnDurationConfig = { mode: 'native', visible: true, spacing: 'compact' }
const custom: TurnDurationConfig = { ...defaults, mode: 'custom' }
const template = '本轮用时 {duration}'

test('normalizes missing options to native, visible and compact', () => {
  expect(normalizeTurnDurationConfig()).toEqual(defaults)
  expect(normalizeTurnDurationConfig({})).toEqual(defaults)
  expect(normalizeTurnDurationConfig({ language: 'zh-CN' })).toEqual(defaults)
  expect(normalizeTurnDurationConfig({ mode: 'custom', visible: false, spacing: 'separated' })).toEqual(defaults)
})

for (const mode of ['native', 'custom'] as const) {
  for (const visible of [true, false]) {
    for (const spacing of ['compact', 'separated'] as const) {
      test(`normalizes valid options ${mode}/${visible}/${spacing} without mutating input`, () => {
        const options = Object.freeze({ turnDurationMode: mode, turnDurationVisible: visible, turnDurationSpacing: spacing })
        expect(normalizeTurnDurationConfig(options)).toEqual({ mode, visible, spacing })
        expect(options).toEqual({ turnDurationMode: mode, turnDurationVisible: visible, turnDurationSpacing: spacing })
      })
    }
  }
}

for (const value of [undefined, null, '', ' custom ', 'CUSTOM', 'automatic', true, false, 0, 1, [], {}]) {
  test(`does not coerce invalid mode ${JSON.stringify(value)}`, () => {
    expect(normalizeTurnDurationConfig({ turnDurationMode: value, turnDurationVisible: false, turnDurationSpacing: 'separated' }))
      .toEqual({ mode: 'native', visible: false, spacing: 'separated' })
  })
}

for (const value of [undefined, null, '', 'true', 'false', 0, 1, [], {}]) {
  test(`does not coerce invalid visibility ${JSON.stringify(value)}`, () => {
    expect(normalizeTurnDurationConfig({ turnDurationMode: 'custom', turnDurationVisible: value, turnDurationSpacing: 'separated' }))
      .toEqual({ mode: 'custom', visible: true, spacing: 'separated' })
  })
}

for (const value of [undefined, null, '', ' separated ', 'SEPARATED', 'auto', true, false, 0, 1, [], {}]) {
  test(`does not coerce invalid spacing ${JSON.stringify(value)}`, () => {
    expect(normalizeTurnDurationConfig({ turnDurationMode: 'custom', turnDurationVisible: false, turnDurationSpacing: value }))
      .toEqual({ mode: 'custom', visible: false, spacing: 'compact' })
  })
}

// Compact units omit zero components; a total below one second is always 0s.
for (const [milliseconds, formatted] of [
  [0, '0s'], [-0, '0s'], [0.5, '0s'], [999.999, '0s'],
  [1000, '1s'], [1999.999, '1s'], [59000, '59s'], [59999.999, '59s'],
  [60000, '1m'], [60999.999, '1m'], [61000, '1m 1s'], [64000, '1m 4s'],
  [758000, '12m 38s'], [3599000, '59m 59s'], [3599999.999, '59m 59s'],
  [3600000, '1h'], [3601000, '1h 1s'], [3660000, '1h 1m'], [3661000, '1h 1m 1s'],
  [86399000, '23h 59m 59s'], [86399999.999, '23h 59m 59s'], [86400000, '1d'],
  [86401000, '1d 1s'], [90061000, '1d 1h 1m 1s'], [172800000, '2d'],
] as const) {
  test(`formats ${milliseconds}ms as ${formatted} by flooring seconds`, () => {
    expect(formatTurnDuration(milliseconds)).toBe(formatted)
  })
}

for (const milliseconds of [-0.001, -1, -1000, NaN, Infinity, -Infinity]) {
  test(`rejects invalid duration ${milliseconds} rather than pretending it is zero`, () => {
    expect(formatTurnDuration(milliseconds)).toBeUndefined()
    expect(createTurnDurationViewModel(milliseconds, template, custom))
      .toEqual({ kind: 'native', reason: 'invalid-duration' })
  })
}

test('native mode takes priority over visibility, invalid duration and missing template', () => {
  expect(createTurnDurationViewModel(NaN, undefined, { ...defaults, visible: false, spacing: 'separated' }))
    .toEqual({ kind: 'native', reason: 'native-mode' })
  expect(renderTurnDuration({ kind: 'native', reason: 'native-mode' })).toBeUndefined()
})

test('hidden custom mode takes priority over invalid duration and missing template', () => {
  expect(createTurnDurationViewModel(NaN, undefined, { ...custom, visible: false, spacing: 'separated' }))
    .toEqual({ kind: 'hidden' })
})

test('missing template explicitly falls back to the whole native line', () => {
  const model = createTurnDurationViewModel(64000, undefined, custom)
  expect(model).toEqual({ kind: 'native', reason: 'missing-template' })
  expect(renderTurnDuration(model)).toBeUndefined()
})

for (const elapsed of ['', '   ', '\t\n', '本轮用时', '{duration} {word}', '{{duration}}', '{duration', '{duration}}', '{Duration}', '{duration}\u0000', '{duration}\u001b', '{duration}\u007f']) {
  test(`refuses unsafe or invalid template ${JSON.stringify(elapsed)} consistently with the schema`, () => {
    expect(() => parseLanguagePack(JSON.stringify({ id: 'zh-CN', name: '中文', turnDuration: { elapsed } }))).toThrow()
    const model = createTurnDurationViewModel(64000, elapsed, custom)
    expect(model).toEqual({ kind: 'native', reason: 'invalid-template' })
    expect(renderTurnDuration(model)).toBeUndefined()
  })
}

for (const [elapsed, text] of [
  [template, '本轮用时 1m 4s'],
  ['Elapsed: {duration}', 'Elapsed: 1m 4s'],
  ['{duration}', '1m 4s'],
  ['{duration} / {duration}', '1m 4s / 1m 4s'],
  ['  $& \\ {duration}  ', '  $& \\ 1m 4s  '],
] as const) {
  test(`uses only the supplied neutral template ${JSON.stringify(elapsed)}`, () => {
    const pack = parseLanguagePack(JSON.stringify({ id: 'zh-CN', name: '中文', turnDuration: { elapsed } }))
    expect(createTurnDurationViewModel(64000, pack.turnDuration?.elapsed, custom))
      .toEqual({ kind: 'custom', text, marginTop: 0 })
  })
}

for (const [spacing, marginTop] of [['compact', 0], ['separated', 1]] as const) {
  test(`builds a full-width ${spacing} row with a nonshrinking two-column symbol and dim body`, () => {
    const config = Object.freeze({ ...custom, spacing })
    const model = createTurnDurationViewModel(758000, template, config)
    expect(model).toEqual({ kind: 'custom', text: '本轮用时 12m 38s', marginTop })
    const tree: RenderElement | undefined = renderTurnDuration(model)
    expect(tree).toEqual({
      type: 'Box', props: { width: '100%', flexDirection: 'row', marginTop },
      children: [
        { type: 'Box', props: { width: 2, minWidth: 2, flexShrink: 0 }, children: [{ type: 'Text', children: ['✻'] }] },
        { type: 'Text', props: { dimColor: true }, children: ['本轮用时 12m 38s'] },
      ],
    })
    expect(config).toEqual({ ...custom, spacing })
    expect(renderTurnDuration(model)).toEqual(tree)
    expect(model).toEqual({ kind: 'custom', text: '本轮用时 12m 38s', marginTop })
  })

  test(`hidden ${spacing} tree has no Text, prefix, margin, border or engine node`, () => {
    const model = createTurnDurationViewModel(758000, template, { ...custom, visible: false, spacing })
    expect(renderTurnDuration(model)).toEqual({ type: 'Box', children: [] })
  })

  test(`host accepts the ${spacing} custom and hidden RenderElement contracts`, async ($, on) => {
    let visible = true
    on('ui.render', { component: 'TurnDuration' }, () => {
      const model = createTurnDurationViewModel(758000, template, { ...custom, visible, spacing })
      return renderTurnDuration(model)!
    })
    const props = { word: 'FutureVerb', durationMs: 758000, onScreen: null }
    const ui = await $.ui.mount({ plugin: 'i18n-mod', surface: 'terminal', component: 'TurnDuration', props })
    expect((await ui.find({ type: 'Text', text: '本轮用时 12m 38s' }))?.text).toBe('本轮用时 12m 38s')
    expect((await ui.find({ type: 'Text', text: '✻' }))?.text).toBe('✻')
    visible = false
    await ui.redraw(props)
    expect(await ui.find({ type: 'Text' })).toBeUndefined()
    expect(await ui.drawn()).toEqual({ type: 'Box', children: [], part: { plugin: 'test' } })
    await ui.unmount()
  })
}
