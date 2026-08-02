#!/usr/bin/env node
/**
 * xNet Cloud — bind the first operator's signing key (exploration 0433, decision 4).
 *
 *   node scripts/cloud-seed-operator.mjs --user <workosUserId> --did did:key:z...
 *   node scripts/cloud-seed-operator.mjs --user <workosUserId> --retire
 *   node scripts/cloud-seed-operator.mjs --list
 *
 * Solves the bootstrap: the operator console requires a named operator, but there
 * is no console yet through which to name the first one. This writes the binding
 * directly, so the ordering is CLI → first operator → console, and every operator
 * added after that is itself an audited action.
 *
 * Two identities, two jobs (and this script only does the second):
 *   - **Authorisation** is the WorkOS organisation `operator` role. Grant it in
 *     the WorkOS dashboard; it arrives as a JWT claim and this script cannot set it.
 *   - **Attribution** is the WorkOS-user → `did:key` binding written here.
 *
 * Requires the same Firestore credentials the control plane uses. With none
 * configured it refuses rather than writing to a throwaway in-memory store — a
 * seed that silently vanished would be worse than a clear failure.
 */

import { parseArgs } from 'node:util'

const COLLECTION = 'operator_bindings'

function usage(msg) {
  if (msg) console.error(`error: ${msg}\n`)
  console.error(
    [
      'Usage:',
      '  node scripts/cloud-seed-operator.mjs --user <workosUserId> --did <did:key:...>',
      '  node scripts/cloud-seed-operator.mjs --user <workosUserId> --retire',
      '  node scripts/cloud-seed-operator.mjs --list',
      '',
      'Env: GOOGLE_CLOUD_PROJECT (or GCP_PROJECT) and standard Google credentials.',
      '     GCP_FIRESTORE_DATABASE optionally selects a non-default database.'
    ].join('\n')
  )
  process.exit(msg ? 1 : 0)
}

async function firestore() {
  const projectId = process.env.GOOGLE_CLOUD_PROJECT ?? process.env.GCP_PROJECT
  if (!projectId) {
    console.error(
      'error: no GCP project configured. Set GOOGLE_CLOUD_PROJECT (or GCP_PROJECT).\n' +
        '       Refusing to seed into an in-memory store that would vanish on exit.'
    )
    process.exit(1)
  }
  let mod
  try {
    mod = await import('@google-cloud/firestore')
  } catch {
    console.error('error: @google-cloud/firestore is not installed in this workspace.')
    process.exit(1)
  }
  const databaseId = process.env.GCP_FIRESTORE_DATABASE
  return new mod.Firestore({ projectId, ...(databaseId ? { databaseId } : {}) })
}

async function main() {
  let args
  try {
    ;({ values: args } = parseArgs({
      options: {
        user: { type: 'string' },
        did: { type: 'string' },
        retire: { type: 'boolean', default: false },
        list: { type: 'boolean', default: false },
        help: { type: 'boolean', default: false }
      }
    }))
  } catch (err) {
    usage(err.message)
  }
  if (args.help) usage()

  const db = await firestore()
  const col = db.collection(COLLECTION)

  if (args.list) {
    const snap = await col.get()
    if (snap.empty) {
      console.log('no operator bindings — the console has no named operators yet')
      return
    }
    for (const doc of snap.docs) {
      const d = doc.data()
      const state = d.retiredAtMs ? `retired ${new Date(d.retiredAtMs).toISOString()}` : 'active'
      console.log(`${doc.id}\t${d.did}\t${state}`)
    }
    return
  }

  if (!args.user) usage('--user is required')

  if (args.retire) {
    const ref = col.doc(args.user)
    const snap = await ref.get()
    if (!snap.exists) usage(`no binding for ${args.user}`)
    // Retire, never delete: audit entries are kept 12 months and name the DID
    // that signed them, so a removed binding would leave a year of history
    // unattributable (decision 15).
    await ref.set({ ...snap.data(), retiredAtMs: Date.now() })
    console.log(`retired ${args.user} (binding kept for historical verification)`)
    return
  }

  if (!args.did) usage('--did is required (or pass --retire)')
  if (!args.did.startsWith('did:')) usage(`not a DID: ${args.did}`)

  await col.doc(args.user).set({
    workosUserId: args.user,
    did: args.did,
    boundAtMs: Date.now()
  })
  console.log(`bound ${args.user} -> ${args.did}`)
  console.log(
    'note: this grants ATTRIBUTION only. Grant the `operator` role to this user in\n' +
      '      the WorkOS dashboard — that is what authorises them.'
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
