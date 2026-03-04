/**
 * @xnetjs/hub - File storage routes.
 */
import type { AuthContext } from '../auth/ucan'
import type { FileService } from '../services/files'
import { Hono } from 'hono'

type Env = { Variables: { auth: AuthContext } }

export const createFileRoutes = (fileService: FileService): Hono<Env> => {
  const app = new Hono<Env>()

  app.put('/:cid', async (c) => {
    const auth = c.get('auth') as AuthContext
    const cid = c.req.param('cid')
    const mimeType = c.req.header('content-type') ?? 'application/octet-stream'
    const name = c.req.header('x-file-name') ?? 'unnamed'

    if (!auth.can('files/write', '*')) {
      return c.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, 403)
    }

    const body = await c.req.arrayBuffer()
    const data = new Uint8Array(body)

    try {
      const meta = await fileService.upload(cid, data, name, mimeType, auth.did)
      return c.json(meta, 201)
    } catch (err) {
      if (err instanceof Error && err.name === 'FileError') {
        const fileErr = err as import('../services/files').FileError
        switch (fileErr.code) {
          case 'FILE_TOO_LARGE':
            return c.json({ error: fileErr.message, code: fileErr.code }, 413)
          case 'QUOTA_EXCEEDED':
            return c.json({ error: fileErr.message, code: fileErr.code }, 507)
          case 'CID_MISMATCH':
            return c.json({ error: fileErr.message, code: fileErr.code }, 422)
          case 'INVALID_MIME_TYPE':
            return c.json({ error: fileErr.message, code: fileErr.code }, 415)
        }
      }
      throw err
    }
  })

  app.get('/:cid', async (c) => {
    const auth = c.get('auth') as AuthContext
    const cid = c.req.param('cid')

    if (!auth.can('files/read', '*')) {
      return c.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, 403)
    }

    const result = await fileService.download(cid)
    if (!result) {
      return c.json({ error: 'File not found', code: 'NOT_FOUND' }, 404)
    }

    return new Response(result.data as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': result.meta.mimeType,
        'Content-Length': String(result.meta.sizeBytes),
        'Content-Disposition': `inline; filename="${encodeURIComponent(result.meta.name)}"`,
        'Cache-Control': 'public, max-age=31536000, immutable'
      }
    })
  })

  app.on('HEAD', '/:cid', async (c) => {
    const auth = c.get('auth') as AuthContext
    const cid = c.req.param('cid')

    if (!auth.can('files/read', '*')) {
      return new Response(null, { status: 403 })
    }

    const meta = await fileService.getMeta(cid)
    if (!meta) {
      return new Response(null, { status: 404 })
    }

    return new Response(null, {
      status: 200,
      headers: {
        'Content-Type': meta.mimeType,
        'Content-Length': String(meta.sizeBytes)
      }
    })
  })

  app.get('/', async (c) => {
    const auth = c.get('auth') as AuthContext
    const [files, usage] = await Promise.all([
      fileService.listByUploader(auth.did),
      fileService.getUsage(auth.did)
    ])
    return c.json({ files, usage })
  })

  return app
}
