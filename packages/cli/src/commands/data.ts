/**
 * `xnet data` — read and write live nodes from the command line.
 *
 * This is the proof that the xNet data model runs entirely outside React: the
 * command builds a framework-agnostic runtime client with `createXNetClient`
 * (exploration 0185) backed by SQLite, then signs, validates, stores, and
 * queries nodes — the same engine the React hooks use, in a plain Node process.
 *
 * It operates on a built-in demonstration `Note` schema (title + body) so it is
 * self-contained; the same pattern works for any app schema.
 */
import type { DID } from '@xnetjs/core'
import type { BundleScope, BundleVerifyReport, NodeState, NodeStorageAdapter } from '@xnetjs/data'
import type { XNetClient } from '@xnetjs/runtime'
import type { Command } from 'commander'
import { generateSigningKeyPair, getSigningPublicKeyFromPrivate, sign } from '@xnetjs/crypto'
import {
  applyBundle,
  defineSchema,
  SQLiteNodeStorageAdapter,
  text,
  verifyBundle,
  writeBundle
} from '@xnetjs/data'
import { createDID } from '@xnetjs/identity'
import { createXNetClient } from '@xnetjs/runtime'
import chalk from 'chalk'
import { FsBundleSink, FsBundleSource } from '../utils/fs-bundle.js'

/** Built-in demonstration schema. Replace with your app's schemas in real use. */
export const NoteSchema = defineSchema({
  name: 'Note',
  namespace: 'xnet://cli/',
  properties: {
    title: text({ required: true }),
    body: text({})
  }
})

export interface DataClientOptions {
  /** SQLite file path. When omitted, an in-memory database is used (ephemeral). */
  db?: string
  /** Ed25519 signing key as hex. Falls back to $XNET_SIGNING_KEY, then ephemeral. */
  key?: string
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex
  return new Uint8Array(Buffer.from(clean, 'hex'))
}

function resolveSigningKey(key?: string): { signingKey: Uint8Array; ephemeral: boolean } {
  const provided = key ?? process.env.XNET_SIGNING_KEY
  if (provided) return { signingKey: hexToBytes(provided), ephemeral: false }
  return { signingKey: generateSigningKeyPair().privateKey, ephemeral: true }
}

async function resolveStorage(db?: string): Promise<NodeStorageAdapter> {
  if (db) {
    // Lazily import the better-sqlite3-backed adapter so the memory path never
    // requires a native build.
    const { createElectronSQLiteAdapter } = await import('@xnetjs/sqlite/electron')
    const adapter = await createElectronSQLiteAdapter({
      path: db,
      busyTimeout: 5000,
      foreignKeys: true,
      walMode: true
    })
    return new SQLiteNodeStorageAdapter(adapter)
  }
  const { createMemorySQLiteAdapter } = await import('@xnetjs/sqlite/memory')
  const adapter = await createMemorySQLiteAdapter()
  return new SQLiteNodeStorageAdapter(adapter)
}

/** Build a runtime client for the CLI (local-only: no network, no plugins). */
export async function buildDataClient(options: DataClientOptions = {}): Promise<XNetClient> {
  const { signingKey } = resolveSigningKey(options.key)
  const authorDID = createDID(getSigningPublicKeyFromPrivate(signingKey)) as DID
  const nodeStorage = await resolveStorage(options.db)
  return createXNetClient({ nodeStorage, authorDID, signingKey })
}

/** Create a Note node. Returns the persisted node state. */
export async function runCreateNote(
  client: XNetClient,
  input: { title: string; body?: string }
): Promise<NodeState> {
  return client.mutate.create(NoteSchema, { title: input.title, body: input.body ?? '' })
}

/** List all Note nodes. */
export async function runListNotes(client: XNetClient): Promise<NodeState[]> {
  return client.fetch(NoteSchema)
}

function parseScope(opts: { space?: string; schema?: string[]; node?: string[] }): BundleScope {
  if (opts.space) return { kind: 'space', spaceId: opts.space }
  if (opts.schema?.length) return { kind: 'schemas', schemaIds: opts.schema }
  if (opts.node?.length) return { kind: 'nodes', nodeIds: opts.node }
  return { kind: 'full' }
}

function printVerifyReport(report: BundleVerifyReport): void {
  const m = report.manifest
  if (m) {
    console.log(`  format:   ${m.formatVersion} (change protocol v${m.protocolVersion.change})`)
    console.log(`  owner:    ${m.ownerDid}`)
    console.log(`  scope:    ${JSON.stringify(m.scope)}`)
    console.log(
      `  contents: ${m.counts.changes} changes, ${m.counts.blobs} blobs, ${m.counts.yjsDocs} yjs docs`
    )
    if (m.prerequisites) {
      console.log(
        `  requires: base bundle through lamport ${m.prerequisites.lamport} (incremental)`
      )
    }
  }
  for (const issue of report.issues) {
    const paint = issue.severity === 'error' ? chalk.red : chalk.yellow
    console.log(paint(`  ${issue.severity}: [${issue.code}] ${issue.detail}`))
  }
  console.log(report.ok ? chalk.green('✓ bundle verifies clean') : chalk.red('✗ bundle failed verification'))
}

export function registerDataCommand(program: Command): void {
  const data = program.command('data').description('Read and write live nodes (runtime client)')

  data
    .command('add')
    .description('Create a Note node')
    .requiredOption('--title <title>', 'Note title')
    .option('--body <body>', 'Note body', '')
    .option('--db <path>', 'SQLite file path (default: in-memory)')
    .option('--key <hex>', 'Ed25519 signing key (hex); falls back to $XNET_SIGNING_KEY')
    .action(async (opts: { title: string; body?: string; db?: string; key?: string }) => {
      const client = await buildDataClient({ db: opts.db, key: opts.key })
      try {
        const node = await runCreateNote(client, { title: opts.title, body: opts.body })
        console.log(chalk.green(`✓ created ${node.id}`))
        console.log(chalk.dim(`  author: ${client.authorDID}`))
      } finally {
        await client.destroy()
      }
    })

  data
    .command('list')
    .description('List Note nodes')
    .option('--db <path>', 'SQLite file path (default: in-memory)')
    .option('--key <hex>', 'Ed25519 signing key (hex); falls back to $XNET_SIGNING_KEY')
    .action(async (opts: { db?: string; key?: string }) => {
      const client = await buildDataClient({ db: opts.db, key: opts.key })
      try {
        const notes = await runListNotes(client)
        if (notes.length === 0) {
          console.log(chalk.dim('(no notes)'))
          return
        }
        for (const note of notes) {
          const title = String(note.properties.title ?? '')
          console.log(`${chalk.cyan(note.id)}  ${title}`)
        }
      } finally {
        await client.destroy()
      }
    })

  data
    .command('export')
    .description('Export the change log as an .xnetpack bundle directory (exploration 0344)')
    .requiredOption('--out <dir>', 'Bundle output directory')
    .option('--db <path>', 'SQLite file path (default: in-memory)')
    .option('--key <hex>', 'Ed25519 signing key (hex); falls back to $XNET_SIGNING_KEY')
    .option('--space <id>', 'Export one space (the space node plus its members)')
    .option('--schema <iri...>', 'Export nodes of the given schema IRI(s)')
    .option('--node <id...>', 'Export the given node id(s)')
    .option('--since-lamport <n>', 'Incremental: export changes after this lamport time')
    .action(
      async (opts: {
        out: string
        db?: string
        key?: string
        space?: string
        schema?: string[]
        node?: string[]
        sinceLamport?: string
      }) => {
        const { signingKey, ephemeral } = resolveSigningKey(opts.key)
        if (ephemeral) {
          console.log(
            chalk.yellow(
              '⚠ no signing key provided — manifest will be signed by an ephemeral identity'
            )
          )
        }
        // Build the client with the SAME resolved key so the manifest
        // signature matches the client's authorDID even when ephemeral.
        const client = await buildDataClient({
          db: opts.db,
          key: Buffer.from(signingKey).toString('hex')
        })
        try {
          const scope = parseScope(opts)
          const since = opts.sinceLamport
            ? { lamport: Number(opts.sinceLamport), heads: [], changeCount: 0 }
            : undefined
          const manifest = await writeBundle(client.store, scope, new FsBundleSink(opts.out), {
            ownerDid: client.authorDID,
            manifestSigner: (bytes) => sign(bytes, signingKey),
            since
          })
          console.log(chalk.green(`✓ exported ${manifest.counts.changes} changes to ${opts.out}`))
          console.log(chalk.dim(`  owner: ${manifest.ownerDid}`))
          console.log(chalk.dim(`  frontier lamport: ${manifest.frontier.lamport}`))
        } finally {
          await client.destroy()
        }
      }
    )

  data
    .command('import')
    .description('Verify and import an .xnetpack bundle directory')
    .requiredOption('--in <dir>', 'Bundle directory to import')
    .option('--db <path>', 'SQLite file path (default: in-memory)')
    .option('--key <hex>', 'Ed25519 signing key (hex); falls back to $XNET_SIGNING_KEY')
    .option('--dry-run', 'Verify and report only — write nothing')
    .option('--allow-foreign-owner', "Import a bundle owned by another identity's DID")
    .option('--allow-unsigned', 'Import a bundle whose manifest is unsigned')
    .action(
      async (opts: {
        in: string
        db?: string
        key?: string
        dryRun?: boolean
        allowForeignOwner?: boolean
        allowUnsigned?: boolean
      }) => {
        const source = new FsBundleSource(opts.in)
        if (opts.dryRun) {
          const report = await verifyBundle(source)
          printVerifyReport(report)
          if (!report.ok) process.exitCode = 1
          return
        }
        const client = await buildDataClient({ db: opts.db, key: opts.key })
        try {
          const result = await applyBundle(client.store, source, {
            importerDid: client.authorDID,
            allowForeignOwner: opts.allowForeignOwner,
            allowUnsigned: opts.allowUnsigned
          })
          console.log(
            chalk.green(
              `✓ applied ${result.applied} change(s), ${result.duplicates} duplicate(s) skipped`
            )
          )
          if (result.quarantined.length > 0) {
            console.log(chalk.yellow(`⚠ ${result.quarantined.length} record(s) quarantined:`))
            for (const q of result.quarantined.slice(0, 20)) {
              console.log(chalk.yellow(`  [${q.kind}] ${q.subject}: ${q.reason}`))
            }
          }
        } finally {
          await client.destroy()
        }
      }
    )

  data
    .command('snapshot')
    .description("Write a defragmented SQLite snapshot of the database (VACUUM INTO — Tier 2:\nmaterialized state for any SQLite tool; use 'export' for the lossless bundle)")
    .requiredOption('--db <path>', 'SQLite file path to snapshot')
    .requiredOption('--sqlite <out>', 'Output .sqlite file path')
    .action(async (opts: { db: string; sqlite: string }) => {
      const { createElectronSQLiteAdapter } = await import('@xnetjs/sqlite/electron')
      const adapter = await createElectronSQLiteAdapter({
        path: opts.db,
        busyTimeout: 5000,
        foreignKeys: true,
        walMode: true
      })
      try {
        await adapter.exec(`VACUUM INTO '${opts.sqlite.replace(/'/g, "''")}'`)
        console.log(chalk.green(`✓ snapshot written to ${opts.sqlite}`))
        console.log(
          chalk.dim(
            '  note: a snapshot is materialized state (readable by any SQLite tool); it is not\n' +
              '  a signed bundle — use `xnet data export` for the lossless, verifiable artifact'
          )
        )
      } finally {
        await adapter.close()
      }
    })
}
