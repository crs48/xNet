/**
 * xNet Cloud — Firestore-backed durable stores (the production `DocStore`).
 *
 * Firestore fits a scale-to-zero control plane: serverless, no idle cost, and the
 * deployer service account already has `datastore.user`. Thin wrapper over the
 * `@google-cloud/firestore` SDK — the store *logic* is tested in `./durable.ts`;
 * this file just maps the port to the SDK (validate against a real project/emulator
 * at deploy time).
 */

import type { TenantRecord, TenantStore } from '../registry'
import type { BindingStore, TenantBinding } from '@xnetjs/cloud/identity'
import { Firestore, type CollectionReference, type DocumentData } from '@google-cloud/firestore'
import { type JobRecord } from '../jobs/leased'
import { nonceStoreFromDocs, type NonceRecord, type NonceStore } from '../nonce'
import { type RolloutRun, type RolloutRunStore } from '../rollout/run-record'
import { bindingStoreFromDocs, tenantStoreFromDocs, type DocStore } from './durable'

export class FirestoreDocStore<T> implements DocStore<T> {
  constructor(private readonly col: CollectionReference) {}

  async get(id: string): Promise<T | null> {
    const snap = await this.col.doc(id).get()
    return snap.exists ? (snap.data() as T) : null
  }
  async put(id: string, doc: T): Promise<void> {
    await this.col.doc(id).set(doc as DocumentData)
  }
  async delete(id: string): Promise<void> {
    await this.col.doc(id).delete()
  }
  async list(): Promise<T[]> {
    const snap = await this.col.get()
    return snap.docs.map((d) => d.data() as T)
  }
}

/**
 * A `DocStore` whose read-modify-write is atomic, for job leases (0411 G2).
 *
 * The plain store above is fine for tenant records — one writer, last-write-wins
 * is acceptable. A lease is different: two replicas ticking at the same instant
 * both read "unleased" and both write their own lease, and the job runs twice.
 * {@link claimAtomically} runs the claim inside a Firestore transaction, so the
 * loser retries against the winner's write and correctly sees the job as leased.
 *
 * Single-instance today, which is why `runIfDue` over the plain store is still
 * correct; this exists so scaling to two replicas is a wiring change rather than
 * a correctness bug. More than two replicas is tripwire T3.
 */
export class FirestoreLeaseStore<T> {
  constructor(
    private readonly firestore: Firestore,
    private readonly col: CollectionReference
  ) {}

  /**
   * Atomically read the current doc, ask `decide` for the next one, and write it
   * if `decide` returns a value. Returns what was written, or null when `decide`
   * declined (already leased / not due).
   */
  async claimAtomically(id: string, decide: (current: T | null) => T | null): Promise<T | null> {
    return this.firestore.runTransaction(async (tx) => {
      const ref = this.col.doc(id)
      const snap = await tx.get(ref)
      const next = decide(snap.exists ? (snap.data() as T) : null)
      if (!next) return null
      tx.set(ref, next as DocumentData)
      return next
    })
  }
}

export interface DurableStores {
  tenants: TenantStore
  bindings: BindingStore
  /** Single-use device-claim nonces (0243), durable so they survive a restart mid-claim. */
  nonces: NonceStore
  /** Periodic-job schedule state (0411 G2) — survives deploys so drills cannot be skipped. */
  jobs: DocStore<JobRecord>
  /** Staged-rollout checkpoints (0411 G3) — lets a killed rollout resume mid-wave. */
  rollouts: RolloutRunStore
}

/**
 * A Firestore client for the control-plane state, or null when GCP/Firestore is
 * unconfigured. Firestore lives in the shard-0 project (`<prefix>-0`), where
 * `cloud-gcp-bootstrap.sh` created it; auth comes from GOOGLE_APPLICATION_CREDENTIALS.
 */
export function firestoreFromEnv(env: NodeJS.ProcessEnv = process.env): Firestore | null {
  if (!env.GCP_PROJECT_PREFIX || !env.GCP_FIRESTORE_DATABASE) return null
  return new Firestore({
    projectId: `${env.GCP_PROJECT_PREFIX}-0`,
    ...(env.GCP_FIRESTORE_DATABASE !== '(default)'
      ? { databaseId: env.GCP_FIRESTORE_DATABASE }
      : {})
  })
}

/**
 * Firestore-backed tenant + binding stores when GCP/Firestore is configured, else
 * null (caller falls back to in-memory).
 */
export function firestoreStoresFromEnv(env: NodeJS.ProcessEnv = process.env): DurableStores | null {
  const firestore = firestoreFromEnv(env)
  if (!firestore) return null
  return {
    tenants: tenantStoreFromDocs(
      new FirestoreDocStore<TenantRecord>(firestore.collection('tenants'))
    ),
    bindings: bindingStoreFromDocs(
      new FirestoreDocStore<TenantBinding>(firestore.collection('bindings'))
    ),
    nonces: nonceStoreFromDocs(
      new FirestoreDocStore<NonceRecord>(firestore.collection('claim_nonces'))
    ),
    jobs: new FirestoreDocStore<JobRecord>(firestore.collection('jobs')),
    rollouts: new FirestoreDocStore<RolloutRun>(firestore.collection('rollouts'))
  }
}
