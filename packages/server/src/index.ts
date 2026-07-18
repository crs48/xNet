/**
 * `@xnetjs/server` — bring-your-own-backend server kit for xNet React.
 *
 * Run xNet's data layer on your own centralized server, gated by your own auth,
 * stored in your own database — while React keeps the unchanged `useQuery` /
 * `useMutate` / `useNode` hooks. See exploration 0223.
 *
 * @example
 * ```ts
 * const xnet = await createXNetServer({
 *   trust: 'custodial',
 *   authenticate: async (token) => verifyMySession(token),
 *   authorizeRead: (ctx, query) => query.and({ tenant: ctx.tenant }),
 *   authorizeWrite: (ctx, write) => {
 *     // For update/delete, authorize against the STORED node (write.existing),
 *     // not the client-supplied data — otherwise a by-id write could target
 *     // another tenant's node.
 *     const tenant =
 *       write.op === 'create' ? write.payload.properties.tenant : write.existing?.properties.tenant
 *     return tenant === ctx.tenant ? { ok: true } : { ok: false, reason: 'wrong tenant' }
 *   }
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
