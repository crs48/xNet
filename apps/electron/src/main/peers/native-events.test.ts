import { expect, it } from 'vitest'
import { readHomeRelayUpdate } from './native-events'

it('accepts the native error-first update and the documented single-argument update', () => {
  expect(readHomeRelayUpdate([null, ['https://relay.example/']])).toEqual([
    'https://relay.example/'
  ])
  expect(readHomeRelayUpdate([['https://relay.example/']])).toEqual(['https://relay.example/'])
  expect(readHomeRelayUpdate([null, []])).toEqual([])
})

it('does not mistake native errors or malformed events for a healthy relay', () => {
  expect(() => readHomeRelayUpdate([new Error('offline'), []])).toThrow('watcher failed')
  for (const args of [[], [null], [null, null], [null, [123]], [null, [], []]]) {
    expect(() => readHomeRelayUpdate(args)).toThrow('invalid update')
  }
})
