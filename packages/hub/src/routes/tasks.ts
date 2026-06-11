/**
 * @xnetjs/hub - Task identifier and GitHub integration routes.
 */

import { Hono } from 'hono'
import {
  processGithubEvent,
  verifyWebhookSignature,
  type TaskAutomationAction
} from '../services/github-integration'
import { TaskIdentifierError, type TaskIdentifierService } from '../services/task-identifiers'
import { isRecord } from '../utils/validation'

export interface TaskRoutesOptions {
  identifiers: TaskIdentifierService
  /** GitHub webhook secret; webhook route is disabled when absent */
  githubWebhookSecret?: string
  /**
   * Applies automation actions to the workspace's Task nodes (resolve
   * shortId → node, attach ExternalReference, set status). Injected so the
   * route stays transport-only.
   */
  applyAutomationActions?: (actions: TaskAutomationAction[]) => Promise<void>
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

  app.post('/github/webhook', async (c) => {
    const secret = options.githubWebhookSecret
    if (!secret) {
      return c.json({ error: 'GitHub integration is not configured', code: 'NOT_CONFIGURED' }, 503)
    }

    const rawBody = await c.req.text()
    const signature = c.req.header('x-hub-signature-256')
    if (!verifyWebhookSignature(secret, rawBody, signature)) {
      return c.json({ error: 'Invalid webhook signature', code: 'INVALID_SIGNATURE' }, 401)
    }

    const eventType = c.req.header('x-github-event') ?? ''
    let payload: unknown
    try {
      payload = JSON.parse(rawBody)
    } catch {
      return c.json({ error: 'Invalid JSON payload', code: 'INVALID_INPUT' }, 400)
    }

    const actions = processGithubEvent(eventType, payload)
    if (actions.length > 0 && options.applyAutomationActions) {
      await options.applyAutomationActions(actions)
    }

    return c.json({ ok: true, actions: actions.length })
  })

  return app
}
