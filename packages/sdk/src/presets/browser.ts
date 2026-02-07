/**
 * Browser preset for XNet client
 *
 * Note: For persistent SQLite storage, use the platform-specific providers:
 * - Web: @xnet/sqlite with wa-sqlite + OPFS
 * - Electron: @xnet/sqlite with better-sqlite3
 * - Expo: @xnet/sqlite/expo with expo-sqlite
 *
 * This preset uses in-memory storage for simple use cases or when
 * storage is provided via the config.
 */
import { MemoryAdapter } from '@xnet/storage'
import { createXNetClient, type XNetClientConfig, type XNetClient } from '../client'

/**
 * Create an XNet client configured for browser environments.
 *
 * For persistent storage, pass a storage adapter via config:
 * ```typescript
 * import { createSQLiteAdapter } from '@xnet/sqlite'
 *
 * const storage = await createSQLiteAdapter({ dbName: 'myapp' })
 * const client = await createBrowserClient({ storage })
 * ```
 */
export async function createBrowserClient(
  config: Partial<XNetClientConfig> = {}
): Promise<XNetClient> {
  return createXNetClient({
    storage: config.storage ?? new MemoryAdapter(),
    enableNetwork: false, // Disabled by default until WebRTC is stable
    ...config
  })
}
