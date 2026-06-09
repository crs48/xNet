/**
 * Browser storage reset helpers for xNet Web.
 */

export const XNET_RESET_STORAGE_ON_LOAD_KEY = 'xnet:reset-local-data-on-load'
const XNET_SQLITE_CONFIG = { path: '/xnet.db' } as const

type IndexedDBDatabaseInfo = {
  name?: string
}

function getSessionStorage(): Storage | null {
  return typeof sessionStorage === 'undefined' ? null : sessionStorage
}

function getLocalStorage(): Storage | null {
  return typeof localStorage === 'undefined' ? null : localStorage
}

async function deleteIndexedDBDatabase(name: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name)
    request.onsuccess = () => resolve()
    request.onblocked = () => resolve()
    request.onerror = () => reject(request.error)
  })
}

async function clearIndexedDBDatabases(): Promise<void> {
  if (typeof indexedDB === 'undefined' || typeof indexedDB.databases !== 'function') {
    return
  }

  const databases = (await indexedDB.databases()) as IndexedDBDatabaseInfo[]
  await Promise.all(databases.flatMap((db) => (db.name ? [deleteIndexedDBDatabase(db.name)] : [])))
}

async function clearWebSQLiteStorage(): Promise<void> {
  const { resetWebSQLiteStorage } = await import('@xnetjs/sqlite/web-proxy')
  await resetWebSQLiteStorage(XNET_SQLITE_CONFIG)
}

export async function clearXNetBrowserStorage(): Promise<void> {
  await Promise.all([clearWebSQLiteStorage(), clearIndexedDBDatabases()])
  getLocalStorage()?.clear()
}

export function shouldResetXNetBrowserStorageOnLoad(): boolean {
  return getSessionStorage()?.getItem(XNET_RESET_STORAGE_ON_LOAD_KEY) === 'true'
}

export function clearXNetBrowserStorageResetRequest(): void {
  getSessionStorage()?.removeItem(XNET_RESET_STORAGE_ON_LOAD_KEY)
}

export function requestXNetBrowserStorageReset(): void {
  getSessionStorage()?.setItem(XNET_RESET_STORAGE_ON_LOAD_KEY, 'true')
  window.location.reload()
}
