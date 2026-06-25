/**
 * `createXNetServer` — the bring-your-own-backend engine (exploration 0223).
 *
 * It owns a server-side {@link NodeStore} (the canonical reader/writer) over a
 * pluggable storage adapter and exposes two operations a transport drives:
 *
 * - `query(request)` implements the *server side* of the
 *   `RemoteNodeQueryClient` protocol — the structured-query executor the hub
 *   never had (the hub only did full-text search). It authenticates, scopes the
 *   read via {@link AuthorizeReadHook}, runs it against the store, and returns a
 *   protocol `RemoteNodeQueryResponse`.
 * - `mutate(token, input)` is the backend-authoritative write path: it
 *   authenticates, validates via {@link AuthorizeWriteHook}, then applies the
 *   write according to the {@link TrustMode}.
 *
 * `createRemoteQueryClient()` returns an in-process `RemoteNodeQueryClient` that
 * drops straight into `XNetProvider`'s `remoteNodeQueryClient` config, so React
 * `useQuery` reads route to this server with no hook changes.
 */
import type {
  CreateXNetServerOptions,
  MaybePromise,
  MutationResult,
  PendingWrite,
  ServerAuthContext,
  ServerMutationInput,
  TrustMode
} from './types'
import type { NodeState, NodeStorageAdapter, SchemaIRI } from '@xnetjs/data'
import type {
  QueryDescriptor,
  QueryMetadata,
  QueryPageInfo,
  RemoteNodeQueryClient,
  RemoteNodeQueryRequest,
  RemoteNodeQueryResponse
} from '@xnetjs/data-bridge'
import type { DID } from '@xnetjs/identity'
import { generateSigningKeyPair, randomBytes } from '@xnetjs/crypto'
import { MemoryNodeStorageAdapter, NodeStore } from '@xnetjs/data'
import { generateIdentity } from '@xnetjs/identity'
import { deriveCustodialIdentity } from './identity'
import { scopedQuery, toDescriptor } from './read'
import { createInProcessRemoteQueryClient } from './remote-client'

export interface XNetServer {
  /** The active identity-mapping policy. */
  readonly trust: TrustMode
  /** The server's own DID (authors changes in `server` mode). */
  readonly serverDID: DID
  /** The canonical server-side store (reader + `server`/`signed` writer). */
  readonly store: NodeStore
  /**
   * Execute a remote node query. Implements `RemoteNodeQueryClient.query`
   * server-side: authenticate → scope → run → respond.
   */
  query(request: RemoteNodeQueryRequest): Promise<RemoteNodeQueryResponse>
  /** Apply a write after authentication + authorization, per the trust mode. */
  mutate(token: string | undefined, input: ServerMutationInput): Promise<MutationResult>
  /**
   * An in-process `RemoteNodeQueryClient` bound to this server. Pass it to
   * `XNetProvider`'s `remoteNodeQueryClient` to route React reads here.
   */
  createRemoteQueryClient(getToken?: () => MaybePromise<string | undefined>): RemoteNodeQueryClient
  close(): Promise<void>
}

export async function createXNetServer(options: CreateXNetServerOptions): Promise<XNetServer> {
  const trust: TrustMode = options.trust ?? 'server'
  const storage: NodeStorageAdapter = options.storage ?? new MemoryNodeStorageAdapter()

  const server = resolveServerIdentity(options)
  const custodialSecret = options.custodialSecret ?? randomBytes(32)

  const store = new NodeStore({
    storage,
    authorDID: server.did,
    signingKey: server.signingKey
  })
  await store.initialize()

  // Per-subject author stores for `custodial` mode, all over the shared
  // storage adapter. Cached by derived DID; coherent because NodeStore reads
  // current node + last-change state from storage on every write.
  const custodialStores = new Map<DID, NodeStore>()

  async function custodialStore(subject: string): Promise<NodeStore> {
    const identity = deriveCustodialIdentity(custodialSecret, subject)
    const existing = custodialStores.get(identity.did)
    if (existing) return existing
    const authored = new NodeStore({
      storage,
      authorDID: identity.did,
      signingKey: identity.signingKey
    })
    await authored.initialize()
    custodialStores.set(identity.did, authored)
    return authored
  }

  async function query(request: RemoteNodeQueryRequest): Promise<RemoteNodeQueryResponse> {
    const ctx = await options.authenticate(request.auth?.bearerToken)
    if (!ctx) {
      return {
        type: 'node-query/error',
        requestId: request.requestId,
        source: request.source,
        code: 'AUTH_DENIED',
        message: 'authentication failed'
      }
    }

    const scoped = options.authorizeRead
      ? toDescriptor(await options.authorizeRead(ctx, scopedQuery(request.descriptor)))
      : request.descriptor

    const result = await store.query(scoped)
    return buildSuccessResponse(request, scoped, result.nodes, result.totalCount, trust)
  }

  async function mutate(
    token: string | undefined,
    input: ServerMutationInput
  ): Promise<MutationResult> {
    const ctx = await options.authenticate(token)
    if (!ctx) {
      return { ok: false, code: 'UNAUTHENTICATED', reason: 'authentication failed' }
    }

    const pending = pendingWriteFromInput(input, ctx)

    if (options.authorizeWrite) {
      const decision = await options.authorizeWrite(ctx, pending)
      if (!decision.ok) {
        return { ok: false, code: 'WRITE_DENIED', reason: decision.reason ?? 'write denied' }
      }
    }

    if (trust === 'signed') {
      return applySignedMutation(store, ctx, input)
    }

    const writer = trust === 'custodial' ? await custodialStore(ctx.subject) : store
    return applyServerMutation(writer, input)
  }

  return {
    trust,
    serverDID: server.did,
    store,
    query,
    mutate,
    createRemoteQueryClient(getToken) {
      return createInProcessRemoteQueryClient({ query }, getToken)
    },
    async close() {
      custodialStores.clear()
    }
  }
}

function resolveServerIdentity(options: CreateXNetServerOptions): {
  did: DID
  signingKey: Uint8Array
} {
  if (options.serverDID && options.serverSigningKey) {
    return { did: options.serverDID, signingKey: options.serverSigningKey }
  }
  if (options.serverDID || options.serverSigningKey) {
    // Both halves are required together — derive a consistent pair otherwise.
    const pair = generateSigningKeyPair()
    return {
      did: options.serverDID ?? generateIdentity().identity.did,
      signingKey: pair.privateKey
    }
  }
  const generated = generateIdentity()
  return { did: generated.identity.did, signingKey: generated.privateKey }
}

function pendingWriteFromInput(input: ServerMutationInput, ctx: ServerAuthContext): PendingWrite {
  if (input.signedChange) {
    const payload = input.signedChange.payload
    return {
      op: input.op,
      nodeId: payload.nodeId,
      schemaId: (payload.schemaId as SchemaIRI | undefined) ?? input.schemaId,
      subject: ctx.subject,
      payload: {
        properties: payload.properties ?? {},
        deleted: payload.deleted ?? input.op === 'delete'
      }
    }
  }
  switch (input.op) {
    case 'create':
      return {
        op: 'create',
        nodeId: input.id ?? null,
        schemaId: input.schemaId,
        subject: ctx.subject,
        payload: { properties: input.data, deleted: false }
      }
    case 'update':
      return {
        op: 'update',
        nodeId: input.nodeId,
        schemaId: input.schemaId,
        subject: ctx.subject,
        payload: { properties: input.data, deleted: false }
      }
    case 'delete':
      return {
        op: 'delete',
        nodeId: input.nodeId,
        schemaId: input.schemaId,
        subject: ctx.subject,
        payload: { properties: {}, deleted: true }
      }
  }
}

async function applyServerMutation(
  store: NodeStore,
  input: ServerMutationInput
): Promise<MutationResult> {
  try {
    switch (input.op) {
      case 'create': {
        const node = await store.create({
          id: input.id,
          schemaId: input.schemaId,
          properties: input.data
        })
        return { ok: true, node }
      }
      case 'update': {
        const node = await store.update(input.nodeId, { properties: input.data })
        return { ok: true, node }
      }
      case 'delete': {
        await store.delete(input.nodeId)
        return { ok: true, node: null }
      }
    }
  } catch (err) {
    return { ok: false, code: 'NOT_FOUND', reason: errorMessage(err) }
  }
}

async function applySignedMutation(
  store: NodeStore,
  ctx: ServerAuthContext,
  input: ServerMutationInput
): Promise<MutationResult> {
  const change = input.signedChange
  if (!change) {
    return {
      ok: false,
      code: 'SIGNATURE_REQUIRED',
      reason: 'signed trust mode requires a client-signed change'
    }
  }
  if (change.authorDID !== ctx.subject) {
    return {
      ok: false,
      code: 'IDENTITY_MISMATCH',
      reason: `change author ${change.authorDID} is not the authenticated subject ${ctx.subject}`
    }
  }
  try {
    await store.applyRemoteChange(change)
  } catch (err) {
    return { ok: false, code: 'SIGNATURE_INVALID', reason: errorMessage(err) }
  }
  const node = await store.get(change.payload.nodeId)
  return { ok: true, node }
}

function buildSuccessResponse(
  request: RemoteNodeQueryRequest,
  descriptor: QueryDescriptor,
  nodes: NodeState[],
  totalCount: number | undefined,
  trust: TrustMode
): RemoteNodeQueryResponse {
  const limit = descriptor.limit
  const pageInfo: QueryPageInfo = {
    totalCount: totalCount ?? null,
    countMode: totalCount != null ? 'exact' : 'none',
    hasMore: limit != null && nodes.length >= limit,
    hasNextPage: limit != null && nodes.length >= limit,
    hasPreviousPage: (descriptor.offset ?? 0) > 0,
    loadedCount: nodes.length
  }
  const metadata: QueryMetadata = {
    source: 'hub',
    updatedAt: Date.now(),
    pageInfo
  }
  return {
    type: 'node-query/result',
    requestId: request.requestId,
    source: request.source,
    nodes,
    pageInfo,
    metadata,
    completeness: { level: pageInfo.hasMore ? 'partial' : 'complete' },
    staleness: { level: 'fresh', asOf: metadata.updatedAt },
    // `server`/`custodial` nodes are server-trusted, not client-verifiable
    // (the client filters only `failed` nodes, so `unverified` passes through).
    verification: { status: trust === 'signed' ? 'verified' : 'unverified' }
  }
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}
