import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { consent, hasChosenConsent } from './consent'
import { useConsent } from './use-consent'

/** Reset to a truly "never chosen" state: tier off + grantedAt at epoch 0. */
async function toUnchosen(): Promise<void> {
  await consent.setConsent({ tier: 'off', grantedAt: new Date(0) })
}

beforeEach(toUnchosen)
afterEach(toUnchosen)

describe('hasChosenConsent', () => {
  it('is false at epoch-0 grantedAt and true after an explicit choice', async () => {
    expect(hasChosenConsent()).toBe(false)
    await consent.setTier('crashes')
    expect(hasChosenConsent()).toBe(true)
  })
})

describe('useConsent', () => {
  it('starts off and unchosen', async () => {
    const { result } = renderHook(() => useConsent())
    await act(async () => {})
    expect(result.current.tier).toBe('off')
    expect(result.current.chosen).toBe(false)
  })

  it('enabling crash reports updates tier, allows, and marks chosen', async () => {
    const { result } = renderHook(() => useConsent())
    await act(async () => {
      await consent.setTier('crashes')
    })
    expect(result.current.tier).toBe('crashes')
    expect(result.current.allows('crashes')).toBe(true)
    expect(result.current.chosen).toBe(true)
  })

  it('reset marks chosen but keeps telemetry off', async () => {
    const { result } = renderHook(() => useConsent())
    await act(async () => {
      await consent.reset()
    })
    expect(result.current.tier).toBe('off')
    expect(result.current.chosen).toBe(true)
  })
})
