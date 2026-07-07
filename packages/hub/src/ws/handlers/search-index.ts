/**
 * @xnetjs/hub - `index-update` / `index-remove` handlers (search index writes).
 */

import type { Metrics } from '../../middleware/metrics'
import type { QueryService } from '../../services/query'
import type { IndexRemoveMessage, IndexUpdateMessage } from '../guards'
import type { WsHandler, WsHandlerResult } from '../message-router'
import { createHubAuthError } from '../../auth/errors'
import { HUB_METRICS } from '../../middleware/metrics'
import { buildWsError } from '../errors'

export const createIndexUpdateHandler = (deps: {
  query: QueryService
  metrics: Metrics
}): WsHandler<IndexUpdateMessage> => {
  return async (payload, ctx): Promise<WsHandlerResult> => {
    if (!ctx.authContext.can('index/write', payload.docId)) {
      const authError = createHubAuthError({
        code: 'FORBIDDEN',
        message: 'Capability does not allow index update',
        action: 'hub/relay',
        resource: payload.docId
      })
      // NOTE: historically this send does NOT increment WS_MESSAGES_SENT
      // (unlike the ack path) — preserved as-is.
      ctx.ws.send(
        JSON.stringify(
          buildWsError({
            kind: 'index-error',
            docId: payload.docId,
            error: authError.message,
            code: authError.code,
            action: authError.action
          })
        )
      )
      return 'handled'
    }
    const ack = await deps.query.handleIndexUpdate(payload.docId, ctx.authContext.did, payload)
    ctx.ws.send(JSON.stringify(ack))
    deps.metrics.increment(HUB_METRICS.WS_MESSAGES_SENT)
    return 'handled'
  }
}

export const createIndexRemoveHandler = (deps: {
  query: QueryService
  metrics: Metrics
}): WsHandler<IndexRemoveMessage> => {
  return async (payload, ctx): Promise<WsHandlerResult> => {
    if (!ctx.authContext.can('index/write', payload.docId)) {
      const authError = createHubAuthError({
        code: 'FORBIDDEN',
        message: 'Capability does not allow index removal',
        action: 'hub/relay',
        resource: payload.docId
      })
      // NOTE: historically this send does NOT increment WS_MESSAGES_SENT
      // (unlike the ack path) — preserved as-is.
      ctx.ws.send(
        JSON.stringify(
          buildWsError({
            kind: 'index-error',
            docId: payload.docId,
            error: authError.message,
            code: authError.code,
            action: authError.action
          })
        )
      )
      return 'handled'
    }
    await deps.query.removeFromIndex(payload.docId)
    ctx.ws.send(JSON.stringify({ type: 'index-ack', docId: payload.docId, indexed: false }))
    deps.metrics.increment(HUB_METRICS.WS_MESSAGES_SENT)
    return 'handled'
  }
}
