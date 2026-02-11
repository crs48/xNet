/**
 * Electron secure storage helpers for seed phrase recovery.
 */

import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export type SafeStorageLike = {
  isEncryptionAvailable(): boolean
  encryptString(text: string): Buffer
  decryptString(data: Buffer): string
}

type StoredSeedRecord = {
  version: 1
  encryptedMnemonic: string
  updatedAt: number
}

const SEED_FILE_NAME = 'seed-recovery.json'

const getSeedFilePath = (dataDir: string): string => join(dataDir, SEED_FILE_NAME)

const isStoredSeedRecord = (value: unknown): value is StoredSeedRecord => {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<StoredSeedRecord>
  return (
    candidate.version === 1 &&
    typeof candidate.encryptedMnemonic === 'string' &&
    typeof candidate.updatedAt === 'number'
  )
}

export function storeSeedPhrase(
  dataDir: string,
  mnemonic: string,
  safeStorage: SafeStorageLike
): void {
  const normalized = mnemonic.trim().replace(/\s+/g, ' ')
  if (!normalized) {
    throw new Error('Seed phrase is required')
  }
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('Platform secure storage is unavailable')
  }

  mkdirSync(dataDir, { recursive: true })

  const encrypted = safeStorage.encryptString(normalized)
  const payload: StoredSeedRecord = {
    version: 1,
    encryptedMnemonic: encrypted.toString('base64'),
    updatedAt: Date.now()
  }

  writeFileSync(getSeedFilePath(dataDir), JSON.stringify(payload), 'utf8')
}

export function loadSeedPhrase(dataDir: string, safeStorage: SafeStorageLike): string | null {
  const filePath = getSeedFilePath(dataDir)
  if (!existsSync(filePath)) {
    return null
  }
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('Platform secure storage is unavailable')
  }

  const raw = readFileSync(filePath, 'utf8')
  const parsed = JSON.parse(raw) as unknown
  if (!isStoredSeedRecord(parsed)) {
    throw new Error('Stored seed record is invalid')
  }

  const encrypted = Buffer.from(parsed.encryptedMnemonic, 'base64')
  return safeStorage.decryptString(encrypted)
}

export function clearSeedPhrase(dataDir: string): void {
  const filePath = getSeedFilePath(dataDir)
  if (existsSync(filePath)) {
    unlinkSync(filePath)
  }
}
