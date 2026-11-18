import { describe, expect, it } from 'vitest'
import {
  readExtensionCheckDecision,
  extensionCheckPassed
} from './community-extension-check-policy'
const action = {
  type: 'click',
  target: 'element-1',
  value: null,
  width: null,
  expectText: "O's turn"
}
const decision = { status: 'act', summary: 'Try a move', actions: [action], extension: null }
describe('bounded extension preview decisions', () => {
  it('accepts bounded controls and full-source revisions', () => {
    expect(readExtensionCheckDecision(JSON.stringify(decision))).toEqual(decision)
    expect(
      readExtensionCheckDecision(
        JSON.stringify({
          ...decision,
          status: 'revise',
          actions: [],
          extension: {
            title: 'Game',
            summary: 'Fix layout',
            source: 'export default () => <p>Game</p>'
          }
        })
      ).status
    ).toBe('revise')
  })
  it.each([
    { ...decision, actions: [{ ...action, type: 'evaluate', value: 'process.exit()' }] },
    { ...decision, actions: [{ ...action, target: 'body' }] },
    { ...decision, actions: [{ ...action, target: 'element-1', script: 'fetch()' }] },
    { ...decision, actions: Array.from({ length: 9 }, () => action) },
    { ...decision, actions: [{ ...action, type: 'resize', width: 99999 }] },
    { ...decision, actions: [{ ...action, type: 'input', value: 'a'.repeat(2001) }] },
    { ...decision, status: 'pass' },
    { ...decision, status: 'revise', actions: [], extension: { source: 'x' } },
    { ...decision, actions: [], status: 'pass', extension: { title: 'Injected', source: 'x' } },
    { ...decision, execute: 'native code' }
  ])('rejects malformed or broader operations %#', (value) => {
    expect(() => readExtensionCheckDecision(JSON.stringify(value))).toThrow()
  })
})

describe('host evidence gate', () => {
  const observation = {
    tree: { type: 'stack' as const },
    text: 'Game',
    controls: [
      {
        id: 'element-1',
        label: 'Play',
        type: 'button' as const,
        disabled: false,
        x: 0,
        y: 0,
        width: 40,
        height: 40
      }
    ],
    errors: [],
    width: 360,
    height: 700,
    overflow: false,
    requiresData: false
  }
  const widths = new Set([360, 520])
  it('requires final-version interaction evidence at both widths', () => {
    expect(extensionCheckPassed(observation, 1, widths)).toBe(true)
    expect(extensionCheckPassed(observation, 0, widths)).toBe(false)
    expect(extensionCheckPassed(observation, 1, new Set([360]))).toBe(false)
  })
  it('cannot turn missing data, runtime errors, overflow, or a blank render into a pass', () => {
    for (const patch of [
      { requiresData: true },
      { requiresNetwork: true },
      { errors: ['crash'] },
      { overflow: true },
      { tree: null },
      { text: '', controls: [] }
    ])
      expect(extensionCheckPassed({ ...observation, ...patch }, 10, widths)).toBe(false)
  })
})
