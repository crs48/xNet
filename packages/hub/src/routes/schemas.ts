/**
 * @xnetjs/hub - Schema registry routes.
 */

import type { AuthContext } from '../auth/ucan'
import type { SchemaRegistryService } from '../services/schemas'
import type { Context, MiddlewareHandler } from 'hono'
import { Hono } from 'hono'
import { SchemaError } from '../services/schemas'
import { isRecord } from '../utils/validation'

export type SchemaRoutesOptions = {
  requireAuth?: MiddlewareHandler
}

export const createSchemaRoutes = (
  schemas: SchemaRegistryService,
  options: SchemaRoutesOptions = {}
): Hono => {
  const app = new Hono()
  const requireAuth = options.requireAuth

  const publish = async (c: Context) => {
    const auth = c.get('auth') as AuthContext | undefined
    if (!auth) {
      return c.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, 401)
    }

    const body = await c.req.json()
    if (!isRecord(body)) {
      return c.json({ error: 'Invalid schema payload', code: 'INVALID_DEFINITION' }, 400)
    }

    try {
      const record = await schemas.publish(
        body as import('../services/schemas').SchemaDefinitionInput,
        {
          did: auth.did,
          canAdmin: auth.can('hub/admin', '*')
        }
      )
      return c.json(record, 201)
    } catch (err) {
      if (err instanceof SchemaError) {
        switch (err.code) {
          case 'INVALID_IRI':
          case 'INVALID_DEFINITION':
            return c.json({ error: err.message, code: err.code }, 400)
          case 'UNAUTHORIZED':
            return c.json({ error: err.message, code: err.code }, 403)
          case 'VERSION_CONFLICT':
            return c.json({ error: err.message, code: err.code }, 409)
        }
      }
      throw err
    }
  }

  if (requireAuth) {
    app.post('/', requireAuth, publish)
  } else {
    app.post('/', publish)
  }

  app.get('/resolve/*', async (c) => {
    const iri = decodeURIComponent(c.req.path.replace('/schemas/resolve/', ''))
    const versionParam = c.req.query('version')
    const version = versionParam ? Number(versionParam) : undefined

    const record = await schemas.resolve(iri, Number.isFinite(version) ? version : undefined)
    if (!record) {
      return c.json({ error: 'Schema not found', code: 'NOT_FOUND' }, 404)
    }

    return c.json(record)
  })

  app.get('/', async (c) => {
    const search = c.req.query('search')
    const author = c.req.query('author')
    const rawLimit = Number(c.req.query('limit') ?? 20)
    const rawOffset = Number(c.req.query('offset') ?? 0)
    const limit = Number.isFinite(rawLimit) ? Math.min(rawLimit, 100) : 20
    const offset = Number.isFinite(rawOffset) ? Math.max(rawOffset, 0) : 0

    if (search) {
      const results = await schemas.search(search, { limit, offset })
      return c.json({ schemas: results, total: results.length })
    }

    if (author) {
      const results = await schemas.listByAuthor(author)
      return c.json({ schemas: results, total: results.length })
    }

    const results = await schemas.listPopular(limit)
    return c.json({ schemas: results, total: results.length })
  })

  return app
}
