/**
 * @xnetjs/hub - WebSocket error-response builder.
 *
 * The hub speaks several error families over the wire (`query-error`,
 * `index-error`, `node-error`, `auth-denied`, plain `error`). Clients parse
 * these exact shapes (`useHubSearch` reads `query-error`, the runtime
 * node-store sync provider reads `node-error`), so this builder centralizes
 * construction WITHOUT changing any shape: each family keeps its historical
 * field set and field order.
 */

export type WsErrorMessage =
  | { type: 'error'; message: string | undefined }
  | { type: 'query-error'; id: string; error: string; code: string; action: string }
  | { type: 'index-error'; docId: string; error: string; code: string; action: string }
  | {
      type: 'node-error'
      code: string
      error: string
      action: string | undefined
      resource: string | undefined
    }
  | { type: 'auth-denied'; code: string; action: string; resource: string; error: string }

export type WsErrorInput =
  | { kind: 'error'; message: string | undefined }
  | { kind: 'query-error'; id: string; error: string; code: string; action: string }
  | { kind: 'index-error'; docId: string; error: string; code: string; action: string }
  | {
      kind: 'node-error'
      code: string
      error: string
      action: string | undefined
      resource: string | undefined
    }
  | { kind: 'auth-denied'; code: string; action: string; resource: string; error: string }

/**
 * Build a WS error response. One entry point, one compat shape per family —
 * the wire format is frozen, so add new fields here only behind a new `kind`.
 */
export const buildWsError = (input: WsErrorInput): WsErrorMessage => {
  switch (input.kind) {
    case 'error':
      return { type: 'error', message: input.message }
    case 'query-error':
      return {
        type: 'query-error',
        id: input.id,
        error: input.error,
        code: input.code,
        action: input.action
      }
    case 'index-error':
      return {
        type: 'index-error',
        docId: input.docId,
        error: input.error,
        code: input.code,
        action: input.action
      }
    case 'node-error':
      return {
        type: 'node-error',
        code: input.code,
        error: input.error,
        action: input.action,
        resource: input.resource
      }
    case 'auth-denied':
      return {
        type: 'auth-denied',
        code: input.code,
        action: input.action,
        resource: input.resource,
        error: input.error
      }
  }
}
