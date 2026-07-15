/**
 * SandboxedPluginHost (exploration 0331).
 *
 * Activates a workspace plugin FROM ITS SOURCE NODE: build the module graph,
 * run the install gates (manifest validation, capability consent, trust from
 * provenance, content-hash pinning), mount the opaque-origin frame, and
 * register the manifest's data-declared contributions into the SAME
 * `ContributionRegistry` bundled plugins use — with every handler proxied
 * over the frame RPC. Composition is untouched (registry ids); isolation is
 * total (the host realm never sees plugin code).
 *
 * Generalizes `IframeWidgetHost` (dashboard) from one widget to the full
 * sandbox-eligible contribution set: views, widgets, commands, slash
 * commands, and agent tools. Deep editor extensions and shell slots stay
 * compiled-in — 0327's "no frame replacement" non-goal, drawn as a line here.
 */

import type { AgentToolContribution } from '../agent-tools'
import type { ContributionRegistry } from '../contributions'
import type { ModuleCapabilities } from '../feature-module'
import type { PluginFrameToHostMessage, PluginHostToFrameMessage } from './protocol'
import type { PluginSourceNode, WorkspacePluginManifestData } from '../schemas/plugin-source'
import type { Disposable, PluginPermissions } from '../types'
import type { PluginBuildInput, PluginModuleGraph } from './builder'
import type { PluginFrameSession, PluginFeedbackEntry } from './session'
import type { WorkspacePluginStore } from './store-rpc'
import type { ComponentType } from 'react'
import { evaluateInstallConsent, type ConsentDecision } from '../ecosystem/consent'
import {
  deriveTrustTier,
  type InstallProvenance,
  type PluginTrustTier
} from '../ecosystem/provenance-trust'
import { buildPluginModuleGraph } from './builder'
import { buildPluginFrameSrcdoc } from './frame'
import { computePluginSourceHash } from './hash'
import { createPluginFrameSession } from './session'
import { createPluginStoreRpc } from './store-rpc'

// ─── Types ─────────────────────────────────────────────────────────────────

export class WorkspacePluginError extends Error {
  constructor(
    message: string,
    public readonly code:
      | 'invalid-manifest'
      | 'build-failed'
      | 'consent-declined'
      | 'hash-drift'
      | 'frame-failed'
  ) {
    super(message)
    this.name = 'WorkspacePluginError'
  }
}

/** The frame transport the app supplies (tests supply an in-process fake). */
export interface PluginFrameTransport {
  /**
   * Mount a sandbox frame with the given srcdoc. `onMessage` receives frame →
   * host messages; the returned `send` posts host → frame messages over the
   * connected MessagePort. `dispose` tears the frame down.
   */
  mountFrame(
    srcdoc: string,
    onMessage: (message: PluginFrameToHostMessage) => void
  ): {
    send: (message: PluginHostToFrameMessage) => void
    dispose: () => void
  }
}

export interface WorkspacePluginHostDeps {
  contributions: ContributionRegistry
  store: WorkspacePluginStore
  transport: PluginFrameTransport
  /** Where this source came from — derives its trust tier. */
  provenance: InstallProvenance
  /**
   * Capability consent. Called when provenance requires a prompt and the
   * manifest requests capabilities. Return false to decline activation.
   */
  onConsent?: (decision: ConsentDecision) => boolean | Promise<boolean>
  /**
   * Persist the pinned content hash back onto the source node after consent.
   * Absent → activation still pins in-memory but nothing is persisted.
   */
  persistPinnedHash?: (sourceNodeId: string, hash: string) => void | Promise<void>
  /**
   * Build a React component for a sandboxed view/widget contribution. The
   * web app returns a component that render-loops `session.renderView` through
   * the SafeNode allowlist renderer. Required when the manifest declares
   * views or widgets.
   */
  createViewComponent?: (view: {
    pluginId: string
    viewType: string
    session: PluginFrameSession
  }) => ComponentType<never>
  /** Notified when the running plugin crashes and is auto-disabled. */
  onAutoDisable?: (info: { pluginId: string; error: string; lastGoodHash: string }) => void
  /** Builder inputs the host forwards (transpiler, vendor modules). */
  build?: Pick<PluginBuildInput, 'transpile' | 'vendorModules' | 'pinnedSpecifiers'>
  /**
   * `enforce-pin` (default) — a pinned source whose content drifted refuses to
   * activate until diff-and-consent re-pins (0327-E). `follow-source` — dev
   * preview/hot-reload mode: activate whatever the source currently is,
   * without pinning.
   */
  hashPolicy?: 'enforce-pin' | 'follow-source'
}

export type WorkspacePluginStatus = 'active' | 'disabled'

export interface WorkspacePluginHandle {
  pluginId: string
  sourceNodeId: string
  trustTier: PluginTrustTier
  /** The content hash this activation is pinned at. */
  contentHash: string
  readonly status: WorkspacePluginStatus
  session: PluginFrameSession
  /** Drain buffered console/crash/store-denial feedback (the agent channel). */
  drainFeedback(): PluginFeedbackEntry[]
  /** Deactivate: unregister every contribution and tear the frame down. */
  dispose(): void
}

// ─── Manifest validation (data form) ───────────────────────────────────────

const ID_RE = /^[a-z][a-z0-9]*(\.[a-z][a-z0-9-]*)+$/i

/** Validate the pure-data manifest a PluginSource declares. */
export function validateWorkspaceManifest(
  manifest: WorkspacePluginManifestData | undefined
): asserts manifest is WorkspacePluginManifestData {
  const issues: string[] = []
  if (!manifest || typeof manifest !== 'object') {
    throw new WorkspacePluginError('PluginSource has no manifest', 'invalid-manifest')
  }
  if (typeof manifest.id !== 'string' || !ID_RE.test(manifest.id)) {
    issues.push('manifest.id must be reverse-domain (e.g. com.example.my-plugin)')
  }
  if (typeof manifest.name !== 'string' || !manifest.name) {
    issues.push('manifest.name is required')
  }
  if (typeof manifest.version !== 'string' || !/^\d+\.\d+\.\d+/.test(manifest.version)) {
    issues.push('manifest.version must be semver')
  }
  for (const key of ['views', 'commands', 'slashCommands', 'widgets', 'agentTools'] as const) {
    const list = manifest.contributes?.[key]
    if (list !== undefined && !Array.isArray(list)) {
      issues.push(`contributes.${key} must be an array`)
    }
  }
  if (issues.length > 0) {
    throw new WorkspacePluginError(
      `Invalid workspace-plugin manifest: ${issues.join('; ')}`,
      'invalid-manifest'
    )
  }
}

/** Convert declared `PluginPermissions` into the consent layer's capability shape. */
export function permissionsToCapabilities(
  permissions: PluginPermissions | undefined
): ModuleCapabilities | undefined {
  if (!permissions) return undefined
  const caps: ModuleCapabilities = {}
  const write = permissions.schemas?.write
  if (write) caps.schemaWrite = write === '*' ? ['*'] : [...(write as readonly string[])]
  const read = permissions.schemas?.read
  if (read) caps.schemaRead = read === '*' ? ['*'] : [...(read as readonly string[])]
  const network = permissions.capabilities?.network
  if (Array.isArray(network)) caps.network = [...network]
  return caps
}

// ─── Activation ────────────────────────────────────────────────────────────

/**
 * Build (only when needed by the caller) — exposed so `plugin_build` and the
 * hot reloader share the exact graph the host activates.
 */
export async function buildWorkspacePlugin(
  source: PluginSourceNode,
  build?: WorkspacePluginHostDeps['build']
): Promise<PluginModuleGraph> {
  return buildPluginModuleGraph({
    files: source.files ?? {},
    entry: source.entry ?? 'index.ts',
    transpile: build?.transpile,
    vendorModules: build?.vendorModules,
    pinnedSpecifiers: build?.pinnedSpecifiers
  })
}

/**
 * Activate a workspace plugin from its source node. Runs the gate ladder:
 * manifest validation → build → hash pin/drift check → consent → trust tier →
 * frame mount → contribution registration. Throws {@link WorkspacePluginError}
 * when a gate refuses.
 */
export async function activateWorkspacePlugin(
  source: PluginSourceNode,
  deps: WorkspacePluginHostDeps
): Promise<WorkspacePluginHandle> {
  const manifest = source.manifest
  validateWorkspaceManifest(manifest)

  // 1. Build. A plugin that does not build never reaches consent.
  const graph = await buildWorkspacePlugin(source, deps.build)
  if (!graph.ok) {
    const details = graph.diagnostics
      .filter((d) => d.severity === 'error')
      .map((d) => (d.file ? `${d.file}: ${d.message}` : d.message))
      .join('; ')
    throw new WorkspacePluginError(`Build failed: ${details}`, 'build-failed')
  }

  // 2. Content hash + drift gate (0327-E). A pinned source whose current
  // content differs must go through diff-and-consent, not silent activation.
  const contentHash = await computePluginSourceHash({
    files: source.files,
    entry: source.entry,
    manifest
  })
  const hashPolicy = deps.hashPolicy ?? 'enforce-pin'
  if (
    hashPolicy === 'enforce-pin' &&
    source.publishedHash &&
    source.publishedHash !== contentHash
  ) {
    throw new WorkspacePluginError(
      `Source has drifted from its pinned hash (pinned ${source.publishedHash.slice(0, 12)}…, ` +
        `current ${contentHash.slice(0, 12)}…) — review the diff and re-consent to update`,
      'hash-drift'
    )
  }

  // 3. Capability consent, driven by provenance (synced/ai-generated always
  // re-prompt — a synced copy is inert until its receiver consents).
  const caps = permissionsToCapabilities(manifest.permissions)
  const decision = evaluateInstallConsent(deps.provenance, caps)
  if (decision.needsPrompt) {
    const granted = deps.onConsent ? await deps.onConsent(decision) : false
    if (!granted) {
      throw new WorkspacePluginError(
        `Workspace plugin '${manifest.id}' declined at capability consent`,
        'consent-declined'
      )
    }
  }
  const trustTier = deriveTrustTier(deps.provenance)

  // 4. Pin the hash (first activation) — update consent later diffs against it.
  if (hashPolicy === 'enforce-pin' && !source.publishedHash && deps.persistPinnedHash) {
    await deps.persistPinnedHash(source.id, contentHash)
  }

  // 5. Mount the frame and connect the session.
  const storeRpc = createPluginStoreRpc({
    store: deps.store,
    permissions: manifest.permissions,
    pluginId: manifest.id
  })

  let status: WorkspacePluginStatus = 'active'
  const disposables: Disposable[] = []
  let frame: ReturnType<PluginFrameTransport['mountFrame']> | null = null
  let session: PluginFrameSession | null = null

  const disposeContributions = (): void => {
    for (const d of disposables.splice(0, disposables.length)) {
      try {
        d.dispose()
      } catch (err) {
        console.error(`[workspace-plugin ${manifest.id}] dispose error:`, err)
      }
    }
  }

  const dispose = (): void => {
    if (status === 'disabled' && disposables.length === 0) return
    status = 'disabled'
    disposeContributions()
    session?.dispose()
    frame?.dispose()
  }

  session = createPluginFrameSession({
    pluginId: manifest.id,
    graph: {
      entry: graph.entry,
      modules: Object.values(graph.modules),
      vendors: await resolveVendorSources(deps.build?.vendorModules)
    },
    storeRpc,
    sendToFrame: (message) => frame?.send(message),
    onCrash: (error) => {
      // The 0190 remediation rule: crash → auto-disable, keep the last good
      // hash pinned so recovery is a re-activation, not a rebuild.
      if (status !== 'active') return
      dispose()
      deps.onAutoDisable?.({ pluginId: manifest.id, error, lastGoodHash: contentHash })
    }
  })

  const srcdoc = buildPluginFrameSrcdoc(manifest.permissions)
  try {
    frame = deps.transport.mountFrame(srcdoc, (message) => session?.handleFrameMessage(message))
  } catch (err) {
    session.dispose()
    throw new WorkspacePluginError(
      `Frame mount failed: ${err instanceof Error ? err.message : String(err)}`,
      'frame-failed'
    )
  }

  // 6. Register data-declared contributions with proxied handlers.
  const c = manifest.contributes
  const registry = deps.contributions

  for (const command of c?.commands ?? []) {
    disposables.push(
      registry.commands.register({
        id: command.id,
        name: command.name,
        description: command.description,
        keybinding: command.keybinding,
        keywords: command.keywords,
        icon: command.icon,
        execute: async () => {
          await session?.invoke('command', command.id)
        }
      })
    )
  }

  for (const slash of c?.slashCommands ?? []) {
    disposables.push(
      registry.slashCommands.register({
        id: slash.id,
        name: slash.name,
        description: slash.description,
        aliases: slash.aliases,
        icon: slash.icon,
        execute: () => {
          void session?.invoke('slashCommand', slash.id)
        }
      })
    )
  }

  for (const tool of c?.agentTools ?? []) {
    disposables.push(
      registry.agentTools.register({
        id: `${manifest.id}.${tool.name}`,
        name: tool.name,
        description: tool.description,
        risk: 'high',
        inputSchema: tool.inputSchema as AgentToolContribution['inputSchema'],
        invoke: async (args) => session?.invoke('agentTool', tool.name, args)
      })
    )
  }

  const needsViewFactory = (c?.views?.length ?? 0) + (c?.widgets?.length ?? 0) > 0
  if (needsViewFactory && !deps.createViewComponent) {
    dispose()
    throw new WorkspacePluginError(
      `Workspace plugin '${manifest.id}' contributes views but the host supplied no ` +
        'createViewComponent factory',
      'frame-failed'
    )
  }

  for (const view of c?.views ?? []) {
    const component = deps.createViewComponent?.({
      pluginId: manifest.id,
      viewType: view.type,
      session
    }) as ComponentType<{ nodeId: string; schemaId: string }>
    disposables.push(
      registry.views.register({
        type: view.type,
        name: view.name,
        icon: view.icon,
        supportedSchemas: view.supportedSchemas,
        component
      })
    )
  }

  for (const widget of c?.widgets ?? []) {
    const component = deps.createViewComponent?.({
      pluginId: manifest.id,
      viewType: widget.type,
      session
    }) as ComponentType<never>
    disposables.push(
      registry.widgets.register({
        type: widget.type,
        name: widget.name,
        description: widget.description,
        defaultSize: widget.defaultSize,
        getStubConfig: () => ({ config: {} }),
        component: component as never
      })
    )
  }

  return {
    pluginId: manifest.id,
    sourceNodeId: source.id,
    trustTier,
    contentHash,
    get status() {
      return status
    },
    session,
    drainFeedback: () => session?.drainFeedback() ?? [],
    dispose
  }
}

/** Materialize lazy vendor module sources for the frame payload. */
async function resolveVendorSources(
  vendors: PluginBuildInput['vendorModules']
): Promise<Record<string, string>> {
  if (!vendors) return {}
  const out: Record<string, string> = {}
  for (const [specifier, load] of Object.entries(vendors)) {
    out[specifier] = await load()
  }
  return out
}
