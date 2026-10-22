import { expect, test } from 'claude-code/testing'
import { clearSamples, collectedSamples, recordSample } from '../hooks/samples'

test('collects unique english samples, counts repeats and clears on demand', () => {
  clearSamples()
  recordSample('toast', 'Update available: 2.1.301')
  recordSample('toast', 'Update available: 2.1.301')
  recordSample('spinner', 'Creating notes.md')
  recordSample('notice', '中文不应采集')
  recordSample('notice', '   ')
  expect(collectedSamples()).toEqual({
    count: 2,
    text: [
      'toast\t"Update available: 2.1.301"\t×2',
      'spinner\t"Creating notes.md"',
    ].join('\n'),
  })
  clearSamples()
  expect(collectedSamples()).toEqual({ count: 0, text: '' })
})

test('caps the number of samples and the stored text length', () => {
  clearSamples()
  for (let index = 0; index < 250; index++) recordSample('notice', `sample ${index}`)
  expect(collectedSamples().count).toBe(200)
  clearSamples()
  recordSample('notice', 'a'.repeat(600))
  expect(collectedSamples().text.length).toBeLessThan(520)
  clearSamples()
})
