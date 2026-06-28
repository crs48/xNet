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
import { nonceStoreFromDocs, type NonceRecord, type NonceStore } from '../nonce'
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

export interface DurableStores {
  tenants: TenantStore
  bindings: BindingStore
  /** Single-use device-claim nonces (0243), durable so they survive a restart mid-claim. */
  nonces: NonceStore
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
    )
  }
}
