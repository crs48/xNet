import { describe, expect, it } from 'vitest'
import {
  buildWebSocketProtocols,
  normalizeSignalingUrl,
  sanitizeSignalingUrlForLogging
} from './data-service'

describe('data-service signaling security helpers', () => {
  it('removes token query parameters before dialing websocket', () => {
    const normalized = normalizeSignalingUrl(
      'wss://attacker.invalid/signal?token=super-secret&room=xnet-doc-1'
    )

    expect(normalized).toBe('wss://attacker.invalid/signal?room=xnet-doc-1')
    expect(normalized.includes('super-secret')).toBe(false)
  })

  it('redacts query strings and credentials for diagnostic logging', () => {
    const sanitized = sanitizeSignalingUrlForLogging(
      'wss://user:pass@hub.xnet.fyi/signal?token=super-secret&room=xnet-doc-1'
    )

    expect(sanitized).toBe('wss://hub.xnet.fyi/signal')
    expect(sanitized.includes('super-secret')).toBe(false)
    expect(sanitized.includes('user:pass')).toBe(false)
  })

  it('keeps non-auth websocket protocol only when token is unsafe', () => {
    expect(buildWebSocketProtocols('contains whitespace')).toEqual(['xnet-sync.v1'])
    expect(buildWebSocketProtocols('contains,comma')).toEqual(['xnet-sync.v1'])
  })

  it('uses auth subprotocol for valid bearer tokens', () => {
    expect(buildWebSocketProtocols('ucan.token.value')).toEqual([
      'xnet-sync.v1',
      'xnet-auth.ucan.token.value'
    ])
  })
})
