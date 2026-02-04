/**
 * @xnet/hub - Hub entry point.
 */

import type { HubConfig, HubInstance } from './types'
import { mkdirSync } from 'fs'
import { DEFAULT_CONFIG } from './types'
import { createServer } from './server'
export { resolveConfig } from './config'

export type { HubConfig, HubInstance } from './types'

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
