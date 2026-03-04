/**
 * @xnetjs/hub - Backup API routes.
 */

import type { AuthContext } from '../auth/ucan'
import type { BackupService } from '../services/backup'
import { base64ToBytes, verify } from '@xnetjs/crypto'
import { parseDID } from '@xnetjs/identity'
import { Hono } from 'hono'

type Env = { Variables: { auth: AuthContext } }

type KeyBackupPayload = {
  did: string
  encryptedPayload: string
  nonce: string
  version: number
  createdAt: number
  ownershipProof: string
}

const isDid = (value: string): boolean => value.startsWith('did:key:')

const createOwnershipMessage = (did: string): Uint8Array =>
  new TextEncoder().encode(`xnet-backup:${did}`)

const verifyOwnershipProof = (did: string, proofBase64: string): boolean => {
  try {
    const publicKey = parseDID(did)
    const signature = base64ToBytes(proofBase64)
    return verify(createOwnershipMessage(did), signature, publicKey)
  } catch {
    return false
  }
}

const encodeKeyBackup = (payload: KeyBackupPayload): Uint8Array =>
  new TextEncoder().encode(JSON.stringify(payload))

const decodeKeyBackup = (bytes: Uint8Array): KeyBackupPayload | null => {
  try {
    const parsed = JSON.parse(new TextDecoder().decode(bytes)) as Partial<KeyBackupPayload>
    if (
      typeof parsed.did !== 'string' ||
      typeof parsed.encryptedPayload !== 'string' ||
      typeof parsed.nonce !== 'string' ||
      typeof parsed.version !== 'number' ||
      typeof parsed.createdAt !== 'number' ||
      typeof parsed.ownershipProof !== 'string'
    ) {
      return null
    }

    return {
      did: parsed.did,
      encryptedPayload: parsed.encryptedPayload,
      nonce: parsed.nonce,
      version: parsed.version,
      createdAt: parsed.createdAt,
      ownershipProof: parsed.ownershipProof
    }
  } catch {
    return null
  }
}

export const createBackupRoutes = (backup: BackupService): Hono<Env> => {
  const app = new Hono<Env>()

  app.post('/:did', async (c) => {
    const auth = c.get('auth') as AuthContext
    const did = c.req.param('did')

    if (!isDid(did)) {
      return c.json({ error: 'Invalid DID path', code: 'INVALID_DID' }, 400)
    }
    if (auth.did !== did && !auth.can('backup/write', did)) {
      return c.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, 403)
    }

    const body = (await c.req.json()) as Partial<KeyBackupPayload>
    if (
      body.did !== did ||
      typeof body.encryptedPayload !== 'string' ||
      typeof body.nonce !== 'string' ||
      typeof body.version !== 'number' ||
      typeof body.createdAt !== 'number' ||
      typeof body.ownershipProof !== 'string'
    ) {
      return c.json({ error: 'Invalid key backup payload', code: 'INVALID_PAYLOAD' }, 400)
    }

    if (!verifyOwnershipProof(did, body.ownershipProof)) {
      return c.json({ error: 'Invalid ownership proof', code: 'UNAUTHORIZED' }, 403)
    }

    const keyBackup: KeyBackupPayload = {
      did,
      encryptedPayload: body.encryptedPayload,
      nonce: body.nonce,
      version: body.version,
      createdAt: body.createdAt,
      ownershipProof: body.ownershipProof
    }

    try {
      const result = await backup.put(did, did, encodeKeyBackup(keyBackup))
      return c.json({ did, key: result.key, sizeBytes: result.sizeBytes }, 201)
    } catch (err) {
      if (err instanceof Error && err.name === 'BackupError') {
        const backupErr = err as import('../services/backup').BackupError
        switch (backupErr.code) {
          case 'BLOB_TOO_LARGE':
            return c.json({ error: backupErr.message, code: backupErr.code }, 413)
          case 'QUOTA_EXCEEDED':
            return c.json({ error: backupErr.message, code: backupErr.code }, 507)
        }
      }
      throw err
    }
  })

  app.put('/:docId', async (c) => {
    const auth = c.get('auth') as AuthContext
    const docId = c.req.param('docId')

    if (!auth.can('backup/write', docId)) {
      return c.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, 403)
    }

    const body = await c.req.arrayBuffer()
    const data = new Uint8Array(body)

    try {
      const result = await backup.put(docId, auth.did, data)
      return c.json(result, 201)
    } catch (err) {
      if (err instanceof Error && err.name === 'BackupError') {
        const backupErr = err as import('../services/backup').BackupError
        switch (backupErr.code) {
          case 'BLOB_TOO_LARGE':
            return c.json({ error: backupErr.message, code: backupErr.code }, 413)
          case 'QUOTA_EXCEEDED':
            return c.json({ error: backupErr.message, code: backupErr.code }, 507)
        }
      }
      throw err
    }
  })

  app.get('/:docId', async (c) => {
    const auth = c.get('auth') as AuthContext
    const docId = c.req.param('docId')

    if (isDid(docId)) {
      if (auth.did !== docId && !auth.can('backup/read', docId)) {
        return c.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, 403)
      }

      const data = await backup.get(docId, docId)
      if (!data) {
        return c.json({ error: 'Not found', code: 'NOT_FOUND' }, 404)
      }

      const parsed = decodeKeyBackup(data)
      if (!parsed) {
        return c.json({ error: 'Backup payload is invalid', code: 'INVALID_PAYLOAD' }, 500)
      }

      return c.json(parsed)
    }

    if (!auth.can('backup/read', docId)) {
      return c.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, 403)
    }

    const data = await backup.get(docId, auth.did)
    if (!data) {
      return c.json({ error: 'Not found', code: 'NOT_FOUND' }, 404)
    }

    return new Response(data as BodyInit, {
      status: 200,
      headers: { 'Content-Type': 'application/octet-stream' }
    })
  })

  app.get('/', async (c) => {
    const auth = c.get('auth') as AuthContext
    const [backups, usage] = await Promise.all([backup.list(auth.did), backup.getUsage(auth.did)])
    return c.json({ backups, usage })
  })

  app.delete('/:docId', async (c) => {
    const auth = c.get('auth') as AuthContext
    const docId = c.req.param('docId')

    if (isDid(docId)) {
      const proof = c.req.header('x-backup-proof')
      if (!proof || !verifyOwnershipProof(docId, proof)) {
        return c.json({ error: 'Invalid ownership proof', code: 'UNAUTHORIZED' }, 403)
      }
      if (auth.did !== docId && !auth.can('backup/delete', docId)) {
        return c.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, 403)
      }

      const blobs = await backup.list(docId)
      const match = blobs.find((blob) => blob.docId === docId)
      if (!match) {
        return c.json({ error: 'Not found', code: 'NOT_FOUND' }, 404)
      }

      await backup.delete(match.key, docId)
      return new Response(null, { status: 204 })
    }

    if (!auth.can('backup/delete', docId)) {
      return c.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, 403)
    }

    const blobs = await backup.list(auth.did)
    const match = blobs.find((blob) => blob.docId === docId)
    if (!match) {
      return c.json({ error: 'Not found', code: 'NOT_FOUND' }, 404)
    }

    await backup.delete(match.key, auth.did)
    return new Response(null, { status: 204 })
  })

  return app
}
