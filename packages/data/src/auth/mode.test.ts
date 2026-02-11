import { describe, expect, it, vi } from 'vitest'
import { getAuthMode, warnLegacySchema } from './mode'

describe('auth mode helpers', () => {
  it('returns legacy mode when authorization is missing', () => {
    expect(
      getAuthMode({
        '@id': 'xnet://xnet.fyi/Task@1.0.0',
        '@type': 'xnet://xnet.fyi/Schema',
        name: 'Task',
        namespace: 'xnet://xnet.fyi/',
        version: '1.0.0',
        properties: []
      })
    ).toBe('legacy')
  })

  it('returns enforce mode when authorization exists', () => {
    expect(
      getAuthMode({
        '@id': 'xnet://xnet.fyi/Task@1.0.0',
        '@type': 'xnet://xnet.fyi/Schema',
        name: 'Task',
        namespace: 'xnet://xnet.fyi/',
        version: '1.0.0',
        properties: [],
        authorization: {
          roles: {},
          actions: {}
        }
      })
    ).toBe('enforce')
  })

  it('warns for legacy schemas without authorization', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    warnLegacySchema({
      '@id': 'xnet://xnet.fyi/Task@1.0.0',
      '@type': 'xnet://xnet.fyi/Schema',
      name: 'Task',
      namespace: 'xnet://xnet.fyi/',
      version: '1.0.0',
      properties: []
    })

    expect(warnSpy).toHaveBeenCalledTimes(1)
    expect(warnSpy.mock.calls[0][0]).toContain("Schema 'Task' has no authorization block")
    warnSpy.mockRestore()
  })

  it('does not warn when authorization exists', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    warnLegacySchema({
      '@id': 'xnet://xnet.fyi/Task@1.0.0',
      '@type': 'xnet://xnet.fyi/Schema',
      name: 'Task',
      namespace: 'xnet://xnet.fyi/',
      version: '1.0.0',
      properties: [],
      authorization: {
        roles: {},
        actions: {}
      }
    })

    expect(warnSpy).not.toHaveBeenCalled()
    warnSpy.mockRestore()
  })
})
