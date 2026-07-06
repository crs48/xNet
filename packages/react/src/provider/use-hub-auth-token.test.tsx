import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useHubAuthToken } from './use-hub-auth-token'

describe('useHubAuthToken (provider auth unit, 0276)', () => {
  it('returns the static token without touching the signing key', async () => {
    const { result } = renderHook(() =>
      useHubAuthToken({
        authorDID: undefined,
        signingKey: undefined,
        hubUrl: 'https://hub.example',
        autoAuth: true,
        staticHubAuthToken: 'static-token'
      })
    )
    await expect(result.current()).resolves.toBe('static-token')
  })

  it('returns empty when no hub is configured or auto-auth is off', async () => {
    const noHub = renderHook(() =>
      useHubAuthToken({
        authorDID: 'did:key:zTest',
        signingKey: new Uint8Array(32),
        hubUrl: null,
        autoAuth: true,
        staticHubAuthToken: ''
      })
    )
    await expect(noHub.result.current()).resolves.toBe('')

    const authOff = renderHook(() =>
      useHubAuthToken({
        authorDID: 'did:key:zTest',
        signingKey: new Uint8Array(32),
        hubUrl: 'https://hub.example',
        autoAuth: false,
        staticHubAuthToken: ''
      })
    )
    await expect(authOff.result.current()).resolves.toBe('')
  })

  it('fails loudly when hub auth is on but credentials are missing', async () => {
    const { result } = renderHook(() =>
      useHubAuthToken({
        authorDID: undefined,
        signingKey: undefined,
        hubUrl: 'https://hub.example',
        autoAuth: true,
        staticHubAuthToken: ''
      })
    )
    await expect(result.current()).rejects.toThrow('Missing authorDID/signingKey for hub auth')
  })
})
