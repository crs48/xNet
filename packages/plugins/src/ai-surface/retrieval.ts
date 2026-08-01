/**
 * The one place an agent lane builds its retrieval (exploration 0415).
 *
 * `createWorkspaceRetrieval` in `@xnetjs/brain` is structural and knows nothing
 * about schemas; this adapter supplies the missing half — relation fields
 * resolved from a live `SchemaRegistryAPI` — and gives the CLI, the MCP server
 * and the Electron bridge a single call to make.
 *
 * `scripts/guard-ai-surface-retrieval.mjs` fails the build if an AI surface or
 * MCP server is constructed without going through here. A rule nothing enforces
 * lasts exactly one refactor.
 */

import type { SchemaRegistryAPI } from '../services/local-api'
import {
  ALLOW_ALL_NODES,
  createWorkspaceRetrieval,
  type Authorizer,
  type EntrySearch,
  type RelationFieldsLookup,
  type RetrievalBudget,
  type RetrievalStore,
  type WorkspaceRetrieval
} from '@xnetjs/brain'

export type {
  RecallResult,
  RetrievalTier,
  WorkspaceRetrieval,
  WorkspaceRetrievalOptions
} from '@xnetjs/brain'
export { ALLOW_ALL_NODES, isDegradedTier } from '@xnetjs/brain'

/**
 * Relation-valued property names per schema, read from a live registry and
 * memoized (the graph walk asks once per node).
 *
 * A registry lookup that throws resolves to `[]` — no edges — rather than
 * failing the whole retrieval: a schema we cannot read is a graph we cannot
 * walk, which is a smaller answer, not a wrong one.
 */
export function schemaRegistryRelationFields(schemas: SchemaRegistryAPI): RelationFieldsLookup {
  const cache = new Map<string, readonly string[]>()
  return async (schemaId: string) => {
    const cached = cache.get(schemaId)
    if (cached) return cached
    let fields: readonly string[] = []
    try {
      const defined = await schemas.get(schemaId)
      if (defined) fields = relationFieldNames(defined.properties)
    } catch {
      // Unreadable schema → no edges. See the doc comment above.
    }
    cache.set(schemaId, fields)
    return fields
  }
}

/**
 * Relation property names, from either shape a registry hands back.
 *
 * The two agent backends disagree: the CLI's built-in registry returns the
 * JSON-LD **array** (`[{ name, type, … }]`), while the Electron renderer maps
 * it to a keyed **record** (`{ page: { type } }`). Handling only one shape is a
 * silent failure — the tier still reports `bm25-graph` while the graph stage
 * quietly finds no edges at all, which is exactly how this was found.
 */
export function relationFieldNames(properties: unknown): string[] {
  if (Array.isArray(properties)) {
    return properties
      .filter(
        (property): property is { name: string } =>
          isRelationProperty(property) && typeof (property as { name?: unknown }).name === 'string'
      )
      .map((property) => property.name)
  }
  if (typeof properties === 'object' && properties !== null) {
    return Object.entries(properties as Record<string, unknown>)
      .filter(([, value]) => isRelationProperty(value))
      .map(([name]) => name)
  }
  return []
}

function isRelationProperty(value: unknown): boolean {
  return (
    typeof value === 'object' && value !== null && (value as { type?: unknown }).type === 'relation'
  )
}

export type AgentRetrievalOptions = {
  store: RetrievalStore
  schemas: SchemaRegistryAPI
  /**
   * Read gate. Defaults to {@link ALLOW_ALL_NODES}, which is correct for the
   * single-user CLI and desktop lanes where the caller *is* the store owner and
   * the store already applied its own read authorization. A shared or
   * passport-scoped lane must pass its own.
   */
  authorize?: Authorizer
  /** Semantic entry search, when a lane has a warm vector tier. */
  semanticEntrySearch?: EntrySearch
  budget?: Partial<RetrievalBudget>
}

/**
 * Build retrieval for an agent lane.
 *
 * @example
 * ```ts
 * const retrieval = createAgentRetrieval({ store, schemas })
 * createAiSurfaceService({ store, schemas, retrieveContext: retrieval.retrieveContext })
 * ```
 */
export function createAgentRetrieval(options: AgentRetrievalOptions): WorkspaceRetrieval {
  return createWorkspaceRetrieval({
    store: options.store,
    relationFieldsOf: schemaRegistryRelationFields(options.schemas),
    authorize: options.authorize ?? ALLOW_ALL_NODES,
    ...(options.semanticEntrySearch ? { semanticEntrySearch: options.semanticEntrySearch } : {}),
    ...(options.budget ? { budget: options.budget } : {})
  })
}
