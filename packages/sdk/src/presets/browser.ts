/**
 * Browser preset for XNet client
 */
import { createXNetClient, type XNetClientConfig, type XNetClient } from '../client'
import { IndexedDBAdapter } from '@xnet/storage'

/**
 * Create an XNet client configured for browser environments
 */
export async function createBrowserClient(
  config: Partial<XNetClientConfig> = {}
): Promise<XNetClient> {
  return createXNetClient({
    storage: new IndexedDBAdapter(),
    enableNetwork: false, // Disabled by default until WebRTC is stable
    ...config
  })
}
