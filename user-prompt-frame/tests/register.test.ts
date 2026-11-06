import { expect, mock, test } from 'claude-code/testing'

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
  test(`caps the bubble and lets the engine wrap at ${columns} columns`, async $ => {
    const text = '现在继续测试，hello123。'.repeat(40)
    const ui = await $.ui.mount({
      plugin: 'user-prompt-frame',
      surface: 'terminal',
      component: 'UserMessage',
      requestId: 'bubble-test',
      viewport: { columns, rows: 40 },
      props: { text, origin: { kind: 'composer' }, isExpanded: true },
    })

    const frame = await ui.find({ type: 'Box', key: 'prompt-frame-bubble-test' })
    const bounds = await ui.find({ type: 'Box', key: 'prompt-frame-bounds-bubble-test' })
    const bubble = await ui.find({ type: 'Box', key: 'prompt-bubble-bubble-test' })
    expect(frame?.props.width).toBe('100%')
    expect(frame?.props.alignItems).toBe('flex-end')
    // 上限用百分比交给引擎按真实带宽换算，模组不再按过期视口算列数。
    expect(bounds?.props.width).toBe('70%')
    expect(bounds?.props.alignItems).toBe('flex-end')
    expect(bubble?.props.paddingX).toBe(2)
    expect(bubble?.props.borderStyle).toBe('single')
    expect(bubble?.props.borderColor).toBe('cyan')
    expect(bubble?.props.width).toBeUndefined()

    // 正文保持为一个 Text 节点：换行由引擎按真实带宽处理，不再自绘定宽行。
    const body = await ui.find({ type: 'Text', text })
    expect(body).toBeDefined()
    const frameRows = await ui.findAll({ type: 'Text' })
    expect(frameRows.some(row => row.text.startsWith('│'))).toBe(false)

    await ui.unmount()
  })
}

test('keeps multi-line text in one engine-wrapped node', async $ => {
  const text = '第一行\n\nsecond line\n第三行\n'
  const ui = await $.ui.mount({
    plugin: 'user-prompt-frame',
    surface: 'terminal',
    component: 'UserMessage',
    viewport: { columns: 80, rows: 40 },
    props: { text, origin: { kind: 'composer' }, isExpanded: false },
  })

  expect(await ui.find({ type: 'Text', text })).toBeDefined()
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

for (const surface of ['terminal', 'desktop'] as const) {
  test(`reads the standalone panel's saved prompt-frame format on ${surface}`, async ($, on) => {
    mock.env(on, { HOME: 'D:/test-home' })
    const paths: string[] = []
    on('fs.read', ($, e) => {
      paths.push(e.path)
      return { value: JSON.stringify({ language: 'zh', promptFrame: { title: '独立面板设置', color: 'green' } }) }
    })
    const ui = await $.ui.mount({
      plugin: 'user-prompt-frame', surface, component: 'UserMessage',
      props: { text: '兼容格式', origin: { kind: 'composer' }, isExpanded: true },
    })
    expect(await ui.find({ type: 'Text', text: /独立面板设置/ })).toBeDefined()
    expect((await ui.find({ type: 'Text', text: /独立面板设置/ }))?.props.color).toBe('green')
    expect(paths.every(path => path.replace(/\\/gu, '/').endsWith('/.config/my-cc-mods/config.json'))).toBe(true)
    await ui.unmount()
  })
}

test('maps the saved corner glyphs back to an engine border style', async ($, on) => {
  mock.env(on, { HOME: 'D:/test-home' })
  on('fs.read', () => ({
    value: JSON.stringify({
      promptFrame: {
        title: '圆角',
        topLeft: '╭',
        topRight: '╮',
        bottomLeft: '╰',
        bottomRight: '╯',
      },
    }),
  }))
  const ui = await $.ui.mount({
    plugin: 'user-prompt-frame',
    surface: 'terminal',
    component: 'UserMessage',
    requestId: 'round-bubble',
    props: { text: '旧配置', origin: { kind: 'composer' }, isExpanded: true },
  })

  expect((await ui.find({ type: 'Box', key: 'prompt-bubble-round-bubble' }))?.props.borderStyle).toBe('round')
  await ui.unmount()
})

test('prefers an explicit borderStyle over the saved glyphs', async ($, on) => {
  mock.env(on, { HOME: 'D:/test-home' })
  on('fs.read', () => ({
    value: JSON.stringify({
      promptFrame: { title: '双线', borderStyle: 'double', topLeft: '┌', topRight: '┐', bottomLeft: '└', bottomRight: '┘' },
    }),
  }))
  const ui = await $.ui.mount({
    plugin: 'user-prompt-frame',
    surface: 'terminal',
    component: 'UserMessage',
    requestId: 'double-bubble',
    props: { text: '新配置', origin: { kind: 'composer' }, isExpanded: true },
  })

  expect((await ui.find({ type: 'Box', key: 'prompt-bubble-double-bubble' }))?.props.borderStyle).toBe('double')
  await ui.unmount()
})
