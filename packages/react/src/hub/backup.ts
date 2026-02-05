/**
 * Hub backup helpers.
 */
import { concatBytes, decrypt, encrypt, NONCE_SIZE, type EncryptedData } from '@xnet/crypto'

export type HubBackupConfig = {
  hubUrl: string
  encryptionKey: Uint8Array
  getAuthToken?: () => Promise<string>
  fetchFn?: typeof fetch
}

export type BackupUploadResult = {
  key: string
  sizeBytes: number
}

const toHttpUrl = (hubUrl: string): string => {
  try {
    const url = new URL(hubUrl)
    if (url.protocol === 'ws:') url.protocol = 'http:'
    if (url.protocol === 'wss:') url.protocol = 'https:'
    return url.toString().replace(/\/$/, '')
  } catch {
    return hubUrl
  }
}

const encodeEncrypted = (encrypted: EncryptedData): Uint8Array =>
  concatBytes(encrypted.nonce, encrypted.ciphertext)

const decodeEncrypted = (payload: Uint8Array): EncryptedData => {
  const nonce = payload.slice(0, NONCE_SIZE)
  const ciphertext = payload.slice(NONCE_SIZE)
  return { nonce, ciphertext }
}

const resolveFetch = (fetchFn?: typeof fetch): typeof fetch => {
  if (fetchFn) return fetchFn
  if (typeof fetch === 'undefined') {
    throw new Error('fetch is not available in this environment')
  }
  return fetch
}

const buildAuthHeader = async (getAuthToken?: () => Promise<string>): Promise<string | null> => {
  if (!getAuthToken) return null
  const token = await getAuthToken()
  if (!token) return null
  return `Bearer ${token}`
}

export async function uploadBackup(
  config: HubBackupConfig,
  docId: string,
  plaintext: Uint8Array
): Promise<BackupUploadResult> {
  const encrypted = encrypt(plaintext, config.encryptionKey)
  const payload = encodeEncrypted(encrypted)
  return uploadEncryptedBackup(config, docId, payload)
}

export async function uploadEncryptedBackup(
  config: HubBackupConfig,
  docId: string,
  payload: Uint8Array
): Promise<BackupUploadResult> {
  const httpUrl = toHttpUrl(config.hubUrl)
  const fetcher = resolveFetch(config.fetchFn)
  const authHeader = await buildAuthHeader(config.getAuthToken)

  const res = await fetcher(`${httpUrl}/backup/${encodeURIComponent(docId)}`, {
    method: 'PUT',
    headers: {
      ...(authHeader ? { Authorization: authHeader } : {}),
      'Content-Type': 'application/octet-stream'
    },
    body: payload as unknown as BodyInit
  })

  if (!res.ok) {
    throw new Error(`Backup upload failed: ${res.status} ${res.statusText}`)
  }

  return res.json() as Promise<BackupUploadResult>
}

export async function downloadBackup(
  config: HubBackupConfig,
  docId: string
): Promise<Uint8Array | null> {
  const payload = await downloadEncryptedBackup(config, docId)
  if (!payload) return null

  const encrypted = decodeEncrypted(payload)
  return decrypt(encrypted, config.encryptionKey)
}

export async function downloadEncryptedBackup(
  config: HubBackupConfig,
  docId: string
): Promise<Uint8Array | null> {
  const httpUrl = toHttpUrl(config.hubUrl)
  const fetcher = resolveFetch(config.fetchFn)
  const authHeader = await buildAuthHeader(config.getAuthToken)

  const res = await fetcher(`${httpUrl}/backup/${encodeURIComponent(docId)}`, {
    headers: authHeader ? { Authorization: authHeader } : undefined
  })

  if (res.status === 404) return null
  if (!res.ok) {
    throw new Error(`Backup download failed: ${res.status} ${res.statusText}`)
  }

  return new Uint8Array(await res.arrayBuffer())
}
