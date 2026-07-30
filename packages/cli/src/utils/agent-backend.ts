/**
 * The agent backend ladder (exploration 0393).
 *
 * A coding agent (Claude Code / Codex) reaches xNet through the same verbs
 * whether or not the desktop app is running. This resolver picks the backend:
 *
 *   1. **remote** — the app's local API (`:31415`), when an `--api-url`/`$XNET_API_URL`
 *      is set or a health probe answers. Writes are signed by the app identity.
 *   2. **local**  — a standalone SQLite store (`--db`/`$XNET_DB`/discovered
 *      Electron userData path), signed by a resolved key or an enrolled agent
 *      passport. This is what makes the agent verbs work app-closed and for
 *      web-only users.
 *
 * `xnet mcp serve` already had both halves (`createRemoteAgentBackend` +
 * `createLocalAgentBackend`); this promotes the same ladder to the agent verbs
 * (`checkout/status/commit/search/query/db/daemon`) so they no longer hard-require
 * a running app.
 *
 * Signing safety: reads tolerate an ephemeral key (identity is irrelevant to a
 * read), but a write against a local store refuses to run under a silently
 * generated ephemeral identity — the caller must provide `--key`,
 * `$XNET_SIGNING_KEY`, or `--agent <passport>`, so every persisted change is
 * attributable.
 */

import { access } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { generateSigningKeyPair } from '@xnetjs/crypto'
import { createLocalAgentBackend } from './agent-local.js'
import { hexToBytes, loadAgentPassportFile } from './agent-passport-file.js'
import { createRemoteAgentBackend, type AgentBackend } from './agent-remote.js'

export type BackendMode = 'remote' | 'local'

export type ResolvedAgentBackend = AgentBackend & {
  mode: BackendMode
  /** Human-readable one-liner for logs/diagnostics, e.g. "local store (data.db)". */
  description: string
  /** DID the writes will be signed under, when known (local mode). */
  authorDID?: string
  /** Release any held resources (closes the SQLite client in local mode). */
  dispose(): Promise<void>
}

export type BackendLadderOptions = {
  /** Explicit local API URL; also honoured from `$XNET_API_URL`. */
  apiUrl?: string
  /** Bearer token for the local API (`$XNET_API_TOKEN`). */
  token?: string
  /** Standalone SQLite path; also honoured from `$XNET_DB`. */
  db?: string
  /** Enrolled agent passport name (exploration 0337) — implies local + agent signing. */
  agent?: string
  /** Ed25519 signing key (hex) for the local store; also `$XNET_SIGNING_KEY`. */
  key?: string
  /**
   * Whether the caller will write. When true, the local path refuses a silent
   * ephemeral key so every change is attributable.
   */
  forWrites?: boolean
}

const DEFAULT_API_URL = 'http://127.0.0.1:31415'

/**
 * Resolve a backend for the agent verbs. Prefers an explicitly requested lane
 * (`--db`/`--agent` → local, `--api-url` → remote), otherwise probes the local
 * API and falls back to a discovered local store.
 */
export async function resolveAgentBackend(
  options: BackendLadderOptions = {}
): Promise<ResolvedAgentBackend> {
  const wantsLocal = Boolean(options.db ?? options.agent ?? process.env.XNET_DB)

  if (!wantsLocal) {
    // Remote first: probe the app's local API and use it when it answers. An
    // unreachable remote (even an explicitly configured one) falls through to a
    // local store rather than erroring — same data, the app just isn't serving.
    const baseUrl = (options.apiUrl ?? process.env.XNET_API_URL ?? DEFAULT_API_URL).replace(
      /\/$/,
      ''
    )
    if (await probeRemote(baseUrl)) {
      const backend = await createRemoteAgentBackend({
        ...(options.apiUrl ? { apiUrl: options.apiUrl } : {}),
        ...(options.token ? { token: options.token } : {})
      })
      return {
        ...backend,
        mode: 'remote',
        description: `xNet app local API (${baseUrl})`,
        dispose: async () => {}
      }
    }
  }

  // Local store: resolve the db path and a signing identity.
  const dbPath = options.db ?? process.env.XNET_DB ?? (await discoverAppDb())
  if (!dbPath) {
    throw new BackendUnavailableError(
      'No xNet backend found. Start the desktop app, or point the CLI at a local ' +
        'store with --db <path> (or $XNET_DB). Run `xnet doctor --agent-access` to diagnose.'
    )
  }

  const identity = await resolveSigningIdentity(options)
  if (identity.ephemeral && options.forWrites) {
    throw new BackendUnavailableError(
      'Refusing to write under an ephemeral identity. Provide a signing key with ' +
        '--key <hex> or $XNET_SIGNING_KEY, or serve as an enrolled agent with ' +
        '--agent <name> (see `xnet agent enroll`).'
    )
  }

  const backend = await createLocalAgentBackend({ db: dbPath, agentKey: identity.signingKey })
  const label = identity.source === 'passport' ? `agent ${options.agent}` : identity.source
  return {
    store: backend.store,
    schemas: backend.schemas,
    mode: 'local',
    description: `local store (${dbPath}) signed by ${label}`,
    authorDID: backend.agentDID,
    dispose: async () => {
      await backend.client.destroy()
    }
  }
}

/** Raised when no backend can be resolved (app closed, no db discovered). */
export class BackendUnavailableError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'BackendUnavailableError'
  }
}

type SigningIdentity = {
  signingKey: Uint8Array
  ephemeral: boolean
  source: 'passport' | '--key' | '$XNET_SIGNING_KEY' | 'ephemeral'
}

async function resolveSigningIdentity(options: BackendLadderOptions): Promise<SigningIdentity> {
  if (options.agent) {
    const passport = await loadAgentPassportFile(options.agent)
    if (!passport) {
      throw new BackendUnavailableError(
        `No passport for agent "${options.agent}" (run: xnet agent enroll ${options.agent} --space <id>)`
      )
    }
    if (passport.expiresAt <= Date.now()) {
      throw new BackendUnavailableError(
        `Passport for "${options.agent}" expired ${new Date(passport.expiresAt).toISOString()} — re-enroll to rotate`
      )
    }
    return { signingKey: hexToBytes(passport.agentKeyHex), ephemeral: false, source: 'passport' }
  }
  if (options.key) {
    return { signingKey: hexToBytes(options.key), ephemeral: false, source: '--key' }
  }
  if (process.env.XNET_SIGNING_KEY) {
    return {
      signingKey: hexToBytes(process.env.XNET_SIGNING_KEY),
      ephemeral: false,
      source: '$XNET_SIGNING_KEY'
    }
  }
  return { signingKey: generateSigningKeyPair().privateKey, ephemeral: true, source: 'ephemeral' }
}

/** Health-probe the app's local API; false on any error (never throws). */
export async function probeRemote(baseUrl: string): Promise<boolean> {
  try {
    const res = await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(1200) })
    return res.ok
  } catch {
    return false
  }
}

/**
 * Discover the desktop app's SQLite store from the platform userData path.
 * Returns the path only when the file actually exists — we never guess a path
 * that could be a stale copy; a missing store yields `null` so the caller fails
 * with a hint instead. `$XNET_PROFILE` selects a non-default multi-instance
 * profile, matching Electron's `xnet-desktop-<profile>` userData convention.
 */
export async function discoverAppDb(): Promise<string | null> {
  for (const candidate of appDbCandidates()) {
    try {
      await access(candidate)
      return candidate
    } catch {
      // Not present; try the next candidate.
    }
  }
  return null
}

function appDbCandidates(): string[] {
  const profile =
    process.env.XNET_PROFILE && process.env.XNET_PROFILE !== 'default'
      ? process.env.XNET_PROFILE
      : undefined
  const appName = profile ? `xnet-desktop-${profile}` : 'xnet-desktop'
  const bases = userDataBases(appName)
  // The utility-process node store is `xnet-data/data.db` (apps/electron main).
  return bases.map((base) => join(base, 'xnet-data', 'data.db'))
}

function userDataBases(appName: string): string[] {
  const home = homedir()
  switch (process.platform) {
    case 'darwin':
      return [join(home, 'Library', 'Application Support', appName)]
    case 'win32': {
      const appData = process.env.APPDATA ?? join(home, 'AppData', 'Roaming')
      return [join(appData, appName)]
    }
    default: {
      const configHome = process.env.XDG_CONFIG_HOME ?? join(home, '.config')
      return [join(configHome, appName)]
    }
  }
}
