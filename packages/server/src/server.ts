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
 *   authenticates, loads the target node, validates via {@link AuthorizeWriteHook}
 *   against the node's *actual* state, then applies the write per the
 *   {@link TrustMode}.
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
  TrustMode,
  WriteOp
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
import { getSigningPublicKeyFromPrivate } from '@xnetjs/crypto'
import { MemoryNodeStorageAdapter, NodeStore } from '@xnetjs/data'
import { createDID, generateIdentity } from '@xnetjs/identity'
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
  const custodialSecret = options.custodialSecret ?? generateIdentity().privateKey

  const store = new NodeStore({
    storage,
    authorDID: server.did,
    signingKey: server.signingKey
  })
  await store.initialize()

  // Per-subject author stores for `custodial` mode, all over the shared storage
  // adapter. Cached by derived DID; the clock is reconciled before each write
  // (see custodialStore) so interleaved per-subject writes converge under LWW.
  const custodialStores = new Map<DID, NodeStore>()

  async function custodialStore(subject: string): Promise<NodeStore> {
    const identity = deriveCustodialIdentity(custodialSecret, subject)
    let authored = custodialStores.get(identity.did)
    if (!authored) {
      authored = new NodeStore({
        storage,
        authorDID: identity.did,
        signingKey: identity.signingKey
      })
      custodialStores.set(identity.did, authored)
    }
    // Reconcile the Lamport clock with the persisted high-water-mark before
    // writing. `initialize()` reads the stored last-lamport (every write path
    // persists it via setLastLamportTime), so a cached per-subject store sees
    // writes other subjects made since its last use — preventing clock drift
    // that would corrupt LWW ordering on shared nodes.
    await authored.initialize()
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

    // Overfetch by one so `hasMore` reflects whether another page exists,
    // rather than false-positiving whenever a page exactly fills the limit.
    const limit = scoped.limit
    const execDescriptor: QueryDescriptor = limit != null ? { ...scoped, limit: limit + 1 } : scoped
    const result = await store.query(execDescriptor)

    let nodes = result.nodes
    let hasMore = false
    if (limit != null && nodes.length > limit) {
      nodes = nodes.slice(0, limit)
      hasMore = true
    }

    return buildSuccessResponse(request, scoped, nodes, hasMore, result.totalCount, trust)
  }

  async function mutate(
    token: string | undefined,
    input: ServerMutationInput
  ): Promise<MutationResult> {
    const ctx = await options.authenticate(token)
    if (!ctx) {
      return { ok: false, code: 'UNAUTHENTICATED', reason: 'authentication failed' }
    }

    // Resolve the target node and load its CURRENT stored state, so the write is
    // authorized against what is actually being mutated — not the client's
    // claimed schemaId/data. For signed changes the target is the change's node.
    const targetNodeId = input.signedChange
      ? input.signedChange.payload.nodeId
      : input.op === 'create'
        ? (input.id ?? null)
        : input.nodeId
    const existing = targetNodeId ? await store.get(targetNodeId) : null

    const pending = pendingWriteFromInput(input, ctx, existing)

    // Authorize FIRST — before any existence-dependent response — so a denied
    // principal cannot use NOT_FOUND / ALREADY_EXISTS as a node-existence oracle.
    if (options.authorizeWrite) {
      const decision = await options.authorizeWrite(ctx, pending)
      if (!decision.ok) {
        return { ok: false, code: 'WRITE_DENIED', reason: decision.reason ?? 'write denied' }
      }
    }

    // A create must not silently overwrite an existing node — NodeStore.create
    // LWW-merges onto any node with the same id, so the kit enforces the
    // create-vs-existing distinction itself. An update/delete must have a target.
    if (pending.op === 'create' && existing) {
      return {
        ok: false,
        code: 'ALREADY_EXISTS',
        reason: `node ${pending.nodeId ?? '(unknown)'} already exists`
      }
    }
    if ((pending.op === 'update' || pending.op === 'delete') && !existing) {
      return {
        ok: false,
        code: 'NOT_FOUND',
        reason: `node ${pending.nodeId ?? '(unknown)'} not found`
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

/**
 * Resolve the server's signing identity. The DID and signing key MUST be a
 * matching pair (the relay verifies every change's signature against the DID's
 * public key), so we never fabricate one half:
 * - both provided → verify they match, else throw.
 * - only the key → derive the DID from it.
 * - only the DID → throw (no key to sign with).
 * - neither → generate a fresh pair.
 */
function resolveServerIdentity(options: CreateXNetServerOptions): {
  did: DID
  signingKey: Uint8Array
} {
  const { serverDID, serverSigningKey } = options
  if (serverSigningKey) {
    const derived = createDID(getSigningPublicKeyFromPrivate(serverSigningKey))
    if (serverDID && serverDID !== derived) {
      throw new Error(
        `@xnetjs/server: serverDID (${serverDID}) does not match the public key of ` +
          `serverSigningKey (${derived}); changes would fail signature verification`
      )
    }
    return { did: derived, signingKey: serverSigningKey }
  }
  if (serverDID) {
    throw new Error(
      '@xnetjs/server: serverDID was provided without serverSigningKey; the server cannot sign changes'
    )
  }
  const generated = generateIdentity()
  return { did: generated.identity.did, signingKey: generated.privateKey }
}

function existingSnapshot(node: NodeState | null): PendingWrite['existing'] {
  return node
    ? { schemaId: node.schemaId, properties: node.properties, createdBy: node.createdBy }
    : null
}

function pendingWriteFromInput(
  input: ServerMutationInput,
  ctx: ServerAuthContext,
  existing: NodeState | null
): PendingWrite {
  // Signed changes are self-describing: derive the op, target, schema, and
  // payload from the verified change — never from caller-supplied input — so
  // the operation shown to authorizeWrite is the one actually applied.
  if (input.signedChange) {
    const payload = input.signedChange.payload
    const op: WriteOp = payload.deleted ? 'delete' : existing ? 'update' : 'create'
    return {
      op,
      nodeId: payload.nodeId,
      // The stored node's schema wins for update/delete (schema allow-lists must
      // see the real target); the change's schema only governs a fresh create.
      schemaId: existing?.schemaId ?? (payload.schemaId as SchemaIRI | undefined) ?? input.schemaId,
      subject: ctx.subject,
      payload: {
        properties: payload.properties ?? {},
        deleted: payload.deleted ?? false
      },
      existing: existingSnapshot(existing)
    }
  }
  switch (input.op) {
    case 'create':
      return {
        op: 'create',
        nodeId: input.id ?? null,
        schemaId: input.schemaId,
        subject: ctx.subject,
        payload: { properties: input.data, deleted: false },
        // Surfaced so a create that targets an already-existing id is visible
        // to authorizeWrite (the mutate path also hard-rejects it).
        existing: existingSnapshot(existing)
      }
    case 'update':
      return {
        op: 'update',
        nodeId: input.nodeId,
        // The effective schema is the stored node's, not the client's claim.
        schemaId: existing?.schemaId ?? input.schemaId,
        subject: ctx.subject,
        payload: { properties: input.data, deleted: false },
        existing: existingSnapshot(existing)
      }
    case 'delete':
      return {
        op: 'delete',
        nodeId: input.nodeId,
        schemaId: existing?.schemaId ?? input.schemaId,
        subject: ctx.subject,
        payload: { properties: {}, deleted: true },
        existing: existingSnapshot(existing)
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
    return { ok: false, code: 'WRITE_FAILED', reason: errorMessage(err) }
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
  hasMore: boolean,
  totalCount: number | undefined,
  trust: TrustMode
): RemoteNodeQueryResponse {
  const pageInfo: QueryPageInfo = {
    totalCount: totalCount ?? null,
    countMode: totalCount != null ? 'exact' : 'none',
    hasMore,
    hasNextPage: hasMore,
    hasPreviousPage: (descriptor.offset ?? 0) > 0 || descriptor.after !== undefined,
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
