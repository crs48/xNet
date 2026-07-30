/**
 * @xnetjs/hub - `query-request` handler (local search + optional federation).
 */

import type { Metrics } from '../../middleware/metrics'
import type { FederationService } from '../../services/federation'
import type { QueryService } from '../../services/query'
import type { QueryRequestMessage } from '../guards'
import type { WsHandler, WsHandlerResult } from '../message-router'
import { createHubAuthError } from '../../auth/errors'
import { HUB_METRICS } from '../../middleware/metrics'
import { buildWsError } from '../errors'

export const createQueryRequestHandler = (deps: {
  query: QueryService
  federation: FederationService
  federationEnabled: boolean
  metrics: Metrics
}): WsHandler<QueryRequestMessage> => {
  return async (payload, ctx): Promise<WsHandlerResult> => {
    if (!ctx.authContext.can('query/read', '*')) {
      const authError = createHubAuthError({
        code: 'FORBIDDEN',
        message: 'Capability does not allow querying',
        action: 'hub/query'
      })
      // NOTE: historically this send does NOT increment WS_MESSAGES_SENT
      // (unlike the success path) — preserved as-is.
      ctx.ws.send(
        JSON.stringify(
          buildWsError({
            kind: 'query-error',
            id: payload.id,
            error: authError.message,
            code: authError.code,
            action: authError.action
          })
        )
      )
      return 'handled'
    }
    const response =
      payload.federate && deps.federationEnabled
        ? await deps.federation.search(payload)
        : await deps.query.handleQuery(payload, ctx.authContext.did)
    deps.metrics.increment(HUB_METRICS.QUERY_REQUESTS_TOTAL)
    deps.metrics.observe(HUB_METRICS.QUERY_DURATION_MS, response.took)
    ctx.ws.send(JSON.stringify(response))
    deps.metrics.increment(HUB_METRICS.WS_MESSAGES_SENT)
    return 'handled'
  }
}
