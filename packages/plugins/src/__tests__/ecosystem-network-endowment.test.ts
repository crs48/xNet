/**
 * Tests for the network endowment guard (exploration 0192).
 */

import type { ModuleCapabilities } from '../feature-module'
import { describe, it, expect, vi } from 'vitest'
import { CapabilityError } from '../ecosystem/capability-guard'
import { guardedFetch } from '../ecosystem/network-endowment'

describe('guardedFetch', () => {
  const caps: ModuleCapabilities = { network: ['api.stripe.com', '.github.com'] }

  it('allows requests to declared hosts and forwards to the underlying fetch', async () => {
    const inner = vi.fn().mockResolvedValue('ok')
    const fetch = guardedFetch(caps, 'com.me.p', inner)
    await expect(fetch('https://api.stripe.com/v1/charges')).resolves.toBe('ok')
    await expect(fetch('https://api.github.com/repos')).resolves.toBe('ok')
    expect(inner).toHaveBeenCalledTimes(2)
  })

  it('blocks requests to undeclared hosts before they leave', async () => {
    const inner = vi.fn().mockResolvedValue('ok')
    const fetch = guardedFetch(caps, 'com.me.p', inner)
    await expect(fetch('https://evil.example.com/exfil')).rejects.toBeInstanceOf(CapabilityError)
    expect(inner).not.toHaveBeenCalled()
  })

  it('accepts a Request-like object as input', async () => {
    const inner = vi.fn().mockResolvedValue('ok')
    const fetch = guardedFetch(caps, 'com.me.p', inner)
    await expect(fetch({ url: 'https://api.stripe.com/x' })).resolves.toBe('ok')
  })

  it('grants no egress when no network capability is declared', async () => {
    const inner = vi.fn().mockResolvedValue('ok')
    const fetch = guardedFetch(undefined, 'com.me.p', inner)
    await expect(fetch('https://api.stripe.com')).rejects.toBeInstanceOf(CapabilityError)
    expect(inner).not.toHaveBeenCalled()
  })
})
