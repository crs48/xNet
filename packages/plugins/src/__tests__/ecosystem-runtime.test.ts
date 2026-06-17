/**
 * Tests for running plugin code on the labs runtime ladder (0194 Phase 1).
 */

import { describe, it, expect, vi } from 'vitest'
import {
  ladderTierForTrust,
  runPluginCode,
  PluginRuntimeError,
  type PluginRuntimeLadder,
  type PluginRunInput
} from '../ecosystem/runtime'

function fakeLadder() {
  const inputs: PluginRunInput[] = []
  const ladder: PluginRuntimeLadder = {
    run: vi.fn(async (input: PluginRunInput) => {
      inputs.push(input)
      return { ok: true, value: 'ran' }
    })
  }
  return { ladder, inputs }
}

describe('ladderTierForTrust', () => {
  it('maps user → sandbox and marketplace → app', () => {
    expect(ladderTierForTrust('user')).toBe('sandbox')
    expect(ladderTierForTrust('marketplace')).toBe('app')
  })

  it('throws for first-party (it runs in the host realm, not the ladder)', () => {
    expect(() => ladderTierForTrust('first-party')).toThrow(PluginRuntimeError)
  })
})

describe('runPluginCode', () => {
  it('runs user code on the deterministic sandbox rung', async () => {
    const { ladder, inputs } = fakeLadder()
    const result = await runPluginCode(ladder, { code: 'return 1', trustTier: 'user' })
    expect(result).toEqual({ ok: true, value: 'ran' })
    expect(inputs[0]).toEqual({
      language: 'javascript',
      tier: 'sandbox',
      code: 'return 1',
      host: undefined
    })
  })

  it('runs marketplace code on the iframe app rung and forwards the host bridge', async () => {
    const { ladder, inputs } = fakeLadder()
    const host = { tools: {} }
    await runPluginCode(ladder, {
      code: 'x',
      trustTier: 'marketplace',
      language: 'typescript',
      host
    })
    expect(inputs[0]).toMatchObject({ tier: 'app', language: 'typescript', host })
  })

  it('refuses first-party code (host realm only) without calling the ladder', async () => {
    const { ladder } = fakeLadder()
    await expect(
      runPluginCode(ladder, { code: 'x', trustTier: 'first-party' })
    ).rejects.toBeInstanceOf(PluginRuntimeError)
    expect(ladder.run).not.toHaveBeenCalled()
  })

  it('defaults the language to javascript', async () => {
    const { ladder, inputs } = fakeLadder()
    await runPluginCode(ladder, { code: 'x', trustTier: 'user' })
    expect(inputs[0].language).toBe('javascript')
  })
})
