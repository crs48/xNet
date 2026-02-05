/**
 * Browser preset for XNet client
 */
import { IndexedDBAdapter } from '@xnet/storage'
import { createXNetClient, type XNetClientConfig, type XNetClient } from '../client'

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
