import { expect, test } from 'claude-code/testing'

for (const surface of ['terminal', 'desktop', 'vscode', 'mobile'] as const) {
  test(`frames composer prompts on ${surface}`, async $ => {
    const ui = await $.ui.mount({
      plugin: 'user-prompt-frame',
      surface,
      component: 'UserMessage',
      props: {
        text: '你给的这个高亮 Mod 效果如何？',
        origin: { kind: 'composer' },
        isExpanded: false,
      },
    })

    expect(await ui.find({ type: 'Text', text: /用户输入/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /高亮 Mod/ })).toBeDefined()
    await ui.unmount()
  })
}

test('leaves task notifications and sender messages to the engine', async ($, on) => {
  on('ui.render', { component: 'UserMessage' }, ($, e) => ({
    type: 'Text',
    children: [e.props.text],
  }))

  for (const props of [
    {
      text: 'background task completed',
      origin: { kind: 'task-notification' } as const,
      isExpanded: true,
      task: { id: 'test-task', status: 'completed' },
    },
    {
      text: 'peer session message',
      origin: { kind: 'peer' } as const,
      isExpanded: false,
      from: { name: 'test-peer' },
    },
    {
      text: 'SDK-originated message',
      origin: { kind: 'sdk' } as const,
      isExpanded: true,
    },
  ]) {
    const ui = await $.ui.mount({
      plugin: 'user-prompt-frame',
      surface: 'terminal',
      component: 'UserMessage',
      props,
    })

    expect(await ui.find({ type: 'Text', text: /用户输入/ })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: props.text })).toBeDefined()
    await ui.unmount()
  }
})

for (const columns of [32, 80, 160, 240]) {
  test(`preserves long mixed text and aligns rows at ${columns} columns`, async $ => {
    const text = '现在继续测试，hello123。'.repeat(40)
    const ui = await $.ui.mount({
      plugin: 'user-prompt-frame',
      surface: 'terminal',
      component: 'UserMessage',
      viewport: { columns, rows: 40 },
      props: { text, origin: { kind: 'composer' }, isExpanded: true },
    })

    const frame = await ui.find({ type: 'Box' })
    const rows = await ui.findAll({ type: 'Text' })
    const body = rows.filter(row => row.text.startsWith('│'))
    const recovered = body.map(row => row.text.slice(3, -3).replace(/ +$/u, '')).join('')

    expect(frame?.props.width).toBe(columns - 4)
    expect(recovered).toBe(text)
    expect(body.length).toBeGreaterThan(1)

    for (const row of body) {
      expect(row.text.startsWith('│')).toBe(true)
      expect(row.text.endsWith('│')).toBe(true)
    }

    await ui.unmount()
  })
}

test('preserves explicit newlines and blank lines', async $ => {
  const ui = await $.ui.mount({
    plugin: 'user-prompt-frame',
    surface: 'terminal',
    component: 'UserMessage',
    viewport: { columns: 80, rows: 40 },
    props: {
      text: '第一行\n\nsecond line\n第三行\n',
      origin: { kind: 'composer' },
      isExpanded: false,
    },
  })

  const rows = await ui.findAll({ type: 'Text' })
  const body = rows.filter(row => row.text.startsWith('│'))
  expect(body.map(row => row.text.slice(3, -3).replace(/ +$/u, ''))).toEqual([
    '第一行', '', 'second line', '第三行', '',
  ])
  await ui.unmount()
})

test('keeps the frame when transcript visibility changes after submit', async $ => {
  const ui = await $.ui.mount({
    plugin: 'user-prompt-frame',
    surface: 'terminal',
    component: 'UserMessage',
    viewport: { columns: 80, rows: 20 },
    props: {
      text: '本轮用户输入',
      origin: { kind: 'composer' },
      isExpanded: true,
      onScreen: { first: 0, last: 2, of: 3 },
    },
  })

  expect(await ui.find({ type: 'Text', text: /用户输入/ })).toBeDefined()

  await ui.redraw({
    text: '本轮用户输入',
    origin: { kind: 'unclassified' },
    isExpanded: true,
    onScreen: null,
  })
  expect(await ui.find({ type: 'Text', text: /用户输入/ })).toBeDefined()

  await ui.redraw({
    text: '本轮用户输入',
    origin: { kind: 'composer' },
    isExpanded: true,
    onScreen: { first: 4, last: 6, of: 7 },
  })
  expect(await ui.find({ type: 'Text', text: /用户输入/ })).toBeDefined()

  await ui.unmount()
})

test('frames a transcript remount with a new request identity', async $ => {
  const text = '滚动后仍保持用户输入框'
  const composer = await $.ui.mount({
    plugin: 'user-prompt-frame',
    surface: 'terminal',
    component: 'UserMessage',
    requestId: 'composer-instance',
    props: { text, origin: { kind: 'composer' }, isExpanded: true },
  })

  expect(await composer.find({ type: 'Text', text: /用户输入/ })).toBeDefined()
  await composer.unmount()

  const transcript = await $.ui.mount({
    plugin: 'user-prompt-frame',
    surface: 'terminal',
    component: 'UserMessage',
    requestId: 'transcript-instance',
    props: {
      text: '滚动后仍保持用户',
      origin: { kind: 'unclassified' },
      isExpanded: false,
      onScreen: null,
    },
  })

  expect(await transcript.find({ type: 'Text', text: /用户输入/ })).toBeDefined()
  await transcript.unmount()
})
