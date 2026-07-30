import { mkdirSync } from 'fs'
import { join } from 'path'
import { ipcMain, safeStorage } from 'electron'
import { readMainCrashLog } from './crash-log'
import { dataPath, profile } from './profile'
import { clearSeedPhrase, loadSeedPhrase, storeSeedPhrase } from './secure-seed'
import { SQLiteAdapter } from './storage'

let storage: SQLiteAdapter | null = null

export function getOrCreateStorage(): SQLiteAdapter {
  if (storage) return storage

  try {
    mkdirSync(dataPath, { recursive: true })
  } catch {
    // Directory may already exist
  }

  storage = new SQLiteAdapter(join(dataPath, 'xnet.db'))
  return storage
}

export function setupIPC() {
  ipcMain.handle('xnet:getProfile', () => profile)

  // Read-only view of the local main-process crash log (0315) so the renderer's
  // user-triggered debug report can attach it. Never written from the renderer.
  ipcMain.handle('xnet:crashLog:read', () => readMainCrashLog())

  ipcMain.handle('xnet:seed:set', (_event, payload: { mnemonic: string }) => {
    storeSeedPhrase(dataPath, payload.mnemonic, safeStorage)
    return { ok: true }
  })

  ipcMain.handle('xnet:seed:get', () => {
    const mnemonic = loadSeedPhrase(dataPath, safeStorage)
    return { mnemonic }
  })

  ipcMain.handle('xnet:seed:clear', () => {
    clearSeedPhrase(dataPath)
    return { ok: true }
  })
}
