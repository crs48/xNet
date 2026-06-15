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
import type { NodeState, NodeStorageAdapter } from '@xnetjs/data'
import type { XNetClient } from '@xnetjs/runtime'
import type { Command } from 'commander'
import { generateSigningKeyPair, getSigningPublicKeyFromPrivate } from '@xnetjs/crypto'
import { defineSchema, SQLiteNodeStorageAdapter, text } from '@xnetjs/data'
import { createDID } from '@xnetjs/identity'
import { createXNetClient } from '@xnetjs/runtime'
import chalk from 'chalk'

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
}
