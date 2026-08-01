/**
 * `xnet serve` — keep the read path warm (exploration 0415).
 *
 * Resolves the backend once, builds retrieval once, and answers `search`,
 * `recall`, `query` and `get` over a unix socket for as long as it runs. The
 * read verbs try it before falling back to their own cold process.
 *
 * The daemon is an optimisation, never a requirement: nothing listening means
 * the verbs behave exactly as they did before. What the daemon must not do is
 * answer *wrongly* — a stale build, or a process killed mid-request — so both
 * are named errors on the client side rather than an empty result set.
 */

import { createAgentRetrieval, type WorkspaceRetrieval } from '@xnetjs/plugins/node'
import { Command } from 'commander'
import {
  sessionTargetFor,
  startSessionServer,
  type SessionHandlers,
  type SessionServerHandle
} from '../utils/session-daemon.js'
import { resolveAgentBackend, type BackendLadderOptions } from '../utils/agent-backend.js'
import {
  createAgentServices,
  runDbGet,
  runQuery,
  runRecall,
  runSearch,
  type AgentCliServices
} from './agent.js'

/** Version the handshake advertises. A client on a different one refuses to talk. */
export const SESSION_CLI_VERSION = '0.0.1'

export type ServeOptions = BackendLadderOptions & {
  socket?: string
  /** Print the socket path and exit without serving (diagnostics). */
  printPath?: boolean
}

/**
 * Handlers over warm services. Every op returns the same string a cold verb
 * would print, so the client can hand it straight to stdout — one shape, not
 * two, which is what keeps the warm and cold paths from drifting.
 */
export type SessionOutput = { output: string; warnings: string[] }

export function sessionHandlers(services: AgentCliServices): SessionHandlers {
  return {
    // Each call gets its own warning sink. A module-level one would let two
    // concurrent searches hand each other's warnings back — and the daemon
    // exists precisely so an agent can fire several verbs at once.
    search: async (params): Promise<SessionOutput> => {
      const warnings: string[] = []
      const output = await runSearch(services, {
        text: String(params.text ?? ''),
        ...(params.schema ? { schema: String(params.schema) } : {}),
        ...(typeof params.limit === 'number' ? { limit: params.limit } : {}),
        ...(params.format ? { format: params.format as never } : {}),
        // Warnings travel in-band; the client re-emits them on its own stderr,
        // because a daemon writing to its stderr warns nobody.
        warn: (message) => warnings.push(message)
      })
      return { output, warnings }
    },
    recall: async (params): Promise<SessionOutput> => {
      const warnings: string[] = []
      const output = await runRecall(services, {
        text: String(params.text ?? ''),
        ...(typeof params.budget === 'number' ? { budget: params.budget } : {}),
        ...(typeof params.hops === 'number' ? { hops: params.hops } : {}),
        ...(typeof params.limit === 'number' ? { limit: params.limit } : {}),
        ...(params.format ? { format: params.format as never } : {}),
        warn: (message) => warnings.push(message)
      })
      return { output, warnings }
    },
    query: async (params): Promise<SessionOutput> => ({
      output: await runQuery(services, {
        databaseId: String(params.databaseId ?? ''),
        ...(Array.isArray(params.where) ? { where: params.where as string[] } : {}),
        ...(typeof params.limit === 'number' ? { limit: params.limit } : {}),
        ...(typeof params.offset === 'number' ? { offset: params.offset } : {}),
        ...(params.format ? { format: params.format as never } : {})
      }),
      warnings: []
    }),
    get: async (params): Promise<SessionOutput> => ({
      output: await runDbGet(services, { nodeId: String(params.nodeId ?? '') }),
      warnings: []
    })
  }
}

export type ServeHandle = SessionServerHandle & {
  /** Socket key, derived from the invocation options. */
  target: string
  /** What the resolved backend actually is, for the operator's benefit. */
  description: string
  tier: WorkspaceRetrieval['tier']
  dispose: () => Promise<void>
}

export async function startServe(options: ServeOptions): Promise<ServeHandle> {
  const backend = await resolveAgentBackend(options)
  const services = createAgentServices(backend)
  const retrieval = createAgentRetrieval({ store: backend.store, schemas: backend.schemas })
  // Keyed on the options, not `backend.description`: the client has to find
  // this socket without resolving a backend of its own.
  const target = sessionTargetFor(options)

  const handle = await startSessionServer({
    target,
    version: SESSION_CLI_VERSION,
    tier: retrieval.tier,
    handlers: sessionHandlers(services),
    ...(options.socket ? { socketPath: options.socket } : {})
  })

  return {
    ...handle,
    target,
    description: backend.description,
    tier: retrieval.tier,
    dispose: async () => {
      await handle.stop()
      await backend.dispose()
    }
  }
}

export function registerServeCommand(program: Command): void {
  program
    .command('serve')
    .description('Keep the read path warm behind a unix socket (exploration 0415)')
    .option('--api-url <url>', 'xNet local API URL (default http://127.0.0.1:31415)')
    .option('--db <path>', 'Standalone SQLite store (also $XNET_DB)')
    .option('--agent <name>', 'Enrolled agent passport')
    .option('--key <hex>', 'Ed25519 signing key for the local store')
    .option('--socket <path>', 'Override the socket path')
    .action(async (options: ServeOptions) => {
      const handle = await startServe(options)
      // stderr: stdout stays clean for anything scraping a verb's output.
      console.error(`xnet serve — ${handle.description}`)
      console.error(`socket: ${handle.socketPath}`)
      console.error(`tier:   ${handle.tier}`)
      const shutdown = (): void => {
        void handle.dispose().then(() => process.exit(0))
      }
      process.on('SIGINT', shutdown)
      process.on('SIGTERM', shutdown)
    })
}
