/**
 * Node.js preset for XNet client
 */
import { MemoryAdapter } from '@xnet/storage'
import { createXNetClient, type XNetClientConfig, type XNetClient } from '../client'

/**
 * Create an XNet client configured for Node.js environments
 * Note: Uses MemoryAdapter since SQLite is not yet implemented
 */
export async function createNodeClient(
  config: Partial<XNetClientConfig> = {}
): Promise<XNetClient> {
  return createXNetClient({
    storage: new MemoryAdapter(),
    enableNetwork: false,
    ...config
  })
}
