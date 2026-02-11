import { mkdirSync } from 'fs'
import { join } from 'path'
import { ipcMain } from 'electron'
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
}
