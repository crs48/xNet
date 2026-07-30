/**
 * Public types for `@xnetjs/server` — the bring-your-own-backend server kit
 * (exploration 0223).
 *
 * The shapes here are deliberately framework-agnostic: a developer mounts the
 * server into Express / Hono / Fastify / a Next.js route handler and wires
 * three hooks — {@link AuthenticateHook}, {@link AuthorizeReadHook},
 * {@link AuthorizeWriteHook} — that map *their* auth onto xNet's data layer.
 * No UCAN, no `did:key` required from the end user.
 */
import type { NodeChange, NodeState, NodeStorageAdapter, SchemaIRI } from '@xnetjs/data'
import type { QueryDescriptor } from '@xnetjs/data-bridge'
import type { DID } from '@xnetjs/identity'

export type MaybePromise<T> = T | Promise<T>

/**
 * How an end-user's identity maps onto the signed-change model.
 *
 * - `server` — the server authors every change with its own identity. The
 *   end-user is enforced only by {@link AuthorizeWriteHook}. Most plug-and-play,
 *   weakest cryptographic guarantees. (default)
 * - `custodial` — the server signs on the user's behalf with a stable per-user
 *   key it derives and custodies, so each change carries a per-user `authorDID`
 *   while the user never manages a key.
 * - `signed` — the client holds the key and submits a pre-signed change; the
 *   server verifies the signature and that the change's author is bound to the
 *   authenticated subject. Strongest integrity; rejects forged authorship.
 */
export type TrustMode = 'server' | 'custodial' | 'signed'

/**
 * The result of authenticating a request. `subject` is the developer's own
 * principal (an opaque user id in `server`/`custodial` mode, or a `did:key` in
 * `signed` mode). Extra claims (roles, orgs, tenant) ride along untyped so the
 * authorize hooks can use them.
 */
export interface ServerAuthContext {
  subject: string
  roles?: string[]
  [claim: string]: unknown
}

/**
 * Exchange a bearer token (or cookie value, or any credential string the
 * transport carries) for a {@link ServerAuthContext}. Return `null` to reject.
 */
export type AuthenticateHook = (token: string | undefined) => MaybePromise<ServerAuthContext | null>

/**
 * A narrowable view of an incoming read. `and()` ANDs additional equality
 * filters into the descriptor's `where` clause — the common row-level-security
 * move ("only ever return rows in this user's tenant").
 */
export interface ScopedQuery {
  readonly descriptor: QueryDescriptor
  /** Return a new ScopedQuery with `where` merged (AND semantics). */
  and(where: Record<string, unknown>): ScopedQuery
}

/**
 * Scope what data a subject receives. Return the (narrowed) query or a raw
 * descriptor. Omit the hook to allow the descriptor through unchanged.
 */
export type AuthorizeReadHook = (
  ctx: ServerAuthContext,
  query: ScopedQuery
) => MaybePromise<ScopedQuery | QueryDescriptor>

export type WriteOp = 'create' | 'update' | 'delete'

/**
 * A normalized, backend-authoritative view of a pending write, handed to
 * {@link AuthorizeWriteHook}. For `create`/`update`, `payload.properties` is the
 * data being written; for `delete`, `payload.deleted` is `true`.
 *
 * `schemaId` and `existing` describe the **actual target**, loaded server-side
 * — not the client's claim. For `update`/`delete`, `schemaId` is the stored
 * node's real schema and `existing` is its current snapshot, so ownership
 * checks (e.g. `existing?.properties.tenant === ctx.tenant`) and schema
 * allow-lists can't be bypassed by a by-id write. `existing` is `null` for a
 * `create`.
 */
export interface PendingWrite {
  op: WriteOp
  /** `null` for a `create` whose id the server will generate. */
  nodeId: string | null
  schemaId: SchemaIRI
  subject: string
  payload: {
    properties: Record<string, unknown>
    deleted: boolean
  }
  /** The stored node being mutated (update/delete), or `null` for create / not-found. */
  existing: { schemaId: SchemaIRI; properties: Record<string, unknown>; createdBy: string } | null
}

export interface WriteDecision {
  ok: boolean
  reason?: string
}

/**
 * Validate a write in the developer's own terms. Omit the hook to allow all
 * writes (e.g. when an upstream proxy already authorized them).
 */
export type AuthorizeWriteHook = (
  ctx: ServerAuthContext,
  write: PendingWrite
) => MaybePromise<WriteDecision>

/**
 * A mutation intent submitted by a client. In `signed` mode the client also
 * supplies `signedChange`; otherwise the server constructs and signs the
 * change.
 */
export type ServerMutationInput =
  | {
      op: 'create'
      schemaId: SchemaIRI
      id?: string
      data: Record<string, unknown>
      signedChange?: NodeChange
    }
  | {
      op: 'update'
      schemaId: SchemaIRI
      nodeId: string
      data: Record<string, unknown>
      signedChange?: NodeChange
    }
  | {
      op: 'delete'
      schemaId: SchemaIRI
      nodeId: string
      signedChange?: NodeChange
    }

export type MutationErrorCode =
  | 'UNAUTHENTICATED'
  | 'WRITE_DENIED'
  | 'SIGNATURE_REQUIRED'
  | 'SIGNATURE_INVALID'
  | 'IDENTITY_MISMATCH'
  | 'NOT_FOUND'
  | 'ALREADY_EXISTS'
  | 'WRITE_FAILED'

export type MutationResult =
  | { ok: true; node: NodeState | null }
  | { ok: false; code: MutationErrorCode; reason: string }

export interface CreateXNetServerOptions {
  /** Node storage adapter. Defaults to an in-memory adapter. */
  storage?: NodeStorageAdapter
  /** Identity-mapping policy. Defaults to `'server'`. */
  trust?: TrustMode
  /**
   * The server's own DID. Generated (ephemeral) when omitted — fine for tests,
   * but provide a stable one in production so authorship survives restarts.
   */
  serverDID?: DID
  /** The server's Ed25519 signing key (32-byte seed). Generated when omitted. */
  serverSigningKey?: Uint8Array
  /**
   * Secret used to derive stable per-user keys in `custodial` mode. Generated
   * (ephemeral) when omitted — provide a stable one in production.
   */
  custodialSecret?: Uint8Array
  authenticate: AuthenticateHook
  authorizeRead?: AuthorizeReadHook
  authorizeWrite?: AuthorizeWriteHook
}
