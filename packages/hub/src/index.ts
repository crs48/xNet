/**
 * @xnet/hub - Hub entry point.
 */

import type { HubConfig, HubInstance } from './types'
import { mkdirSync } from 'fs'
import { createServer } from './server'
import { DEFAULT_CONFIG } from './types'
export { resolveConfig } from './config'

export type { HubConfig, HubInstance, DemoOverrides } from './types'
export { DEMO_DEFAULTS } from './types'
export { getDemoOverrides } from './config'
export { EvictionService, type EvictionStorage } from './services/eviction'

/**
 * Create an xNet Hub instance.
 *
 * @example
 * ```typescript
 * const hub = await createHub({ port: 4444 })
 * await hub.start()
 * ```
 */
export const createHub = async (config: Partial<HubConfig> = {}): Promise<HubInstance> => {
  const resolved: HubConfig = { ...DEFAULT_CONFIG, ...config }

  mkdirSync(resolved.dataDir, { recursive: true })

  return createServer(resolved)
}
