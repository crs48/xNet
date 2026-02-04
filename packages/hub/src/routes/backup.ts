/**
 * @xnet/hub - Backup API routes.
 */

import type { AuthContext } from '../auth/ucan'
import type { BackupService } from '../services/backup'
import { Hono } from 'hono'

export const createBackupRoutes = (backup: BackupService): Hono => {
  const app = new Hono()

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

    if (!auth.can('backup/read', docId)) {
      return c.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, 403)
    }

    const data = await backup.get(docId, auth.did)
    if (!data) {
      return c.json({ error: 'Not found', code: 'NOT_FOUND' }, 404)
    }

    return new Response(data, {
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
