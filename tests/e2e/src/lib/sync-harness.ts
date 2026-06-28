/**
 * Shared rig for the cross-client convergence matrix (exploration 0238, L2).
 *
 * Generalises the bespoke setup in `doc-sync.spec.ts` into reusable pieces:
 *
 *   - `startInProcessHub()`  — the same in-process hub the exploration calls for
 *     (`@xnetjs/hub` CLI, `--no-auth --storage memory`) on an ephemeral port.
 *   - `startWebHarness()`    — the minimal Vite harness (`harness/`) that renders
 *     one collaborative doc, now also exposing `window.__xnetSyncTestHarness`.
 *   - `openClient('web' | 'electron', …)` — a uniform `SyncClient` over either a
 *     web harness page or a real Electron app launched with `_electron.launch()`.
 *
 * Both client kinds edit the SAME neutral `Y.Text('e2e')` field on a shared doc
 * id, routed through each platform's real sync path (web runtime ⇄ hub; Electron
 * renderer ⇄ IPC ⇄ data-process BSM ⇄ hub). That makes electron↔web and
 * electron↔electron convergence an apples-to-apples assertion.
 *
 * NOTE: the Electron utility process is WS-relay only (it deliberately falls back
 * from WebRTC — see `data-service.startSync`), so the `webrtc` matrix cells are
 * best-effort: they request WebRTC and converge over the WS fallback, matching
 * the exploration's "allowed to fall back to WS, must still converge" rule.
 */
import { spawn, execSync, type ChildProcess } from 'node:child_process'
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { createServer } from 'node:net'
import { join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import {
  _electron as electron,
  type Browser,
  type ElectronApplication,
  type Page
} from '@playwright/test'

const require = createRequire(import.meta.url)
/** The `electron` package's main export is the path to the Electron binary. */
const ELECTRON_EXECUTABLE = require('electron') as string

const ROOT = new URL('../../../../', import.meta.url).pathname.replace(/\/$/, '')
const ELECTRON_APP_DIR = join(ROOT, 'apps/electron')

/**
 * Whether there's an Electron app to launch — either a built binary pointed at
 * by `XNET_ELECTRON_BINARY`, or the unpacked `electron-vite build` output. The
 * matrix/smoke specs skip Electron cells when neither exists (CI builds first).
 */
export function electronRendererBuilt(): boolean {
  return (
    Boolean(process.env.XNET_ELECTRON_BINARY) ||
    existsSync(join(ELECTRON_APP_DIR, 'out/main/index.js'))
  )
}

export type Transport = 'ws' | 'webrtc'
export type ClientKind = 'web' | 'electron'

/** The browser-context shape the harness installs (see callers below). */
interface SyncHarnessWindow {
  __xnetSyncTestHarness?: {
    acquire: (docId: string) => Promise<void>
    type: (docId: string, text: string) => Promise<void>
    read: (docId: string) => Promise<string>
    goOffline?: () => Promise<void>
    goOnline?: () => Promise<void>
  }
  __xnetIpcSyncManager?: {
    configureShareSession: (input: {
      signalingUrl: string
      transport?: 'ws' | 'webrtc' | 'auto'
    }) => Promise<void>
  }
}

/** A platform-neutral handle the matrix test drives. */
export interface SyncClient {
  kind: ClientKind
  /** Append text to the shared `Y.Text('e2e')` field. */
  type(text: string): Promise<void>
  /** Read the current text of the shared field. */
  text(): Promise<string>
  /** Drop the sync transport (offline). */
  goOffline(): Promise<void>
  /** Restore the sync transport (online); pending edits drain on reconnect. */
  goOnline(): Promise<void>
  /** Tear the client down. */
  close(): Promise<void>
}

// ─── Process helpers ─────────────────────────────────────────────────────────

function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer()
    srv.on('error', reject)
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address()
      const port = typeof addr === 'object' && addr ? addr.port : 0
      srv.close(() => resolve(port))
    })
  })
}

function spawnAndWait(
  command: string,
  args: string[],
  opts: {
    cwd: string
    env?: Record<string, string>
    readyText: string
    timeoutMs: number
    label: string
  }
): Promise<ChildProcess> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`${opts.label}: timed out waiting for "${opts.readyText}"`)),
      opts.timeoutMs
    )
    const proc = spawn(command, args, {
      cwd: opts.cwd,
      env: { ...process.env, ...opts.env },
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: true,
      detached: true
    })
    let stdout = ''
    // Strip ANSI colour codes (e.g. from Vite output) before substring-
    // matching the ready text. The pattern is built from a computed string so
    // the ESC byte is not a control char in a regex literal (no-control-regex).
    const ansiPattern = new RegExp(`${String.fromCharCode(0x1b)}\\[[0-9;]*[A-Za-z]`, 'g')
    const stripAnsi = (s: string): string => s.replace(ansiPattern, '')
    proc.stdout?.on('data', (chunk: Buffer) => {
      const text = chunk.toString()
      stdout += text
      if (process.env.E2E_DEBUG) process.stderr.write(`[${opts.label}] ${text}`)
      if (stripAnsi(stdout).includes(opts.readyText)) {
        clearTimeout(timer)
        resolve(proc)
      }
    })
    proc.stderr?.on('data', (chunk: Buffer) => {
      if (process.env.E2E_DEBUG) process.stderr.write(`[${opts.label}:err] ${chunk.toString()}`)
    })
    proc.on('error', (err) => {
      clearTimeout(timer)
      reject(err)
    })
    proc.on('exit', (code) => {
      if (code !== null && code !== 0) {
        clearTimeout(timer)
        reject(new Error(`${opts.label}: exited with code ${code}\n${stdout}`))
      }
    })
  })
}

function killTree(proc: ChildProcess): void {
  try {
    if (proc.pid) process.kill(-proc.pid, 'SIGTERM')
  } catch {
    try {
      proc.kill('SIGTERM')
    } catch {
      // already dead
    }
  }
}

function forceKillPort(port: number): void {
  try {
    execSync(`lsof -ti:${port} 2>/dev/null | xargs kill -9 2>/dev/null`, { stdio: 'ignore' })
  } catch {
    // port already clear (or no lsof, e.g. Windows) — best effort
  }
}

// ─── Hub + web harness ───────────────────────────────────────────────────────

export interface InProcessHub {
  port: number
  wsUrl: string
  httpUrl: string
  stop(): Promise<void>
}

/** Boot the shared hub (`--no-auth --storage memory`) on a free port. */
export async function startInProcessHub(): Promise<InProcessHub> {
  const port = await getFreePort()
  // The hub runs under plain Node and loads better-sqlite3 (telemetry store), so
  // the shared native binding must stay at the Node ABI. The Electron app it
  // syncs with is launched from a binary that bundles its OWN Electron-ABI copy
  // (see `launchElectronApp` + the `electron-e2e` CI job), so the two never
  // clash over one rebuilt module.
  const proc = await spawnAndWait(
    'pnpm',
    [
      '--filter',
      '@xnetjs/hub',
      'exec',
      'tsx',
      'src/cli.ts',
      '--port',
      String(port),
      '--no-auth',
      '--storage',
      'memory'
    ],
    { cwd: ROOT, readyText: `listening on port ${port}`, label: 'hub', timeoutMs: 30_000 }
  )
  return {
    port,
    wsUrl: `ws://localhost:${port}`,
    httpUrl: `http://localhost:${port}`,
    async stop() {
      killTree(proc)
      await sleep(200)
      forceKillPort(port)
    }
  }
}

export interface WebHarness {
  baseUrl: string
  port: number
  stop(): Promise<void>
}

/** Boot the minimal Vite collaborative-doc harness on a free port. */
export async function startWebHarness(): Promise<WebHarness> {
  const port = await getFreePort()
  const proc = await spawnAndWait('pnpm', ['exec', 'vite', '--config', 'harness/vite.config.ts'], {
    cwd: `${ROOT}/tests/e2e`,
    env: { HARNESS_PORT: String(port) },
    readyText: `localhost:${port}`,
    label: 'harness',
    timeoutMs: 60_000
  })
  return {
    baseUrl: `http://localhost:${port}`,
    port,
    async stop() {
      killTree(proc)
      await sleep(200)
      forceKillPort(port)
    }
  }
}

// ─── Clients ─────────────────────────────────────────────────────────────────

export interface OpenClientOptions {
  /** Playwright browser (required for web clients). */
  browser?: Browser
  /** Web harness base URL (required for web clients). */
  webBaseUrl?: string
  /** Hub WebSocket URL all clients dial. */
  hubWs: string
  /** Stable per-client integer (web identity seed) / profile suffix. */
  user: number
  /** Shared document id both clients edit. */
  docId: string
  /** Requested transport (electron always falls back to WS — see file header). */
  transport: Transport
}

/** Open a web or Electron client wired to the same doc + hub. */
export async function openClient(kind: ClientKind, opts: OpenClientOptions): Promise<SyncClient> {
  return kind === 'web' ? openWebClient(opts) : openElectronClient(opts)
}

async function openWebClient(opts: OpenClientOptions): Promise<SyncClient> {
  if (!opts.browser || !opts.webBaseUrl) {
    throw new Error('openWebClient requires { browser, webBaseUrl }')
  }
  const context = await opts.browser.newContext()
  const page = await context.newPage()
  if (process.env.E2E_DEBUG) {
    page.on('console', (msg) =>
      process.stderr.write(`[web${opts.user}] ${msg.type()}: ${msg.text()}\n`)
    )
  }
  const url =
    `${opts.webBaseUrl}?user=${opts.user}&doc=${encodeURIComponent(opts.docId)}` +
    `&hub=${encodeURIComponent(opts.hubWs)}&transport=${opts.transport}`
  await page.goto(url)
  await page.waitForFunction(
    () => Boolean((window as unknown as SyncHarnessWindow).__xnetSyncTestHarness),
    undefined,
    { timeout: 60_000 }
  )
  await page.evaluate(
    (id) => (window as unknown as SyncHarnessWindow).__xnetSyncTestHarness!.acquire(id),
    opts.docId
  )
  return {
    kind: 'web',
    type: (text) =>
      page.evaluate(
        ({ id, t }) => (window as unknown as SyncHarnessWindow).__xnetSyncTestHarness!.type(id, t),
        { id: opts.docId, t: text }
      ),
    text: () =>
      page.evaluate(
        (id) => (window as unknown as SyncHarnessWindow).__xnetSyncTestHarness!.read(id),
        opts.docId
      ),
    // The web client's socket lives in the renderer, so the Playwright network
    // layer is the cleanest offline switch.
    goOffline: () => context.setOffline(true),
    goOnline: () => context.setOffline(false),
    close: () => context.close()
  }
}

export interface LaunchElectronOptions {
  /** Isolates identity + data dir + single-instance lock (XNET_PROFILE). */
  profile?: string
  /** Extra env layered over the test defaults. */
  env?: Record<string, string>
  /** Launch a packaged binary at this path instead of the unpacked app dir. */
  executablePath?: string
  /** Extra process args (e.g. a `xnet://…` deep link). */
  extraArgs?: string[]
}

/**
 * Launch the Electron app and return the app + its first window. Used by L2
 * (matrix), L3 (`electron-smoke`) and L4 (`packaged-smoke`).
 *
 * Resolution of WHAT to launch, in priority order:
 *   1. `opts.executablePath` — an explicit built binary (L4 packaged smoke).
 *   2. `XNET_ELECTRON_BINARY` env — a built binary (the `electron-e2e` CI job
 *      points this at the `electron-builder --dir` output, whose bundled native
 *      modules are Electron-ABI, so the Node hub's Node-ABI copy never clashes).
 *   3. the unpacked app dir via the `electron` package — local dev, where the
 *      shared native modules have been rebuilt for Electron (`deps:electron`).
 */
export async function launchElectronApp(
  opts: LaunchElectronOptions = {}
): Promise<{ app: ElectronApplication; window: Page }> {
  const binary = opts.executablePath ?? process.env.XNET_ELECTRON_BINARY
  // Headless Linux CI runs Electron under xvfb as root, where the chrome-sandbox
  // isn't setuid — `--no-sandbox` (set by the electron-e2e job) is required.
  const sandboxArgs = process.env.XNET_ELECTRON_NO_SANDBOX === '1' ? ['--no-sandbox'] : []
  const extra = [...(opts.extraArgs ?? []), ...sandboxArgs]
  const app = await electron.launch({
    executablePath: binary ?? ELECTRON_EXECUTABLE,
    // For the unpacked app, the first arg is the app dir Electron resolves
    // `main` from; a built binary IS the app, so pass only extra args.
    args: binary ? extra : [ELECTRON_APP_DIR, ...extra],
    env: {
      ...process.env,
      // Force the prod renderer (loadFile of the built bundle) + skip devtools.
      NODE_ENV: 'production',
      XNET_TEST_BYPASS: 'true',
      ...(opts.profile ? { XNET_PROFILE: opts.profile } : {}),
      ...opts.env
    }
  })
  const window = await app.firstWindow()
  return { app, window }
}

interface ElectronSyncClient extends SyncClient {
  app: ElectronApplication
  window: Page
}

async function openElectronClient(opts: OpenClientOptions): Promise<ElectronSyncClient> {
  const { app, window: win } = await launchElectronApp({
    // Distinct profile → distinct identity + data dir + single-instance lock.
    profile: `e2e-sync-${opts.user}-${opts.docId.slice(-6)}`,
    env: { VITE_XNET_ENABLE_WEBRTC: opts.transport === 'webrtc' ? 'true' : 'false' }
  })
  if (process.env.E2E_DEBUG) {
    win.on('console', (msg) =>
      process.stderr.write(`[electron${opts.user}] ${msg.type()}: ${msg.text()}\n`)
    )
  }
  await win.waitForFunction(
    () => {
      const w = window as unknown as SyncHarnessWindow
      return Boolean(w.__xnetSyncTestHarness && w.__xnetIpcSyncManager)
    },
    undefined,
    { timeout: 90_000 }
  )
  // Repoint the running data-process at the test hub. `configureShareSession`
  // issues a reconfigure (stop+start) that overrides the boot-time default;
  // persisting to localStorage means a later reconnect dials the test hub too.
  await win.evaluate(async (hub) => {
    try {
      localStorage.setItem('xnet:hub-url', hub)
    } catch {
      /* non-persistent contexts fall back to the reconfigure below */
    }
    await (window as unknown as SyncHarnessWindow).__xnetIpcSyncManager!.configureShareSession({
      signalingUrl: hub,
      transport: 'auto'
    })
  }, opts.hubWs)
  await win.evaluate(
    (id) => (window as unknown as SyncHarnessWindow).__xnetSyncTestHarness!.acquire(id),
    opts.docId
  )
  return {
    kind: 'electron',
    app,
    window: win,
    type: (text) =>
      win.evaluate(
        ({ id, t }) => (window as unknown as SyncHarnessWindow).__xnetSyncTestHarness!.type(id, t),
        { id: opts.docId, t: text }
      ),
    text: () =>
      win.evaluate(
        (id) => (window as unknown as SyncHarnessWindow).__xnetSyncTestHarness!.read(id),
        opts.docId
      ),
    goOffline: () =>
      win.evaluate(() =>
        (window as unknown as SyncHarnessWindow).__xnetSyncTestHarness!.goOffline!()
      ),
    goOnline: () =>
      win.evaluate(() =>
        (window as unknown as SyncHarnessWindow).__xnetSyncTestHarness!.goOnline!()
      ),
    close: () => app.close()
  }
}
