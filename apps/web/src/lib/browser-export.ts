/**
 * Browser-safe full export of the local workspace (Charter §Exit, 0234).
 *
 * The Node-only AiWorkspaceExporter can't run in the browser, so "take
 * everything" here is a structured dump of every IndexedDB store — the local
 * master copy. Pure DOM APIs; no server, nothing leaves the device until you
 * download it.
 */

export interface BrowserWorkspaceDump {
  exportedAt: string
  version: string
  databases: Record<string, Record<string, unknown[]>>
}

function openDatabase(name: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function readAll(db: IDBDatabase, storeName: string): Promise<unknown[]> {
  return new Promise((resolve, reject) => {
    const request = db.transaction(storeName, 'readonly').objectStore(storeName).getAll()
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function dumpDatabase(name: string): Promise<Record<string, unknown[]>> {
  const db = await openDatabase(name)
  const out: Record<string, unknown[]> = {}
  for (const storeName of Array.from(db.objectStoreNames)) {
    out[storeName] = await readAll(db, storeName)
  }
  db.close()
  return out
}

/** Dump every IndexedDB store on this origin into one structured object. */
export async function exportBrowserWorkspace(now: string): Promise<BrowserWorkspaceDump> {
  const databases = await indexedDB.databases()
  const dump: BrowserWorkspaceDump = { exportedAt: now, version: '1.0.0', databases: {} }
  for (const info of databases) {
    if (info.name) dump.databases[info.name] = await dumpDatabase(info.name)
  }
  return dump
}

/** Trigger a client-side JSON download. */
export function downloadJson(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
