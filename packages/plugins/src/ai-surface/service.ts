/**
 * AI surface service for focused resources, context packs, and plan-only tools.
 */

import type {
  AiChangeSet,
  AiContextPack,
  AiContextPackResource,
  AiContextSeed,
  AiMutationPlan,
  AiOperation,
  AiResource,
  AiRiskLevel,
  AiScope,
  AiTargetKind,
  AiToolDefinition
} from './types'
import type { NodeData, NodeStoreAPI, SchemaRegistryAPI } from '../services/local-api'
import { renderMarkdownLineDiff, validateXNetPageMarkdown } from './page-markdown'
import { attachAiPlanValidation, createAiOperation, validateAiMutationPlan } from './validation'

// ─── Types ─────────────────────────────────────────────────────────────────

export type AiResourceContent = {
  uri: string
  mimeType: string
  text: string
}

export type AiSearchResult = {
  id: string
  schemaId: string
  title: string
  snippet: string
  score: number
  revision: string
  updatedAt: number
}

export type AiSearchOptions = {
  query: string
  schemaId?: string
  limit?: number
  offset?: number
}

export type AiSurfaceLimits = {
  maxListLimit: number
  maxSearchScan: number
  maxSearchResults: number
  maxContextResources: number
  maxCharactersPerResource: number
  maxJsonCharacters: number
  maxCanvasObjects: number
  maxDatabaseRows: number
}

export type AiSurfaceServiceConfig = {
  store: NodeStoreAPI
  schemas: SchemaRegistryAPI
  limits?: Partial<AiSurfaceLimits>
  clock?: () => Date
}

const DEFAULT_LIMITS: AiSurfaceLimits = {
  maxListLimit: 100,
  maxSearchScan: 500,
  maxSearchResults: 20,
  maxContextResources: 12,
  maxCharactersPerResource: 12_000,
  maxJsonCharacters: 24_000,
  maxCanvasObjects: 200,
  maxDatabaseRows: 100
}

// ─── Service ────────────────────────────────────────────────────────────────

export class AiSurfaceService {
  private readonly limits: AiSurfaceLimits
  private readonly clock: () => Date
  private sequence = 0

  constructor(private readonly config: AiSurfaceServiceConfig) {
    this.limits = { ...DEFAULT_LIMITS, ...config.limits }
    this.clock = config.clock ?? (() => new Date())
  }

  getResources(): AiResource[] {
    return [
      createResource(
        'xnet://workspace/summary',
        'Workspace Summary',
        'High-level schema counts, recent nodes, and AI surface capabilities.',
        'application/json',
        'low',
        ['workspace.read']
      ),
      createResource(
        'xnet://workspace/recent',
        'Recent Workspace Nodes',
        'Recent nodes with ids, schemas, titles, and revisions.',
        'application/json',
        'low',
        ['workspace.read']
      ),
      createResource(
        'xnet://nodes',
        'All Nodes',
        'Limited list of nodes in the local store.',
        'application/json',
        'low',
        ['workspace.read']
      ),
      createResource(
        'xnet://schemas',
        'All Schemas',
        'List of available schemas and property metadata.',
        'application/json',
        'low',
        ['workspace.read']
      ),
      createResource(
        'xnet://page/{pageId}.md',
        'Page Markdown',
        'Markdown projection for a page, including xNet frontmatter identity.',
        'text/markdown',
        'low',
        ['page.read'],
        true
      ),
      createResource(
        'xnet://page/{pageId}/outline',
        'Page Outline',
        'Page heading outline extracted from the Markdown projection.',
        'application/json',
        'low',
        ['page.read'],
        true
      ),
      createResource(
        'xnet://database/{databaseId}/schema',
        'Database Schema',
        'Database node metadata, declared properties, and known column descriptors.',
        'application/json',
        'low',
        ['database.read'],
        true
      ),
      createResource(
        'xnet://database/{databaseId}/views',
        'Database Views',
        'Known database view descriptors from the database node projection.',
        'application/json',
        'low',
        ['database.read'],
        true
      ),
      createResource(
        'xnet://canvas/{canvasId}/viewport?x=0&y=0&w=1000&h=800',
        'Canvas Viewport',
        'Viewport-scoped canvas objects and edges.',
        'application/json',
        'low',
        ['canvas.read'],
        true
      )
    ]
  }

  getTools(): AiToolDefinition[] {
    return [
      {
        name: 'xnet_search',
        title: 'Search xNet workspace',
        description: 'Search node titles and searchable properties with pagination and limits.',
        risk: 'low',
        requiredScopes: ['workspace.search'],
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Search text.' },
            schemaId: { type: 'string', description: 'Optional schema IRI filter.' },
            limit: { type: 'number', description: 'Maximum result count.' },
            offset: { type: 'number', description: 'Result offset for pagination.' }
          },
          required: ['query']
        }
      },
      {
        name: 'xnet_create_context_pack',
        title: 'Create context pack',
        description: 'Create a bounded context pack from seeds and optional search results.',
        risk: 'low',
        requiredScopes: ['workspace.read', 'workspace.search'],
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Optional search query.' },
            seeds: {
              type: 'array',
              description: 'Seed resources such as pages, databases, canvases, or nodes.',
              items: {
                type: 'object',
                properties: {
                  kind: { type: 'string', description: 'Seed kind.' },
                  id: { type: 'string', description: 'Seed id.' }
                }
              }
            },
            limit: { type: 'number', description: 'Maximum resources to include.' }
          }
        }
      },
      {
        name: 'xnet_read_page_markdown',
        title: 'Read page Markdown',
        description: 'Read a page as Markdown with optional xNet frontmatter.',
        risk: 'low',
        requiredScopes: ['page.read'],
        inputSchema: {
          type: 'object',
          properties: {
            pageId: { type: 'string', description: 'Page node id.' },
            includeFrontmatter: {
              type: 'boolean',
              description: 'Include xNet identity frontmatter. Defaults to true.'
            }
          },
          required: ['pageId']
        }
      },
      {
        name: 'xnet_validate_page_markdown',
        title: 'Validate page Markdown',
        description: 'Validate xNet page frontmatter and supported xNet Markdown directives.',
        risk: 'low',
        requiredScopes: ['page.read'],
        inputSchema: {
          type: 'object',
          properties: {
            pageId: { type: 'string', description: 'Optional target page node id.' },
            baseRevision: { type: 'string', description: 'Optional expected base revision.' },
            markdown: { type: 'string', description: 'Markdown to validate.' }
          },
          required: ['markdown']
        }
      },
      {
        name: 'xnet_plan_page_patch',
        title: 'Plan page Markdown patch',
        description:
          'Validate an edited Markdown page and return a mutation plan without applying it.',
        risk: 'medium',
        requiredScopes: ['page.read', 'page.propose'],
        inputSchema: {
          type: 'object',
          properties: {
            pageId: { type: 'string', description: 'Page node id.' },
            baseRevision: { type: 'string', description: 'Revision the patch was based on.' },
            markdown: { type: 'string', description: 'Proposed full Markdown replacement.' },
            intent: { type: 'string', description: 'User or agent intent for the patch.' },
            actor: { type: 'string', description: 'Agent or user creating the plan.' }
          },
          required: ['pageId', 'markdown']
        }
      },
      {
        name: 'xnet_database_query',
        title: 'Query database rows',
        description: 'Read a bounded page of database rows by database id and optional row schema.',
        risk: 'low',
        requiredScopes: ['database.read', 'database.query'],
        inputSchema: {
          type: 'object',
          properties: {
            databaseId: { type: 'string', description: 'Database node id.' },
            schemaId: { type: 'string', description: 'Optional row schema IRI.' },
            limit: { type: 'number', description: 'Maximum row count.' },
            offset: { type: 'number', description: 'Row offset.' }
          },
          required: ['databaseId']
        }
      },
      {
        name: 'xnet_plan_database_mutation',
        title: 'Plan database mutation',
        description: 'Create a database mutation plan for later review without applying it.',
        risk: 'medium',
        requiredScopes: ['database.read', 'database.propose'],
        inputSchema: {
          type: 'object',
          properties: {
            databaseId: { type: 'string', description: 'Database node id.' },
            baseRevision: { type: 'string', description: 'Revision the mutation was based on.' },
            operations: { type: 'array', description: 'Database operations to validate.' },
            intent: { type: 'string', description: 'User or agent intent for the mutation.' },
            actor: { type: 'string', description: 'Agent or user creating the plan.' }
          },
          required: ['databaseId', 'operations']
        }
      },
      {
        name: 'xnet_canvas_read_viewport',
        title: 'Read canvas viewport',
        description: 'Read canvas objects and edges intersecting a viewport.',
        risk: 'low',
        requiredScopes: ['canvas.read'],
        inputSchema: {
          type: 'object',
          properties: {
            canvasId: { type: 'string', description: 'Canvas node id.' },
            x: { type: 'number', description: 'Viewport x.' },
            y: { type: 'number', description: 'Viewport y.' },
            w: { type: 'number', description: 'Viewport width.' },
            h: { type: 'number', description: 'Viewport height.' },
            includeSourcePreviews: {
              type: 'boolean',
              description: 'Include previews for source-backed objects.'
            }
          },
          required: ['canvasId']
        }
      },
      {
        name: 'xnet_plan_canvas_mutation',
        title: 'Plan canvas mutation',
        description: 'Create a canvas mutation plan for later review without applying it.',
        risk: 'medium',
        requiredScopes: ['canvas.read', 'canvas.propose'],
        inputSchema: {
          type: 'object',
          properties: {
            canvasId: { type: 'string', description: 'Canvas node id.' },
            baseRevision: { type: 'string', description: 'Revision the mutation was based on.' },
            operations: { type: 'array', description: 'Canvas operations to validate.' },
            intent: { type: 'string', description: 'User or agent intent for the mutation.' },
            actor: { type: 'string', description: 'Agent or user creating the plan.' }
          },
          required: ['canvasId', 'operations']
        }
      },
      {
        name: 'xnet_validate_mutation_plan',
        title: 'Validate mutation plan',
        description: 'Validate a serialized mutation plan and return errors or warnings.',
        risk: 'medium',
        requiredScopes: ['workspace.read'],
        inputSchema: {
          type: 'object',
          properties: {
            plan: { type: 'object', description: 'Mutation plan object to validate.' }
          },
          required: ['plan']
        }
      }
    ]
  }

  async callTool(name: string, args: Record<string, unknown> = {}): Promise<unknown> {
    switch (name) {
      case 'xnet_search':
        return await this.search({
          query: readRequiredString(args, 'query'),
          schemaId: readOptionalString(args, 'schemaId') ?? readOptionalString(args, 'schema'),
          limit: readOptionalNumber(args, 'limit'),
          offset: readOptionalNumber(args, 'offset')
        })

      case 'xnet_create_context_pack':
        return await this.createContextPack({
          query: readOptionalString(args, 'query'),
          seeds: readContextSeeds(args.seeds),
          limit: readOptionalNumber(args, 'limit')
        })

      case 'xnet_read_page_markdown': {
        const content = await this.readPageMarkdown(
          readRequiredString(args, 'pageId'),
          readOptionalBoolean(args, 'includeFrontmatter') ?? true
        )
        return { markdown: content.text, mimeType: content.mimeType, uri: content.uri }
      }

      case 'xnet_validate_page_markdown': {
        const pageId = readOptionalString(args, 'pageId')
        const node = pageId ? await this.getNodeOrThrow(pageId) : null
        return validateXNetPageMarkdown(readRequiredString(args, 'markdown'), {
          pageId,
          schemaId: node?.schemaId,
          baseRevision: readOptionalString(args, 'baseRevision')
        })
      }

      case 'xnet_plan_page_patch':
        return await this.planPagePatch(args)

      case 'xnet_database_query':
        return await this.queryDatabase({
          databaseId: readRequiredString(args, 'databaseId'),
          schemaId: readOptionalString(args, 'schemaId'),
          limit: readOptionalNumber(args, 'limit'),
          offset: readOptionalNumber(args, 'offset')
        })

      case 'xnet_plan_database_mutation':
        return await this.planSurfaceMutation({
          targetKind: 'database',
          targetId: readRequiredString(args, 'databaseId'),
          baseRevision: readOptionalString(args, 'baseRevision'),
          operations: readOperations(args.operations),
          actor: readOptionalString(args, 'actor') ?? 'ai-agent',
          intent: readOptionalString(args, 'intent') ?? 'Plan database mutation',
          requiredScopes: ['database.read', 'database.propose']
        })

      case 'xnet_canvas_read_viewport':
        return await this.readCanvasViewport({
          canvasId: readRequiredString(args, 'canvasId'),
          x: readOptionalNumber(args, 'x'),
          y: readOptionalNumber(args, 'y'),
          w: readOptionalNumber(args, 'w'),
          h: readOptionalNumber(args, 'h'),
          includeSourcePreviews: readOptionalBoolean(args, 'includeSourcePreviews') ?? false
        })

      case 'xnet_plan_canvas_mutation':
        return await this.planSurfaceMutation({
          targetKind: 'canvas',
          targetId: readRequiredString(args, 'canvasId'),
          baseRevision: readOptionalString(args, 'baseRevision'),
          operations: readOperations(args.operations),
          actor: readOptionalString(args, 'actor') ?? 'ai-agent',
          intent: readOptionalString(args, 'intent') ?? 'Plan canvas mutation',
          requiredScopes: ['canvas.read', 'canvas.propose']
        })

      case 'xnet_validate_mutation_plan': {
        const validation = validateAiMutationPlan(args.plan)
        return { validation }
      }

      default:
        throw new Error(`Unknown AI surface tool: ${name}`)
    }
  }

  async readResource(uri: string): Promise<AiResourceContent> {
    const parsed = parseXNetUri(uri)

    if (uri === 'xnet://nodes') {
      const nodes = await this.config.store.list({ limit: this.limits.maxListLimit })
      return this.jsonResource(uri, { nodes, count: nodes.length, limit: this.limits.maxListLimit })
    }

    if (uri === 'xnet://schemas') {
      return this.jsonResource(uri, { schemas: await this.getSchemaSummaries(true) })
    }

    if (parsed.host === 'workspace' && parsed.parts[0] === 'summary') {
      return this.jsonResource(uri, await this.getWorkspaceSummary())
    }

    if (parsed.host === 'workspace' && parsed.parts[0] === 'recent') {
      return this.jsonResource(uri, await this.getRecentNodes())
    }

    if (parsed.host === 'workspace' && parsed.parts[0] === 'search') {
      return this.jsonResource(
        uri,
        await this.search({
          query: parsed.searchParams.get('q') ?? '',
          schemaId: parsed.searchParams.get('schema') ?? undefined,
          limit: readUrlNumber(parsed.searchParams, 'limit'),
          offset: readUrlNumber(parsed.searchParams, 'offset')
        })
      )
    }

    if (parsed.host === 'node' && parsed.parts[0]) {
      return this.jsonResource(uri, await this.getNodeProjection(parsed.parts[0]))
    }

    if (parsed.host === 'page' && parsed.parts[0]) {
      const pageId = parsed.parts[0].endsWith('.md')
        ? parsed.parts[0].slice(0, -'.md'.length)
        : parsed.parts[0]
      if (parsed.parts.length === 1 || parsed.parts[0].endsWith('.md')) {
        return await this.readPageMarkdown(pageId, true, uri)
      }
      if (parsed.parts[1] === 'outline') {
        return this.jsonResource(uri, await this.readPageOutline(pageId))
      }
      if (parsed.parts[1] === 'context-pack') {
        return this.jsonResource(
          uri,
          await this.createContextPack({ seeds: [{ kind: 'page', id: pageId }] })
        )
      }
    }

    if (parsed.host === 'database' && parsed.parts[0]) {
      const databaseId = parsed.parts[0]
      if (parsed.parts[1] === 'schema') {
        return this.jsonResource(uri, await this.describeDatabase(databaseId))
      }
      if (parsed.parts[1] === 'views') {
        return this.jsonResource(uri, await this.readDatabaseViews(databaseId))
      }
      if (parsed.parts[1] === 'query') {
        return this.jsonResource(
          uri,
          await this.queryDatabase({
            databaseId,
            limit: readUrlNumber(parsed.searchParams, 'limit'),
            offset: readUrlNumber(parsed.searchParams, 'offset')
          })
        )
      }
    }

    if (parsed.host === 'canvas' && parsed.parts[0]) {
      const canvasId = parsed.parts[0]
      if (parsed.parts[1] === 'viewport') {
        return this.jsonResource(
          uri,
          await this.readCanvasViewport({
            canvasId,
            x: readUrlNumber(parsed.searchParams, 'x'),
            y: readUrlNumber(parsed.searchParams, 'y'),
            w: readUrlNumber(parsed.searchParams, 'w'),
            h: readUrlNumber(parsed.searchParams, 'h'),
            includeSourcePreviews: parsed.searchParams.get('includeSourcePreviews') === 'true'
          })
        )
      }
      if (parsed.parts[1] === 'object' && parsed.parts[2]) {
        return this.jsonResource(uri, await this.readCanvasObject(canvasId, parsed.parts[2]))
      }
    }

    throw new Error(`Resource not found: ${uri}`)
  }

  toJsonText(value: unknown): string {
    return this.stringifyJson(value)
  }

  // ─── Workspace And Search ─────────────────────────────────────────────────

  private async getWorkspaceSummary(): Promise<Record<string, unknown>> {
    const [nodes, schemas] = await Promise.all([
      this.config.store.list({ limit: this.limits.maxListLimit }),
      this.getSchemaSummaries(true)
    ])

    const schemaCounts = nodes.reduce<Record<string, number>>((counts, node) => {
      counts[node.schemaId] = (counts[node.schemaId] ?? 0) + 1
      return counts
    }, {})

    return {
      generatedAt: this.nowIso(),
      nodeSampleCount: nodes.length,
      nodeSampleLimit: this.limits.maxListLimit,
      schemaCount: schemas.length,
      schemaCounts,
      schemas,
      recentNodes: summarizeNodes(sortRecent(nodes).slice(0, 10)),
      resources: this.getResources().map(
        ({ uri, name, description, mimeType, requiredScopes }) => ({
          uri,
          name,
          description,
          mimeType,
          requiredScopes
        })
      ),
      tools: this.getTools().map(({ name, title, risk, requiredScopes }) => ({
        name,
        title,
        risk,
        requiredScopes
      }))
    }
  }

  private async getRecentNodes(): Promise<Record<string, unknown>> {
    const nodes = await this.config.store.list({ limit: this.limits.maxListLimit })
    return {
      generatedAt: this.nowIso(),
      nodes: summarizeNodes(sortRecent(nodes)),
      count: nodes.length,
      limit: this.limits.maxListLimit
    }
  }

  async search(options: AiSearchOptions): Promise<Record<string, unknown>> {
    const query = options.query.trim()
    if (!query) {
      return { query, count: 0, limit: 0, offset: options.offset ?? 0, results: [] }
    }

    const scanLimit = this.limits.maxSearchScan
    const resultLimit = clampLimit(options.limit, this.limits.maxSearchResults)
    const offset = Math.max(0, options.offset ?? 0)
    const nodes = await this.config.store.list({
      schemaId: options.schemaId,
      limit: scanLimit,
      offset: 0
    })

    const normalizedQuery = query.toLocaleLowerCase()
    const matches = nodes
      .filter((node) => !node.deleted)
      .map((node) => scoreNode(node, normalizedQuery))
      .filter((result): result is AiSearchResult => result !== null)
      .sort((a, b) => b.score - a.score || b.updatedAt - a.updatedAt)

    return {
      query,
      schemaId: options.schemaId,
      count: matches.length,
      limit: resultLimit,
      offset,
      scanned: nodes.length,
      results: matches.slice(offset, offset + resultLimit)
    }
  }

  async createContextPack(options: {
    query?: string
    seeds?: AiContextSeed[]
    limit?: number
  }): Promise<AiContextPack> {
    const maxResources = clampLimit(options.limit, this.limits.maxContextResources)
    const resources: AiContextPackResource[] = []

    for (const seed of options.seeds ?? []) {
      if (resources.length >= maxResources) break
      const resource = await this.contextResourceForSeed(seed)
      if (resource) resources.push(resource)
    }

    if (options.query && resources.length < maxResources) {
      const search = await this.search({
        query: options.query,
        limit: maxResources - resources.length
      })
      const results = Array.isArray(search.results) ? search.results : []
      for (const result of results) {
        if (resources.length >= maxResources) break
        if (!isRecord(result) || typeof result.id !== 'string') continue
        const resource = await this.contextResourceForSeed({ kind: 'node', id: result.id })
        if (resource) resources.push(resource)
      }
    }

    return {
      id: this.nextId('ctx'),
      query: options.query,
      seeds: options.seeds ?? [],
      resources,
      createdAt: this.nowIso(),
      limits: {
        maxResources,
        maxCharactersPerResource: this.limits.maxCharactersPerResource
      }
    }
  }

  // ─── Pages ────────────────────────────────────────────────────────────────

  private async readPageMarkdown(
    pageId: string,
    includeFrontmatter: boolean,
    uri = `xnet://page/${encodeURIComponent(pageId)}.md`
  ): Promise<AiResourceContent> {
    const node = await this.getNodeOrThrow(pageId)
    const markdown = renderPageMarkdown(node, includeFrontmatter, this.nowIso())
    return {
      uri,
      mimeType: 'text/markdown',
      text: limitText(markdown, this.limits.maxCharactersPerResource)
    }
  }

  private async readPageOutline(pageId: string): Promise<Record<string, unknown>> {
    const content = await this.readPageMarkdown(pageId, false)
    const headings = content.text
      .split('\n')
      .map((line, index) => ({ line, lineNumber: index + 1 }))
      .map(({ line, lineNumber }) => {
        const match = /^(#{1,6})\s+(.+)$/.exec(line)
        return match
          ? {
              level: match[1].length,
              title: match[2].trim(),
              lineNumber
            }
          : null
      })
      .filter(
        (heading): heading is { level: number; title: string; lineNumber: number } =>
          heading !== null
      )

    return {
      pageId,
      revision: revisionForNode(await this.getNodeOrThrow(pageId)),
      headings
    }
  }

  private async planPagePatch(args: Record<string, unknown>): Promise<AiMutationPlan> {
    const pageId = readRequiredString(args, 'pageId')
    const node = await this.getNodeOrThrow(pageId)
    const markdown = readRequiredString(args, 'markdown')
    const baseRevision = readOptionalString(args, 'baseRevision') ?? revisionForNode(node)
    const currentMarkdown = renderPageMarkdown(node, true, this.nowIso())
    const markdownValidation = validateXNetPageMarkdown(markdown, {
      pageId,
      schemaId: node.schemaId,
      baseRevision
    })
    const warnings =
      baseRevision === revisionForNode(node)
        ? []
        : ['baseRevision does not match the live node revision']

    return this.validatedPlan({
      actor: readOptionalString(args, 'actor') ?? 'ai-agent',
      intent: readOptionalString(args, 'intent') ?? 'Plan page Markdown patch',
      risk: 'medium',
      requiredScopes: ['page.read', 'page.propose'],
      changes: [
        {
          targetKind: 'page',
          targetId: pageId,
          baseRevision,
          operations: [
            createAiOperation('replaceMarkdown', {
              markdown,
              markdownHash: stableStringHash(markdown),
              markdownLength: markdown.length,
              directiveCount: markdownValidation.directives.length,
              diff: renderMarkdownLineDiff(currentMarkdown, markdown)
            })
          ]
        }
      ],
      warnings: [...warnings, ...markdownValidation.validation.warnings],
      errors: markdownValidation.validation.errors
    })
  }

  // ─── Databases ────────────────────────────────────────────────────────────

  private async describeDatabase(databaseId: string): Promise<Record<string, unknown>> {
    const database = await this.getNodeOrThrow(databaseId)
    const schema = await this.config.schemas.get(database.schemaId)
    return {
      database: summarizeNode(database),
      revision: revisionForNode(database),
      schema,
      columns:
        readArrayProperty(database, 'columns') ??
        readNestedArrayProperty(database, 'schema', 'columns') ??
        [],
      rowSchemaId: readStringProperty(database, 'rowSchemaId'),
      rowCount: database.properties.rowCount
    }
  }

  private async readDatabaseViews(databaseId: string): Promise<Record<string, unknown>> {
    const database = await this.getNodeOrThrow(databaseId)
    return {
      databaseId,
      revision: revisionForNode(database),
      defaultView: database.properties.defaultView,
      views: readArrayProperty(database, 'views') ?? []
    }
  }

  private async queryDatabase(options: {
    databaseId: string
    schemaId?: string
    limit?: number
    offset?: number
  }): Promise<Record<string, unknown>> {
    const database = await this.getNodeOrThrow(options.databaseId)
    const limit = clampLimit(options.limit, this.limits.maxDatabaseRows)
    const offset = Math.max(0, options.offset ?? 0)
    const schemaId = options.schemaId ?? readStringProperty(database, 'rowSchemaId')
    const scanLimit = Math.max(limit + offset, this.limits.maxDatabaseRows)
    const nodes = await this.config.store.list({ schemaId, limit: scanLimit, offset: 0 })
    const rows = nodes
      .filter((node) => !node.deleted && belongsToDatabase(node, options.databaseId))
      .slice(offset, offset + limit)

    return {
      databaseId: options.databaseId,
      databaseRevision: revisionForNode(database),
      schemaId,
      limit,
      offset,
      count: rows.length,
      rows
    }
  }

  // ─── Canvases ─────────────────────────────────────────────────────────────

  private async readCanvasViewport(options: {
    canvasId: string
    x?: number
    y?: number
    w?: number
    h?: number
    includeSourcePreviews: boolean
  }): Promise<Record<string, unknown>> {
    const canvas = await this.getNodeOrThrow(options.canvasId)
    const bounds = normalizeBounds(options)
    const objects = (
      readArrayProperty(canvas, 'objects') ??
      readArrayProperty(canvas, 'nodes') ??
      []
    )
      .filter(isRecord)
      .filter((object) => !bounds || intersectsBounds(object, bounds))
      .slice(0, this.limits.maxCanvasObjects)
    const objectIds = new Set(
      objects.map((object) => readRecordString(object, 'id')).filter(Boolean)
    )
    const edges = (
      readArrayProperty(canvas, 'edges') ??
      readArrayProperty(canvas, 'connectors') ??
      []
    )
      .filter(isRecord)
      .filter((edge) => edgeTouchesVisibleObjects(edge, objectIds))

    return {
      canvasId: options.canvasId,
      revision: revisionForNode(canvas),
      bounds,
      objects,
      edges,
      sourcePreviews: options.includeSourcePreviews ? await this.hydrateSourcePreviews(objects) : []
    }
  }

  private async readCanvasObject(
    canvasId: string,
    objectId: string
  ): Promise<Record<string, unknown>> {
    const viewport = await this.readCanvasViewport({
      canvasId,
      includeSourcePreviews: true
    })
    const objects = Array.isArray(viewport.objects) ? viewport.objects : []
    const object = objects.find(
      (candidate) => isRecord(candidate) && readRecordString(candidate, 'id') === objectId
    )
    if (!object) throw new Error(`Canvas object not found: ${objectId}`)
    return {
      canvasId,
      object,
      sourcePreviews: viewport.sourcePreviews
    }
  }

  private async hydrateSourcePreviews(objects: Record<string, unknown>[]): Promise<unknown[]> {
    const previews: unknown[] = []
    for (const object of objects) {
      const sourceNodeId =
        readRecordString(object, 'sourceNodeId') ??
        readRecordString(object, 'nodeId') ??
        readRecordString(object, 'fileNodeId')
      if (!sourceNodeId) continue
      const node = await this.config.store.get(sourceNodeId)
      if (node) {
        previews.push(summarizeNode(node))
      }
    }
    return previews
  }

  // ─── Plan Helpers ─────────────────────────────────────────────────────────

  private async planSurfaceMutation(input: {
    targetKind: 'database' | 'canvas'
    targetId: string
    baseRevision?: string
    operations: AiOperation[]
    actor: string
    intent: string
    requiredScopes: AiScope[]
  }): Promise<AiMutationPlan> {
    const target = await this.getNodeOrThrow(input.targetId)
    return this.validatedPlan({
      actor: input.actor,
      intent: input.intent,
      risk: riskForOperations(input.operations),
      requiredScopes: input.requiredScopes,
      changes: [
        {
          targetKind: input.targetKind,
          targetId: input.targetId,
          baseRevision: input.baseRevision ?? revisionForNode(target),
          operations: input.operations
        }
      ],
      warnings:
        input.baseRevision && input.baseRevision !== revisionForNode(target)
          ? ['baseRevision does not match the live node revision']
          : [],
      errors: []
    })
  }

  private validatedPlan(input: {
    actor: string
    intent: string
    risk: AiRiskLevel
    requiredScopes: AiScope[]
    changes: AiChangeSet[]
    warnings: string[]
    errors: string[]
  }): AiMutationPlan {
    const plan = attachAiPlanValidation({
      id: this.nextId('plan'),
      actor: input.actor,
      intent: input.intent,
      risk: input.risk,
      requiredScopes: input.requiredScopes,
      changes: input.changes,
      validation: { valid: true, errors: [], warnings: [] },
      createdAt: this.nowIso(),
      status: 'proposed'
    })

    return {
      ...plan,
      status: plan.validation.valid && input.errors.length === 0 ? plan.status : 'proposed',
      validation: {
        ...plan.validation,
        valid: plan.validation.valid && input.errors.length === 0,
        errors: [...plan.validation.errors, ...input.errors],
        warnings: [...plan.validation.warnings, ...input.warnings]
      }
    }
  }

  // ─── Internal Helpers ─────────────────────────────────────────────────────

  private async getNodeOrThrow(id: string): Promise<NodeData> {
    const node = await this.config.store.get(id)
    if (!node) throw new Error(`Node not found: ${id}`)
    return node
  }

  private async getNodeProjection(id: string): Promise<Record<string, unknown>> {
    const node = await this.getNodeOrThrow(id)
    return {
      node,
      summary: summarizeNode(node),
      revision: revisionForNode(node)
    }
  }

  private async getSchemaSummaries(
    includeProperties: boolean
  ): Promise<Array<Record<string, unknown>>> {
    const iris = this.config.schemas.getAllIRIs()
    const schemas = await Promise.all(
      iris.map((iri) => this.readSchemaSummary(iri, includeProperties))
    )
    return schemas.filter((schema): schema is Record<string, unknown> => schema !== null)
  }

  private async readSchemaSummary(
    iri: string,
    includeProperties: boolean
  ): Promise<Record<string, unknown> | null> {
    const schema = await this.config.schemas.get(iri)
    if (!schema) return null
    return {
      iri,
      name: schema.name,
      ...(includeProperties ? { properties: schema.properties } : {})
    }
  }

  private async contextResourceForSeed(seed: AiContextSeed): Promise<AiContextPackResource | null> {
    const uri = uriForSeed(seed)
    if (!uri) return null

    try {
      const content = await this.readResource(uri)
      return {
        uri: content.uri,
        mimeType: content.mimeType,
        text: limitText(content.text, this.limits.maxCharactersPerResource),
        citation: {
          kind: seed.kind,
          id: seed.id,
          revision:
            seed.kind === 'node' ? revisionForNode(await this.getNodeOrThrow(seed.id)) : undefined
        }
      }
    } catch {
      return null
    }
  }

  private jsonResource(uri: string, value: unknown): AiResourceContent {
    return {
      uri,
      mimeType: 'application/json',
      text: this.stringifyJson(value)
    }
  }

  private stringifyJson(value: unknown): string {
    const text = JSON.stringify(value, null, 2)
    if (text.length <= this.limits.maxJsonCharacters) return text

    return JSON.stringify(
      {
        truncated: true,
        originalCharLength: text.length,
        preview: text.slice(0, this.limits.maxJsonCharacters)
      },
      null,
      2
    )
  }

  private nextId(prefix: string): string {
    this.sequence += 1
    return `${prefix}_${this.clock().getTime().toString(36)}_${this.sequence.toString(36)}`
  }

  private nowIso(): string {
    return this.clock().toISOString()
  }
}

// ─── Factory ────────────────────────────────────────────────────────────────

export function createAiSurfaceService(config: AiSurfaceServiceConfig): AiSurfaceService {
  return new AiSurfaceService(config)
}

// ─── Pure Helpers ───────────────────────────────────────────────────────────

function createResource(
  uri: string,
  name: string,
  description: string,
  mimeType: string,
  risk: AiRiskLevel,
  requiredScopes: AiScope[],
  dynamic = false
): AiResource {
  return {
    uri,
    name,
    description,
    mimeType,
    risk,
    requiredScopes,
    dynamic
  }
}

function parseXNetUri(uri: string): {
  host: string
  parts: string[]
  searchParams: URLSearchParams
} {
  let parsed: URL
  try {
    parsed = new URL(uri)
  } catch {
    throw new Error(`Invalid xNet resource URI: ${uri}`)
  }
  if (parsed.protocol !== 'xnet:') {
    throw new Error(`Invalid xNet resource URI: ${uri}`)
  }
  return {
    host: parsed.hostname,
    parts: parsed.pathname
      .split('/')
      .filter(Boolean)
      .map((part) => decodeURIComponent(part)),
    searchParams: parsed.searchParams
  }
}

function renderPageMarkdown(
  node: NodeData,
  includeFrontmatter: boolean,
  exportedAt: string
): string {
  const title = readStringProperty(node, 'title') ?? 'Untitled Page'
  const body = readMarkdownBody(node)
  const heading = body.trimStart().startsWith('#') ? '' : `# ${title}\n\n`
  const content = `${heading}${body}`.trimEnd()

  if (!includeFrontmatter) return `${content}\n`

  return `---\nxnet:\n  id: ${quoteYaml(node.id)}\n  schemaId: ${quoteYaml(node.schemaId)}\n  revision: ${quoteYaml(
    revisionForNode(node)
  )}\n  exportedAt: ${quoteYaml(exportedAt)}\n---\n\n${content}\n`
}

function readMarkdownBody(node: NodeData): string {
  const value =
    readStringProperty(node, 'markdown') ??
    readStringProperty(node, 'content') ??
    readStringProperty(node, 'body') ??
    readStringProperty(node, 'text') ??
    readStringProperty(node, 'description')

  if (value) return value

  const richContent = node.properties.content
  if (isRecord(richContent)) {
    return `\`\`\`json\n${JSON.stringify(richContent, null, 2)}\n\`\`\``
  }

  return ''
}

function summarizeNodes(nodes: NodeData[]): Array<Record<string, unknown>> {
  return nodes.map(summarizeNode)
}

function summarizeNode(node: NodeData): Record<string, unknown> {
  return {
    id: node.id,
    schemaId: node.schemaId,
    title: nodeTitle(node),
    deleted: node.deleted,
    createdAt: node.createdAt,
    updatedAt: node.updatedAt,
    revision: revisionForNode(node)
  }
}

function sortRecent(nodes: NodeData[]): NodeData[] {
  return [...nodes].sort((a, b) => b.updatedAt - a.updatedAt)
}

function scoreNode(node: NodeData, normalizedQuery: string): AiSearchResult | null {
  const searchable = searchableText(node).toLocaleLowerCase()
  const index = searchable.indexOf(normalizedQuery)
  if (index === -1) return null

  const title = nodeTitle(node)
  const titleMatch = title.toLocaleLowerCase().includes(normalizedQuery)
  return {
    id: node.id,
    schemaId: node.schemaId,
    title,
    snippet: createSnippet(searchableText(node), index, normalizedQuery.length),
    score: (titleMatch ? 10 : 1) + Math.max(0, 5 - index / 100),
    revision: revisionForNode(node),
    updatedAt: node.updatedAt
  }
}

function searchableText(node: NodeData): string {
  const values = Object.entries(node.properties).flatMap(([key, value]) => [
    key,
    typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
      ? String(value)
      : ''
  ])
  return [node.id, node.schemaId, ...values].filter(Boolean).join('\n')
}

function createSnippet(text: string, index: number, queryLength: number): string {
  const start = Math.max(0, index - 80)
  const end = Math.min(text.length, index + queryLength + 120)
  const prefix = start > 0 ? '...' : ''
  const suffix = end < text.length ? '...' : ''
  return `${prefix}${text.slice(start, end)}${suffix}`
}

function nodeTitle(node: NodeData): string {
  return readStringProperty(node, 'title') ?? readStringProperty(node, 'name') ?? node.id
}

function revisionForNode(node: NodeData): string {
  return `updatedAt:${node.updatedAt}`
}

function readStringProperty(node: NodeData, property: string): string | undefined {
  const value = node.properties[property]
  return typeof value === 'string' && value.trim() ? value : undefined
}

function readArrayProperty(node: NodeData, property: string): unknown[] | undefined {
  const value = node.properties[property]
  return Array.isArray(value) ? value : undefined
}

function readNestedArrayProperty(
  node: NodeData,
  objectProperty: string,
  arrayProperty: string
): unknown[] | undefined {
  const value = node.properties[objectProperty]
  return isRecord(value) && Array.isArray(value[arrayProperty]) ? value[arrayProperty] : undefined
}

function belongsToDatabase(node: NodeData, databaseId: string): boolean {
  return (
    readStringProperty(node, 'databaseId') === databaseId ||
    readStringProperty(node, 'database') === databaseId ||
    readStringProperty(node, 'parentDatabaseId') === databaseId
  )
}

function normalizeBounds(options: {
  x?: number
  y?: number
  w?: number
  h?: number
}): { x: number; y: number; w: number; h: number } | null {
  const { x, y, w, h } = options
  if (x === undefined || y === undefined || w === undefined || h === undefined) return null
  return { x, y, w, h }
}

function intersectsBounds(
  object: Record<string, unknown>,
  bounds: { x: number; y: number; w: number; h: number }
): boolean {
  const x = readRecordNumber(object, 'x') ?? 0
  const y = readRecordNumber(object, 'y') ?? 0
  const width = readRecordNumber(object, 'width') ?? readRecordNumber(object, 'w') ?? 0
  const height = readRecordNumber(object, 'height') ?? readRecordNumber(object, 'h') ?? 0

  return (
    x < bounds.x + bounds.w &&
    x + width > bounds.x &&
    y < bounds.y + bounds.h &&
    y + height > bounds.y
  )
}

function edgeTouchesVisibleObjects(
  edge: Record<string, unknown>,
  objectIds: Set<string | undefined>
): boolean {
  if (objectIds.size === 0) return true
  const from = readRecordString(edge, 'from') ?? readRecordString(edge, 'fromObjectId')
  const to = readRecordString(edge, 'to') ?? readRecordString(edge, 'toObjectId')
  return objectIds.has(from) || objectIds.has(to)
}

function riskForOperations(operations: AiOperation[]): AiRiskLevel {
  const names = operations.map((operation) => operation.op.toLocaleLowerCase())
  if (names.some((name) => name.includes('recovery') || name.includes('restore'))) return 'critical'
  if (
    names.some(
      (name) => name.includes('delete') || name.includes('drop') || name.includes('remove')
    )
  ) {
    return 'high'
  }
  return 'medium'
}

function readOperations(value: unknown): AiOperation[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error('operations must contain at least one operation')
  }

  return value.map((operation, index) => {
    if (!isRecord(operation) || typeof operation.op !== 'string') {
      throw new Error(`operations[${index}].op must be a string`)
    }
    const args = isRecord(operation.args) ? operation.args : {}
    return createAiOperation(
      operation.op,
      args,
      typeof operation.rationale === 'string' ? operation.rationale : undefined
    )
  })
}

function readContextSeeds(value: unknown): AiContextSeed[] {
  if (!Array.isArray(value)) return []
  return value
    .map((seed) => {
      if (!isRecord(seed)) return null
      const kind = typeof seed.kind === 'string' ? (seed.kind as AiTargetKind) : null
      const id = typeof seed.id === 'string' ? seed.id : null
      return kind && id ? { kind, id } : null
    })
    .filter((seed): seed is AiContextSeed => seed !== null)
}

function uriForSeed(seed: AiContextSeed): string | null {
  switch (seed.kind) {
    case 'node':
      return `xnet://node/${encodeURIComponent(seed.id)}`
    case 'page':
      return `xnet://page/${encodeURIComponent(seed.id)}.md`
    case 'database':
      return `xnet://database/${encodeURIComponent(seed.id)}/schema`
    case 'canvas':
      return `xnet://canvas/${encodeURIComponent(seed.id)}/viewport`
    default:
      return null
  }
}

function stableStringHash(value: string): string {
  let hash = 0
  for (let index = 0; index < value.length; index++) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0
  }
  return hash.toString(16).padStart(8, '0')
}

function clampLimit(value: number | undefined, max: number): number {
  if (value === undefined || Number.isNaN(value)) return max
  return Math.max(1, Math.min(Math.floor(value), max))
}

function limitText(value: string, maxCharacters: number): string {
  if (value.length <= maxCharacters) return value
  return `${value.slice(0, maxCharacters)}\n...[truncated ${value.length - maxCharacters} characters]`
}

function quoteYaml(value: string): string {
  return JSON.stringify(value)
}

function readRequiredString(record: Record<string, unknown>, key: string): string {
  const value = record[key]
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${key} must be a non-empty string`)
  }
  return value
}

function readOptionalString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key]
  return typeof value === 'string' && value.trim() ? value : undefined
}

function readOptionalNumber(record: Record<string, unknown>, key: string): number | undefined {
  const value = record[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function readOptionalBoolean(record: Record<string, unknown>, key: string): boolean | undefined {
  const value = record[key]
  return typeof value === 'boolean' ? value : undefined
}

function readUrlNumber(params: URLSearchParams, key: string): number | undefined {
  const value = params.get(key)
  if (value === null) return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

function readRecordString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key]
  return typeof value === 'string' && value.trim() ? value : undefined
}

function readRecordNumber(record: Record<string, unknown>, key: string): number | undefined {
  const value = record[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
