/**
 * @xnetjs/hub - WebSocket message router (exploration 0276 Theme 2).
 *
 * Replaces the inline if/else pump in server.ts with an ordered registry.
 * Routes are evaluated in REGISTRATION order — the pump's original branch
 * order is load-bearing (several stages match the same `publish` type and
 * fall through to the next stage), so registration order is the contract.
 *
 * A handler returns:
 *  - `'handled'`  → stop dispatching (the pump's `return`)
 *  - `'continue'` → keep evaluating later routes (the pump's fall-through)
 */

import type { AuthContext, AuthSession } from '../auth/ucan'
import type { Metrics } from '../middleware/metrics'
import type { WebSocket } from 'ws'
import { HUB_METRICS } from '../middleware/metrics'

export type WsConnectionContext = {
  ws: WebSocket
  session: AuthSession
  authContext: AuthContext
}

export type WsHandlerResult = 'handled' | 'continue'

export type WsHandler<T> = (
  payload: T,
  ctx: WsConnectionContext
) => Promise<WsHandlerResult> | WsHandlerResult

type WsRoute = {
  type: string
  matches: (value: unknown) => boolean
  handle: WsHandler<never>
}

export type MessageRouter = {
  on: <T>(type: string, guard: (value: unknown) => value is T, handler: WsHandler<T>) => void
  dispatch: (payload: unknown, ctx: WsConnectionContext) => Promise<void>
}

/**
 * Per-type received counter. Only types with a registered route are counted
 * by name (anything else buckets to `unknown`) so a malicious client cannot
 * inflate metric cardinality with arbitrary `type` strings.
 */
const messageTypeMetric = (type: string): string =>
  `hub_ws_messages_received_${type.replace(/[^a-zA-Z0-9]/g, '_')}_total`

export const createMessageRouter = (metrics: Metrics): MessageRouter => {
  const routes: WsRoute[] = []
  const knownTypes = new Set<string>()

  const on = <T>(
    type: string,
    guard: (value: unknown) => value is T,
    handler: WsHandler<T>
  ): void => {
    knownTypes.add(type)
    routes.push({ type, matches: guard, handle: handler as WsHandler<never> })
  }

  const dispatch = async (payload: unknown, ctx: WsConnectionContext): Promise<void> => {
    metrics.increment(HUB_METRICS.WS_MESSAGES_RECEIVED)
    const rawType =
      payload && typeof payload === 'object' && typeof (payload as { type?: unknown }).type === 'string'
        ? (payload as { type: string }).type
        : 'unknown'
    metrics.increment(messageTypeMetric(knownTypes.has(rawType) ? rawType : 'unknown'))

    for (const route of routes) {
      if (!route.matches(payload)) continue
      const result = await route.handle(payload as never, ctx)
      if (result === 'handled') return
    }
  }

  return { on, dispatch }
}
