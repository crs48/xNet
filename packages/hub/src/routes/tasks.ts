/**
 * @xnetjs/hub - Task short-id allocation route.
 *
 * The GitHub → Tasks webhook moved to a declarative `HubFeature` webhook
 * (`features/first-party.ts`, exploration 0189); this route now owns only
 * short-id allocation.
 */

import { Hono } from 'hono'
import { TaskIdentifierError, type TaskIdentifierService } from '../services/task-identifiers'
import { isRecord } from '../utils/validation'

export interface TaskRoutesOptions {
  identifiers: TaskIdentifierService
}

export const createTaskRoutes = (options: TaskRoutesOptions): Hono => {
  const app = new Hono()

  app.post('/short-ids/allocate', async (c) => {
    const body = await c.req.json().catch(() => null)
    if (
      !isRecord(body) ||
      typeof body.workspaceId !== 'string' ||
      typeof body.prefix !== 'string'
    ) {
      return c.json({ error: 'workspaceId and prefix are required', code: 'INVALID_INPUT' }, 400)
    }

    try {
      const block = options.identifiers.allocateBlock({
        workspaceId: body.workspaceId,
        prefix: body.prefix,
        size: typeof body.size === 'number' ? body.size : undefined
      })
      return c.json(block)
    } catch (err) {
      if (err instanceof TaskIdentifierError) {
        return c.json({ error: err.message, code: err.code }, 400)
      }
      throw err
    }
  })

  return app
}
