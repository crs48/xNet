/**
 * `@xnetjs/server` — bring-your-own-backend server kit for XNet React.
 *
 * Run XNet's data layer on your own centralized server, gated by your own auth,
 * stored in your own database — while React keeps the unchanged `useQuery` /
 * `useMutate` / `useNode` hooks. See exploration 0223.
 *
 * @example
 * ```ts
 * const xnet = await createXNetServer({
 *   trust: 'custodial',
 *   authenticate: async (token) => verifyMySession(token),
 *   authorizeRead: (ctx, query) => query.and({ tenant: ctx.tenant }),
 *   authorizeWrite: (ctx, write) =>
 *     ctx.tenant === write.payload.properties.tenant
 *       ? { ok: true }
 *       : { ok: false, reason: 'wrong tenant' }
 * })
 *
 * // Reads route through the existing client seam — no React changes:
 * // <XNetProvider config={{ remoteNodeQueryClient: xnet.createRemoteQueryClient(getToken) }} />
 * ```
 */
export { createXNetServer } from './server'
export type { XNetServer } from './server'
export { scopedQuery, toDescriptor } from './read'
export { deriveCustodialIdentity } from './identity'
export type { DerivedIdentity } from './identity'
export { createInProcessRemoteQueryClient } from './remote-client'
export type { RemoteQueryRunner } from './remote-client'
export type {
  AuthenticateHook,
  AuthorizeReadHook,
  AuthorizeWriteHook,
  CreateXNetServerOptions,
  MaybePromise,
  MutationErrorCode,
  MutationResult,
  PendingWrite,
  ScopedQuery,
  ServerAuthContext,
  ServerMutationInput,
  TrustMode,
  WriteDecision,
  WriteOp
} from './types'
