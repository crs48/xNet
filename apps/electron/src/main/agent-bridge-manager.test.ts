import { afterEach, describe, expect, it, vi } from 'vitest'
import { resolveAllowedOrigins } from './agent-bridge-manager'

// Mock Electron (hoisted above the imports by vitest) — `app`/`ipcMain` don't
// exist in a plain Node test environment.
vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => '/mock/user-data'),
    whenReady: vi.fn(() => Promise.resolve())
  },
  ipcMain: {
    handle: vi.fn()
  }
}))

describe('resolveAllowedOrigins', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("defaults to the deployed web app's origin (https://xnet.fyi, not app.xnet.fyi)", () => {
    vi.stubEnv('XNET_BRIDGE_ALLOWED_ORIGINS', '')
    expect(resolveAllowedOrigins()).toEqual(['https://xnet.fyi'])
  })

  it('extends the default with XNET_BRIDGE_ALLOWED_ORIGINS entries', () => {
    vi.stubEnv('XNET_BRIDGE_ALLOWED_ORIGINS', 'https://xnet.example.com, https://other.example')
    expect(resolveAllowedOrigins()).toEqual([
      'https://xnet.fyi',
      'https://xnet.example.com',
      'https://other.example'
    ])
  })
})
