/**
 * Distilling memories from agent traces (exploration 0415).
 *
 * The rules under test are the ones that keep this from becoming surveillance:
 * a one-off instruction is a task and never becomes a memory, and a redacted
 * instruction contributes nothing rather than being reconstructed from its
 * digest.
 */

import { describe, expect, it } from 'vitest'
import {
  candidatesFromTraces,
  isRedactedInstruction,
  type AgentActionLike
} from './memory-from-traces'

const action = (id: string, instruction: string, status = 'succeeded'): AgentActionLike => ({
  id,
  properties: { instruction, status, tool: 'xnet_update' }
})

describe('candidatesFromTraces', () => {
  it('requires three occurrences by default', () => {
    const twice = [action('a', 'file these under Ops'), action('b', 'file these under Ops')]
    expect(candidatesFromTraces(twice)).toHaveLength(0)
    expect(candidatesFromTraces([...twice, action('c', 'file these under Ops')])).toHaveLength(1)
  })

  it('treats reordered phrasings as the same standing instruction', () => {
    const candidates = candidatesFromTraces([
      action('a', 'always file these under Ops'),
      action('b', 'under Ops, always file these'),
      action('c', 'file these under Ops always')
    ])
    expect(candidates).toHaveLength(1)
    expect(candidates[0].occurrences).toBe(3)
    expect(candidates[0].evidence).toEqual(['a', 'b', 'c'])
  })

  it('keeps the fullest phrasing among equivalent ones', () => {
    // Same token bag (punctuation and case are stripped), different surface
    // forms — the preamble should carry the most readable one.
    const candidates = candidatesFromTraces([
      action('a', 'file under Ops'),
      action('b', 'File under Ops.'),
      action('c', 'File, under Ops!!')
    ])
    expect(candidates).toHaveLength(1)
    expect(candidates[0].text).toBe('File, under Ops!!')
  })

  it('does not merge instructions that differ in content', () => {
    const candidates = candidatesFromTraces(
      [
        action('a', 'file under Ops'),
        action('b', 'file under Ops'),
        action('c', 'file under Ops the whole folder')
      ],
      { minOccurrences: 2 }
    )
    expect(candidates).toHaveLength(1)
    expect(candidates[0].occurrences).toBe(2)
  })

  it('never distills a redacted instruction', () => {
    const redacted = '[redacted 120 chars sha256:0011223344556677]'
    expect(isRedactedInstruction(redacted)).toBe(true)
    expect(
      candidatesFromTraces([action('a', redacted), action('b', redacted), action('c', redacted)])
    ).toHaveLength(0)
  })

  it('ignores actions that did not succeed', () => {
    const failed = [
      action('a', 'file these under Ops', 'failed'),
      action('b', 'file these under Ops', 'failed'),
      action('c', 'file these under Ops', 'failed')
    ]
    expect(candidatesFromTraces(failed)).toHaveLength(0)
  })

  it('caps salience so repetition cannot starve the top-k', () => {
    const many = Array.from({ length: 40 }, (_, i) => action(`a${i}`, 'file these under Ops'))
    const [candidate] = candidatesFromTraces(many)
    expect(candidate.occurrences).toBe(40)
    expect(candidate.salience).toBeLessThanOrEqual(0.9)
  })

  it('ranks by recurrence and honours the limit', () => {
    const actions = [
      ...Array.from({ length: 5 }, (_, i) => action(`x${i}`, 'file these under Ops')),
      ...Array.from({ length: 3 }, (_, i) => action(`y${i}`, 'summarize weekly for Marta'))
    ]
    const candidates = candidatesFromTraces(actions, { limit: 1 })
    expect(candidates).toHaveLength(1)
    expect(candidates[0].occurrences).toBe(5)
  })

  it('skips actions with no instruction rather than inventing one', () => {
    const nameless: AgentActionLike[] = [
      { id: 'a', properties: { status: 'succeeded' } },
      { id: 'b', properties: { instruction: '   ', status: 'succeeded' } },
      { id: 'c', properties: { instruction: 42, status: 'succeeded' } }
    ]
    expect(candidatesFromTraces(nameless, { minOccurrences: 1 })).toHaveLength(0)
  })
})
