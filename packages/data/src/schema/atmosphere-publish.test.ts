import { describe, it, expect } from 'vitest'
import {
  applyAtmosphereAction,
  availableAtmosphereActions,
  canEnterAtmosphere,
  assertCanPublish,
  type AtmospherePublishState,
  type AtmospherePublishAction
} from './atmosphere-publish'

describe('the atmosphere one-way door', () => {
  it('publishes, withdraws, and republishes', () => {
    expect(applyAtmosphereAction('unpublished', 'publish')).toEqual({
      ok: true,
      state: 'published'
    })
    expect(applyAtmosphereAction('published', 'withdraw')).toEqual({
      ok: true,
      state: 'withdrawn'
    })
    expect(applyAtmosphereAction('withdrawn', 'republish')).toEqual({
      ok: true,
      state: 'published'
    })
  })

  it('has no path back to unpublished from any public state', () => {
    const states: AtmospherePublishState[] = ['unpublished', 'published', 'withdrawn']
    const actions: AtmospherePublishAction[] = ['publish', 'withdraw', 'republish']
    for (const from of states) {
      for (const action of actions) {
        const result = applyAtmosphereAction(from, action)
        if (from !== 'unpublished') {
          // Once public, nothing returns to unpublished — the whole point.
          expect(result.state).not.toBe('unpublished')
        }
      }
    }
  })

  it('never offers a "make private" style action', () => {
    for (const state of ['unpublished', 'published', 'withdrawn'] as const) {
      const actions = availableAtmosphereActions(state)
      // The action set is exactly the honest verbs; "unpublish"/"make private"
      // are not among them by construction.
      expect(actions).not.toContain('unpublish')
      expect(actions).not.toContain('makePrivate')
    }
  })

  it('offers withdraw from published and republish from withdrawn', () => {
    expect(availableAtmosphereActions('published')).toEqual(['withdraw'])
    expect(availableAtmosphereActions('withdrawn')).toEqual(['republish'])
  })

  it('refuses illegal transitions without changing state', () => {
    expect(applyAtmosphereAction('withdrawn', 'withdraw')).toMatchObject({
      ok: false,
      state: 'withdrawn'
    })
    expect(applyAtmosphereAction('published', 'publish')).toMatchObject({ ok: false })
  })
})

describe('the gated/public rail split', () => {
  it('admits only public and unlisted content', () => {
    expect(canEnterAtmosphere('public')).toBe(true)
    expect(canEnterAtmosphere('unlisted')).toBe(true)
    expect(canEnterAtmosphere('private')).toBe(false)
    // inherit is refused because we cannot prove it resolves public.
    expect(canEnterAtmosphere('inherit')).toBe(false)
  })

  it('refuses to publish gated content, pointing at the deliberate act', () => {
    const refusal = assertCanPublish('private')
    expect(refusal?.ok).toBe(false)
    expect(refusal?.reason).toMatch(/one-way door/)
  })

  it('lets public content through the guard', () => {
    expect(assertCanPublish('public')).toBeNull()
  })
})
