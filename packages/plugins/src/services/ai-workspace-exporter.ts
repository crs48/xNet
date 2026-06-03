/**
 * Node-only AI workspace folder exporter.
 */

import type {
  AiMutationPlan,
  AiOperation,
  AiRiskLevel,
  AiScope,
  AiSurfaceService,
  AiTargetKind
} from '../ai-surface'
import type { NodeData, NodeStoreAPI, SchemaRegistryAPI } from './local-api'
import { createHash } from 'crypto'
import { watch as watchFs, type FSWatcher } from 'fs'
import { mkdir, readFile, writeFile } from 'fs/promises'
import { dirname, join } from 'path'
import { attachAiPlanValidation, createAiOperation, createAiSurfaceService } from '../ai-surface'

// ─── Types ─────────────────────────────────────────────────────────────────

export type AiWorkspaceExportKind = 'page' | 'database' | 'canvas' | 'node'

export type AiWorkspaceExportScope = {
  nodeIds?: string[]
  schemaIds?: string[]
  limit?: number
}

export type AiWorkspaceExportOptions = {
  rootDir: string
  workspaceName?: string
  scope?: AiWorkspaceExportScope
}

export type AiWorkspaceManifestEntry = {
  path: string
  kind: AiWorkspaceExportKind
  id: string
  schemaId: string
  revision: string
  sha256: string
  exportedAt: string
}

export type AiWorkspaceExportResult = {
  rootDir: string
  files: string[]
  manifestEntries: AiWorkspaceManifestEntry[]
  exportedAt: string
}

export type AiWorkspaceExporterConfig = {
  store: NodeStoreAPI
  schemas: SchemaRegistryAPI
  aiSurface?: AiSurfaceService
  clock?: () => Date
}

export type AiWorkspaceChangedFileStatus = 'modified' | 'missing'

export type AiWorkspaceChangedFile = {
  path: string
  kind: AiWorkspaceExportKind
  id: string
  status: AiWorkspaceChangedFileStatus
  previousSha256: string
  currentSha256?: string
}

export type AiWorkspacePendingPlan = {
  path: string
  planPath: string
  plan: AiMutationPlan
  currentSha256: string
}

export type AiWorkspaceConflictKind =
  | 'missing-file'
  | 'stale-export'
  | 'invalid-json'
  | 'invalid-jsonl'
  | 'invalid-plan'
  | 'unsupported-change'
  | 'tool-error'

export type AiWorkspaceConflict = {
  kind: AiWorkspaceConflictKind
  path: string
  id?: string
  message: string
  conflictPath?: string
  detectedAt: string
}

export type AiWorkspaceReviewStatus = 'needs-review'

export type AiWorkspaceReviewAction = 'approve' | 'reject' | 'request-revision'

export type AiWorkspaceReviewEntryKind = 'pending-plan' | 'conflict'

export type AiWorkspaceReviewEntry = {
  kind: AiWorkspaceReviewEntryKind
  status: AiWorkspaceReviewStatus
  path: string
  id?: string
  title: string
  message: string
  artifactPath?: string
  planId?: string
  planPath?: string
  conflictKind?: AiWorkspaceConflictKind
  conflictPath?: string
  risk?: AiRiskLevel
  requiredScopes?: AiScope[]
  suggestedActions: AiWorkspaceReviewAction[]
  createdAt: string
}

export type AiWorkspaceReviewIndex = {
  rootDir: string
  generatedAt: string
  entries: AiWorkspaceReviewEntry[]
}

export type AiWorkspaceWatcherScanOptions = {
  rootDir: string
  actor?: string
  writePendingPlans?: boolean
  writeConflicts?: boolean
  writeReviewIndex?: boolean
}

export type AiWorkspaceWatcherScanResult = {
  rootDir: string
  scannedAt: string
  changedFiles: AiWorkspaceChangedFile[]
  pendingPlans: AiWorkspacePendingPlan[]
  conflicts: AiWorkspaceConflict[]
  review: AiWorkspaceReviewIndex
}

export type AiWorkspaceWatchHandle = {
  close(): void
}

// ─── Exporter ───────────────────────────────────────────────────────────────

export class AiWorkspaceExporter {
  private readonly aiSurface: AiSurfaceService
  private readonly clock: () => Date

  constructor(private readonly config: AiWorkspaceExporterConfig) {
    this.aiSurface =
      config.aiSurface ??
      createAiSurfaceService({
        store: config.store,
        schemas: config.schemas,
        clock: config.clock
      })
    this.clock = config.clock ?? (() => new Date())
  }

  async exportWorkspace(options: AiWorkspaceExportOptions): Promise<AiWorkspaceExportResult> {
    const exportedAt = this.clock().toISOString()
    const nodes = await this.resolveNodes(options.scope)
    const files: string[] = []
    const manifestEntries: AiWorkspaceManifestEntry[] = []

    await this.ensureBaseFolders(options.rootDir)

    await this.writeSupportFiles(
      options.rootDir,
      options.workspaceName ?? 'xNet AI workspace',
      files
    )

    for (const node of nodes) {
      const kind = inferExportKind(node)
      if (kind === 'page') {
        const entry = await this.exportPage(options.rootDir, node, exportedAt, files)
        manifestEntries.push(entry)
      } else if (kind === 'database') {
        const entries = await this.exportDatabase(options.rootDir, node, exportedAt, files)
        manifestEntries.push(...entries)
      } else if (kind === 'canvas') {
        const entries = await this.exportCanvas(options.rootDir, node, exportedAt, files)
        manifestEntries.push(...entries)
      } else {
        const entry = await this.exportNode(options.rootDir, node, exportedAt, files)
        manifestEntries.push(entry)
      }
    }

    await this.writeManifest(options.rootDir, manifestEntries, exportedAt, files)

    return {
      rootDir: options.rootDir,
      files,
      manifestEntries,
      exportedAt
    }
  }

  private async resolveNodes(scope: AiWorkspaceExportScope | undefined): Promise<NodeData[]> {
    if (scope?.nodeIds?.length) {
      const nodes = await Promise.all(scope.nodeIds.map((id) => this.config.store.get(id)))
      return uniqueNodes(nodes.filter((node): node is NodeData => node !== null && !node.deleted))
    }

    if (scope?.schemaIds?.length) {
      const pages = await Promise.all(
        scope.schemaIds.map((schemaId) =>
          this.config.store.list({ schemaId, limit: scope.limit ?? 100, offset: 0 })
        )
      )
      return uniqueNodes(pages.flat().filter((node) => !node.deleted))
    }

    return (await this.config.store.list({ limit: scope?.limit ?? 100, offset: 0 })).filter(
      (node) => !node.deleted
    )
  }

  private async ensureBaseFolders(rootDir: string): Promise<void> {
    await Promise.all(
      [
        '.codex',
        '.xnet',
        '.xnet/pending',
        '.xnet/applied',
        '.xnet/conflicts',
        '.xnet/review',
        'Pages',
        'Databases',
        'Canvases',
        'Assets'
      ].map((folder) => mkdir(join(rootDir, folder), { recursive: true }))
    )
  }

  private async writeSupportFiles(
    rootDir: string,
    workspaceName: string,
    files: string[]
  ): Promise<void> {
    await this.writeText(
      rootDir,
      'README.md',
      `# ${workspaceName}\n\nThis folder is a managed xNet AI workspace projection. Edit files here as proposals, then let xNet validate and apply changes through canonical mutation plans.\n`,
      files
    )
    await this.writeText(rootDir, 'AGENTS.md', renderAgentsMd(), files)
    await this.writeText(
      rootDir,
      '.mcp.json',
      `${JSON.stringify(renderClaudeMcpConfig(), null, 2)}\n`,
      files
    )
    await this.writeText(rootDir, '.codex/config.toml', renderCodexConfig(), files)
  }

  private async exportPage(
    rootDir: string,
    node: NodeData,
    exportedAt: string,
    files: string[]
  ): Promise<AiWorkspaceManifestEntry> {
    const content = await this.aiSurface.readResource(
      `xnet://page/${encodeURIComponent(node.id)}.md`
    )
    const path = `Pages/${fileStem(node)}.md`
    await this.writeText(rootDir, path, content.text, files)
    return manifestEntry(path, 'page', node, content.text, exportedAt)
  }

  private async exportDatabase(
    rootDir: string,
    node: NodeData,
    exportedAt: string,
    files: string[]
  ): Promise<AiWorkspaceManifestEntry[]> {
    const stem = fileStem(node)
    const schema = await this.aiSurface.readResource(
      `xnet://database/${encodeURIComponent(node.id)}/schema`
    )
    const views = await this.aiSurface.readResource(
      `xnet://database/${encodeURIComponent(node.id)}/views`
    )
    const query = await this.aiSurface.callTool('xnet_database_query', { databaseId: node.id })
    const rows = isRecord(query) && Array.isArray(query.rows) ? query.rows : []
    const rowsJsonl = rows.map((row) => JSON.stringify(row)).join('\n')
    const rowsContent = rowsJsonl ? `${rowsJsonl}\n` : ''

    const schemaPath = `Databases/${stem}.schema.json`
    const viewsPath = `Databases/${stem}.views.json`
    const rowsPath = `Databases/${stem}.rows.jsonl`
    await this.writeText(rootDir, schemaPath, schema.text, files)
    await this.writeText(rootDir, viewsPath, views.text, files)
    await this.writeText(rootDir, rowsPath, rowsContent, files)

    return [
      manifestEntry(schemaPath, 'database', node, schema.text, exportedAt),
      manifestEntry(viewsPath, 'database', node, views.text, exportedAt),
      manifestEntry(rowsPath, 'database', node, rowsContent, exportedAt)
    ]
  }

  private async exportCanvas(
    rootDir: string,
    node: NodeData,
    exportedAt: string,
    files: string[]
  ): Promise<AiWorkspaceManifestEntry[]> {
    const stem = fileStem(node)
    const viewport = await this.aiSurface.callTool('xnet_canvas_read_viewport', {
      canvasId: node.id
    })
    const objects = isRecord(viewport) && Array.isArray(viewport.objects) ? viewport.objects : []
    const edges = isRecord(viewport) && Array.isArray(viewport.edges) ? viewport.edges : []
    const jsonCanvas = JSON.stringify(
      {
        nodes: objects.filter(isRecord).map(toJsonCanvasNode),
        edges: edges.filter(isRecord).map(toJsonCanvasEdge)
      },
      null,
      2
    )
    const objectsJsonl = objects.map((object) => JSON.stringify(object)).join('\n')
    const sidecarContent = objectsJsonl ? `${objectsJsonl}\n` : ''

    const canvasPath = `Canvases/${stem}.canvas`
    const sidecarPath = `Canvases/${stem}.objects.jsonl`
    await this.writeText(rootDir, canvasPath, `${jsonCanvas}\n`, files)
    await this.writeText(rootDir, sidecarPath, sidecarContent, files)

    return [
      manifestEntry(canvasPath, 'canvas', node, `${jsonCanvas}\n`, exportedAt),
      manifestEntry(sidecarPath, 'canvas', node, sidecarContent, exportedAt)
    ]
  }

  private async exportNode(
    rootDir: string,
    node: NodeData,
    exportedAt: string,
    files: string[]
  ): Promise<AiWorkspaceManifestEntry> {
    const path = `.xnet/nodes/${fileStem(node)}.json`
    const content = `${JSON.stringify(node, null, 2)}\n`
    await this.writeText(rootDir, path, content, files)
    return manifestEntry(path, 'node', node, content, exportedAt)
  }

  private async writeManifest(
    rootDir: string,
    manifestEntries: AiWorkspaceManifestEntry[],
    exportedAt: string,
    files: string[]
  ): Promise<void> {
    const manifestJsonl = manifestEntries.map((entry) => JSON.stringify(entry)).join('\n')
    await this.writeText(
      rootDir,
      '.xnet/manifest.jsonl',
      manifestJsonl ? `${manifestJsonl}\n` : '',
      files
    )
    await this.writeText(
      rootDir,
      '.xnet/export-state.json',
      `${JSON.stringify({ exportedAt, entries: manifestEntries.length }, null, 2)}\n`,
      files
    )
  }

  private async writeText(
    rootDir: string,
    relativePath: string,
    content: string,
    files: string[]
  ): Promise<void> {
    const fullPath = join(rootDir, relativePath)
    await mkdir(dirname(fullPath), { recursive: true })
    const previous = await readOptionalText(fullPath)
    if (previous !== content) {
      await writeFile(fullPath, content, 'utf8')
    }
    files.push(relativePath)
  }
}

// ─── Watcher ───────────────────────────────────────────────────────────────

export class AiWorkspaceWatcher {
  private readonly aiSurface: AiSurfaceService
  private readonly clock: () => Date

  constructor(private readonly config: AiWorkspaceExporterConfig) {
    this.aiSurface =
      config.aiSurface ??
      createAiSurfaceService({
        store: config.store,
        schemas: config.schemas,
        clock: config.clock
      })
    this.clock = config.clock ?? (() => new Date())
  }

  async scanChangedFiles(
    options: AiWorkspaceWatcherScanOptions
  ): Promise<AiWorkspaceWatcherScanResult> {
    const scannedAt = this.clock().toISOString()
    const manifest = await readManifest(options.rootDir)
    const changedFiles: AiWorkspaceChangedFile[] = []
    const pendingPlans: AiWorkspacePendingPlan[] = []
    const conflicts: AiWorkspaceConflict[] = []

    for (const entry of manifest) {
      const content = await readOptionalText(join(options.rootDir, entry.path))
      if (content === null) {
        const conflict = await this.createConflict(options, {
          kind: 'missing-file',
          path: entry.path,
          id: entry.id,
          message: `Exported ${entry.kind} projection is missing from the AI workspace.`,
          detectedAt: scannedAt
        })
        changedFiles.push({
          path: entry.path,
          kind: entry.kind,
          id: entry.id,
          status: 'missing',
          previousSha256: entry.sha256
        })
        conflicts.push(conflict)
        continue
      }

      const currentSha256 = sha256(content)
      if (currentSha256 === entry.sha256) continue

      changedFiles.push({
        path: entry.path,
        kind: entry.kind,
        id: entry.id,
        status: 'modified',
        previousSha256: entry.sha256,
        currentSha256
      })

      try {
        const staleConflict = await this.createStaleExportConflict(options, entry, scannedAt)
        if (staleConflict) {
          conflicts.push(staleConflict)
          continue
        }

        const plan = await this.planChangedFile(entry, content, currentSha256, {
          actor: options.actor ?? 'ai-workspace-watcher'
        })
        if (!plan.validation.valid) {
          conflicts.push(
            await this.createConflict(options, {
              kind: 'invalid-plan',
              path: entry.path,
              id: entry.id,
              message: plan.validation.errors.join('; ') || 'Generated mutation plan is invalid.',
              detectedAt: scannedAt
            })
          )
        }
        pendingPlans.push(await this.writePendingPlan(options, entry, currentSha256, plan))
      } catch (err) {
        conflicts.push(
          await this.createConflict(options, {
            kind: errorKindForChangedFile(err),
            path: entry.path,
            id: entry.id,
            message: err instanceof Error ? err.message : String(err),
            detectedAt: scannedAt
          })
        )
      }
    }

    const review = createWorkspaceReviewIndex(options.rootDir, scannedAt, pendingPlans, conflicts)
    await this.writeReviewIndex(options, review)

    return {
      rootDir: options.rootDir,
      scannedAt,
      changedFiles,
      pendingPlans,
      conflicts,
      review
    }
  }

  watchWorkspace(
    options: AiWorkspaceWatcherScanOptions,
    onScan: (result: AiWorkspaceWatcherScanResult) => void | Promise<void>
  ): AiWorkspaceWatchHandle {
    let timer: ReturnType<typeof setTimeout> | null = null
    let watcher: FSWatcher | null = null

    const scheduleScan = (): void => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        void this.scanChangedFiles(options).then(onScan)
      }, 250)
    }

    watcher = watchFs(options.rootDir, { recursive: true }, (_event, filename) => {
      if (!filename) {
        scheduleScan()
        return
      }
      const relativePath = String(filename)
      if (
        relativePath.startsWith('.xnet/pending/') ||
        relativePath.startsWith('.xnet/conflicts/') ||
        relativePath.startsWith('.xnet/review/')
      ) {
        return
      }
      scheduleScan()
    })

    return {
      close: () => {
        if (timer) clearTimeout(timer)
        watcher?.close()
      }
    }
  }

  private async planChangedFile(
    entry: AiWorkspaceManifestEntry,
    content: string,
    currentSha256: string,
    context: { actor: string }
  ): Promise<AiMutationPlan> {
    if (entry.kind === 'page') {
      return this.expectPlan(
        await this.aiSurface.callTool('xnet_plan_page_patch', {
          pageId: entry.id,
          markdown: content,
          baseRevision: entry.revision,
          actor: context.actor,
          intent: `Import edited page Markdown from ${entry.path}`
        })
      )
    }

    if (entry.kind === 'database') {
      return this.planDatabaseProjection(entry, content, currentSha256, context.actor)
    }

    if (entry.kind === 'canvas') {
      return this.planCanvasProjection(entry, content, currentSha256, context.actor)
    }

    return this.createGenericProjectionPlan({
      entry,
      content,
      currentSha256,
      actor: context.actor,
      intent: `Import edited node projection from ${entry.path}`,
      targetKind: 'node',
      requiredScopes: ['agent.workspace.import'],
      risk: 'medium',
      operation: createAiOperation('replaceNodeProjection', {
        projectionPath: entry.path,
        content,
        contentHash: currentSha256
      })
    })
  }

  private async createStaleExportConflict(
    options: AiWorkspaceWatcherScanOptions,
    entry: AiWorkspaceManifestEntry,
    detectedAt: string
  ): Promise<AiWorkspaceConflict | null> {
    const node = await this.config.store.get(entry.id)
    if (!node || node.deleted) return null

    const liveRevision = `updatedAt:${node.updatedAt}`
    if (liveRevision === entry.revision) return null

    return await this.createConflict(options, {
      kind: 'stale-export',
      path: entry.path,
      id: entry.id,
      message: `Exported ${entry.kind} projection is based on ${entry.revision}, but the live node is ${liveRevision}. Re-export before applying edits.`,
      detectedAt
    })
  }

  private async planDatabaseProjection(
    entry: AiWorkspaceManifestEntry,
    content: string,
    currentSha256: string,
    actor: string
  ): Promise<AiMutationPlan> {
    const operation = databaseProjectionOperation(entry.path, content, currentSha256)
    return this.expectPlan(
      await this.aiSurface.callTool('xnet_plan_database_mutation', {
        databaseId: entry.id,
        baseRevision: entry.revision,
        actor,
        intent: `Import edited database projection from ${entry.path}`,
        operations: [operation]
      })
    )
  }

  private async planCanvasProjection(
    entry: AiWorkspaceManifestEntry,
    content: string,
    currentSha256: string,
    actor: string
  ): Promise<AiMutationPlan> {
    if (entry.path.endsWith('.canvas')) {
      return this.expectPlan(
        await this.aiSurface.callTool('xnet_canvas_plan_json_canvas_import', {
          canvasId: entry.id,
          document: parseJsonObjectFile(content, entry.path),
          baseRevision: entry.revision,
          actor,
          intent: `Import edited JSON Canvas projection from ${entry.path}`
        })
      )
    }

    const objects = parseJsonlObjects(content, entry.path)
    return this.expectPlan(
      await this.aiSurface.callTool('xnet_plan_canvas_mutation', {
        canvasId: entry.id,
        baseRevision: entry.revision,
        actor,
        intent: `Import edited canvas sidecar from ${entry.path}`,
        operations: [
          createAiOperation('replaceObjectsSidecarProjection', {
            projectionPath: entry.path,
            contentHash: currentSha256,
            objects,
            objectCount: objects.length
          })
        ]
      })
    )
  }

  private createGenericProjectionPlan(input: {
    entry: AiWorkspaceManifestEntry
    content: string
    currentSha256: string
    actor: string
    intent: string
    targetKind: AiTargetKind
    requiredScopes: AiScope[]
    risk: AiRiskLevel
    operation: AiOperation
  }): AiMutationPlan {
    return attachAiPlanValidation({
      id: `plan_${shortHash(`${input.entry.path}:${input.entry.revision}:${input.currentSha256}`)}`,
      actor: input.actor,
      intent: input.intent,
      risk: input.risk,
      requiredScopes: input.requiredScopes,
      changes: [
        {
          targetKind: input.targetKind,
          targetId: input.entry.id,
          baseRevision: input.entry.revision,
          operations: [input.operation]
        }
      ],
      validation: { valid: true, warnings: [], errors: [] },
      createdAt: this.clock().toISOString(),
      status: 'proposed'
    })
  }

  private expectPlan(value: unknown): AiMutationPlan {
    if (isMutationPlan(value)) return value
    throw new Error('AI surface did not return a mutation plan')
  }

  private async writePendingPlan(
    options: AiWorkspaceWatcherScanOptions,
    entry: AiWorkspaceManifestEntry,
    currentSha256: string,
    plan: AiMutationPlan
  ): Promise<AiWorkspacePendingPlan> {
    const planPath = `.xnet/pending/${planFileName(this.clock(), entry.path, currentSha256)}`
    if (options.writePendingPlans !== false) {
      await writeManagedJson(options.rootDir, planPath, plan)
    }
    return {
      path: entry.path,
      planPath,
      plan,
      currentSha256
    }
  }

  private async createConflict(
    options: AiWorkspaceWatcherScanOptions,
    conflict: AiWorkspaceConflict
  ): Promise<AiWorkspaceConflict> {
    const conflictPath = `.xnet/conflicts/${conflictFileName(
      this.clock(),
      conflict.path,
      conflict.kind
    )}`
    const nextConflict = {
      ...conflict,
      conflictPath
    }
    if (options.writeConflicts !== false) {
      await writeManagedJson(options.rootDir, conflictPath, nextConflict)
    }
    return nextConflict
  }

  private async writeReviewIndex(
    options: AiWorkspaceWatcherScanOptions,
    review: AiWorkspaceReviewIndex
  ): Promise<void> {
    if (options.writeReviewIndex !== false) {
      await writeManagedJson(options.rootDir, '.xnet/review/index.json', review)
    }
  }
}

// ─── Factory ────────────────────────────────────────────────────────────────

export function createAiWorkspaceExporter(config: AiWorkspaceExporterConfig): AiWorkspaceExporter {
  return new AiWorkspaceExporter(config)
}

export function createAiWorkspaceWatcher(config: AiWorkspaceExporterConfig): AiWorkspaceWatcher {
  return new AiWorkspaceWatcher(config)
}

// ─── Render Helpers ────────────────────────────────────────────────────────

function renderAgentsMd(): string {
  return [
    '# xNet AI Workspace Instructions',
    '',
    '- Preserve `xnet` frontmatter and id suffixes in filenames.',
    '- Treat edits as proposals; xNet validates and applies them through mutation plans.',
    '- Do not delete rows by removing lines from partial exports. Use explicit mutation plans.',
    '- Keep `.xnet/manifest.jsonl` and `.xnet/export-state.json` managed by xNet.',
    '- Prefer Markdown for pages, JSON files for database schemas/views, JSONL for rows, and JSON Canvas for canvases.',
    ''
  ].join('\n')
}

function renderClaudeMcpConfig(): Record<string, unknown> {
  return {
    mcpServers: {
      xnet: {
        type: 'stdio',
        command: 'pnpm',
        args: ['--filter', '@xnetjs/plugins', 'mcp:xnet'],
        env: {
          XNET_API_TOKEN: '${XNET_API_TOKEN}'
        }
      }
    }
  }
}

function renderCodexConfig(): string {
  return [
    '[mcp_servers.xnet]',
    'command = "pnpm"',
    'args = ["--filter", "@xnetjs/plugins", "mcp:xnet"]',
    '',
    '[mcp_servers.xnet.env]',
    'XNET_API_TOKEN = "${XNET_API_TOKEN}"',
    ''
  ].join('\n')
}

// ─── Pure Helpers ───────────────────────────────────────────────────────────

function createWorkspaceReviewIndex(
  rootDir: string,
  generatedAt: string,
  pendingPlans: AiWorkspacePendingPlan[],
  conflicts: AiWorkspaceConflict[]
): AiWorkspaceReviewIndex {
  return {
    rootDir,
    generatedAt,
    entries: [
      ...pendingPlans.map((pending) => reviewEntryForPendingPlan(pending, generatedAt)),
      ...conflicts.map((conflict) => reviewEntryForConflict(conflict, generatedAt))
    ]
  }
}

function reviewEntryForPendingPlan(
  pending: AiWorkspacePendingPlan,
  createdAt: string
): AiWorkspaceReviewEntry {
  const firstChange = pending.plan.changes[0]

  return {
    kind: 'pending-plan',
    status: 'needs-review',
    path: pending.path,
    ...(firstChange?.targetId ? { id: firstChange.targetId } : {}),
    title: `Review proposed change for ${pending.path}`,
    message: pending.plan.intent,
    artifactPath: pending.planPath,
    planId: pending.plan.id,
    planPath: pending.planPath,
    risk: pending.plan.risk,
    requiredScopes: [...pending.plan.requiredScopes],
    suggestedActions: ['approve', 'reject', 'request-revision'],
    createdAt
  }
}

function reviewEntryForConflict(
  conflict: AiWorkspaceConflict,
  createdAt: string
): AiWorkspaceReviewEntry {
  return {
    kind: 'conflict',
    status: 'needs-review',
    path: conflict.path,
    ...(conflict.id ? { id: conflict.id } : {}),
    title: `Resolve ${conflict.kind} for ${conflict.path}`,
    message: conflict.message,
    ...(conflict.conflictPath ? { artifactPath: conflict.conflictPath } : {}),
    conflictKind: conflict.kind,
    ...(conflict.conflictPath ? { conflictPath: conflict.conflictPath } : {}),
    suggestedActions: ['reject', 'request-revision'],
    createdAt
  }
}

function inferExportKind(node: NodeData): AiWorkspaceExportKind {
  const schemaId = node.schemaId.toLocaleLowerCase()
  if (schemaId.includes('/page@') || schemaId.includes('/note@')) return 'page'
  if (schemaId.includes('/database@')) return 'database'
  if (schemaId.includes('/canvas@')) return 'canvas'
  return 'node'
}

function fileStem(node: NodeData): string {
  const title = typeof node.properties.title === 'string' ? node.properties.title : node.id
  return `${slugify(title)}--${slugify(node.id)}`
}

function slugify(value: string): string {
  const slug = value
    .normalize('NFKD')
    .replace(/[^\w.-]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug || 'untitled'
}

function manifestEntry(
  path: string,
  kind: AiWorkspaceExportKind,
  node: NodeData,
  content: string,
  exportedAt: string
): AiWorkspaceManifestEntry {
  return {
    path,
    kind,
    id: node.id,
    schemaId: node.schemaId,
    revision: `updatedAt:${node.updatedAt}`,
    sha256: sha256(content),
    exportedAt
  }
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function uniqueNodes(nodes: NodeData[]): NodeData[] {
  const seen = new Set<string>()
  return nodes.filter((node) => {
    if (seen.has(node.id)) return false
    seen.add(node.id)
    return true
  })
}

async function readOptionalText(path: string): Promise<string | null> {
  try {
    return await readFile(path, 'utf8')
  } catch {
    return null
  }
}

async function readManifest(rootDir: string): Promise<AiWorkspaceManifestEntry[]> {
  const manifest = await readOptionalText(join(rootDir, '.xnet/manifest.jsonl'))
  if (!manifest?.trim()) return []

  return manifest
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line) as unknown)
    .filter(isManifestEntry)
}

async function writeManagedJson(
  rootDir: string,
  relativePath: string,
  value: unknown
): Promise<void> {
  const fullPath = join(rootDir, relativePath)
  await mkdir(dirname(fullPath), { recursive: true })
  await writeFile(fullPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

function databaseProjectionOperation(
  path: string,
  content: string,
  contentHash: string
): AiOperation {
  if (path.endsWith('.schema.json')) {
    return createAiOperation('replaceSchemaProjection', {
      projectionPath: path,
      contentHash,
      schema: parseJsonObjectFile(content, path)
    })
  }

  if (path.endsWith('.views.json')) {
    return createAiOperation('replaceViewsProjection', {
      projectionPath: path,
      contentHash,
      views: parseJsonObjectFile(content, path)
    })
  }

  if (path.endsWith('.rows.jsonl')) {
    const rows = parseJsonlObjects(content, path)
    return createAiOperation('replaceRowsProjection', {
      projectionPath: path,
      contentHash,
      rows,
      rowCount: rows.length
    })
  }

  throw new Error(`Unsupported database projection file: ${path}`)
}

function parseJsonObjectFile(content: string, path: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(content) as unknown
    if (isRecord(parsed)) return parsed
    throw new Error('JSON root must be an object')
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    throw new Error(`Invalid JSON in ${path}: ${message}`)
  }
}

function parseJsonlObjects(content: string, path: string): Record<string, unknown>[] {
  const lines = content
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

  return lines.map((line, index) => {
    try {
      const parsed = JSON.parse(line) as unknown
      if (isRecord(parsed)) return parsed
      throw new Error('line must be a JSON object')
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      throw new Error(`Invalid JSONL in ${path} at line ${index + 1}: ${message}`)
    }
  })
}

function isManifestEntry(value: unknown): value is AiWorkspaceManifestEntry {
  return (
    isRecord(value) &&
    typeof value.path === 'string' &&
    typeof value.kind === 'string' &&
    typeof value.id === 'string' &&
    typeof value.schemaId === 'string' &&
    typeof value.revision === 'string' &&
    typeof value.sha256 === 'string' &&
    typeof value.exportedAt === 'string'
  )
}

function isMutationPlan(value: unknown): value is AiMutationPlan {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.actor === 'string' &&
    typeof value.intent === 'string' &&
    Array.isArray(value.changes) &&
    isRecord(value.validation)
  )
}

function errorKindForChangedFile(err: unknown): AiWorkspaceConflictKind {
  const message = err instanceof Error ? err.message : String(err)
  if (message.includes('Invalid JSONL')) return 'invalid-jsonl'
  if (message.includes('Invalid JSON')) return 'invalid-json'
  if (message.includes('Unsupported')) return 'unsupported-change'
  if (message.includes('mutation plan')) return 'invalid-plan'
  return 'tool-error'
}

function planFileName(clock: Date, path: string, contentHash: string): string {
  return `${timestampForPath(clock)}-${slugify(path)}-${shortHash(contentHash)}.plan.json`
}

function conflictFileName(clock: Date, path: string, kind: AiWorkspaceConflictKind): string {
  return `${timestampForPath(clock)}-${slugify(path)}-${kind}.json`
}

function timestampForPath(clock: Date): string {
  return clock.toISOString().replace(/[:.]/g, '-')
}

function shortHash(value: string): string {
  return sha256(value).slice(0, 12)
}

function toJsonCanvasNode(object: Record<string, unknown>): Record<string, unknown> {
  const id = readString(object, 'id') ?? readString(object, 'objectId') ?? 'object'
  const type = readString(object, 'type') ?? readString(object, 'kind') ?? 'text'
  return {
    id,
    type: normalizeJsonCanvasNodeType(type),
    x: readNumber(object, 'x') ?? 0,
    y: readNumber(object, 'y') ?? 0,
    width: readNumber(object, 'width') ?? readNumber(object, 'w') ?? 320,
    height: readNumber(object, 'height') ?? readNumber(object, 'h') ?? 200,
    ...(typeof object.text === 'string' ? { text: object.text } : {}),
    ...(typeof object.url === 'string' ? { url: object.url } : {}),
    ...(typeof object.file === 'string' ? { file: object.file } : {}),
    xnet: object
  }
}

function toJsonCanvasEdge(edge: Record<string, unknown>): Record<string, unknown> {
  return {
    id:
      readString(edge, 'id') ??
      `${readString(edge, 'from') ?? 'from'}-${readString(edge, 'to') ?? 'to'}`,
    fromNode: readString(edge, 'from') ?? readString(edge, 'fromObjectId'),
    toNode: readString(edge, 'to') ?? readString(edge, 'toObjectId'),
    ...(typeof edge.label === 'string' ? { label: edge.label } : {}),
    xnet: edge
  }
}

function normalizeJsonCanvasNodeType(type: string): string {
  if (type === 'page' || type === 'database' || type === 'media') return 'file'
  if (type === 'external-reference') return 'link'
  if (type === 'group') return 'group'
  return 'text'
}

function readString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key]
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function readNumber(record: Record<string, unknown>, key: string): number | undefined {
  const value = record[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
