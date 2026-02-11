import { mkdirSync } from 'fs'
import { join } from 'path'
import { ipcMain, safeStorage } from 'electron'
import { clearSeedPhrase, loadSeedPhrase, storeSeedPhrase } from './secure-seed'
import { SQLiteAdapter } from './storage'
import { dataPath, profile } from './index'

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
