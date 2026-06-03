/**
 * Node-only AI workspace folder exporter.
 */

import type { NodeData, NodeStoreAPI, SchemaRegistryAPI } from './local-api'
import { createHash } from 'crypto'
import { mkdir, readFile, writeFile } from 'fs/promises'
import { dirname, join } from 'path'
import { AiSurfaceService, createAiSurfaceService } from '../ai-surface'

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

// ─── Factory ────────────────────────────────────────────────────────────────

export function createAiWorkspaceExporter(config: AiWorkspaceExporterConfig): AiWorkspaceExporter {
  return new AiWorkspaceExporter(config)
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
