import { SERVICE_IPC_CHANNELS } from '@xnetjs/plugins'
import { describe, expect, it } from 'vitest'
import { ALLOWED_SERVICE_CHANNELS, isAllowedServiceChannel } from '../shared/service-ipc'

describe('service IPC allowlist', () => {
  it('should expose the full shared service contract', () => {
    expect([...ALLOWED_SERVICE_CHANNELS].sort()).toEqual(Object.values(SERVICE_IPC_CHANNELS).sort())
  })

  it('should reject stale channel names', () => {
    expect(isAllowedServiceChannel('xnet:service:list')).toBe(false)
  })
})
