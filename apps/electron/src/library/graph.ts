import type { LibraryStore } from './store'
import type { DataService } from '../data-process/data-service'
import type { LibraryGraph, LibraryGraphKind, LibraryGraphRelation } from '../shared/library-graph'
import {
  SocialCollectionSchema,
  SocialCollectionItemSchema,
  SocialContentSchema
} from '@xnetjs/social/schemas'

export type GraphResource = {
  id: string
  resourceKind?: string | null
  url: string
  title: string
  platform: string
  provider: string
  author: string
  hashtags: string[]
}

const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '')
const normalized = (value: string) => value.normalize('NFKC').toLocaleLowerCase('en-US')
const labels = (value: unknown): string[] =>
  Array.isArray(value)
    ? value
        .map((item: unknown) =>
          typeof item === 'string'
            ? item
            : item && typeof item === 'object' && 'text' in item
              ? text(item.text)
              : ''
        )
        .filter(Boolean)
    : []

export const hashtagsIn = (value: string): string[] => [
  ...new Set(
    Array.from(
      value.matchAll(/(?:^|\s)#([\p{L}\p{N}_][\p{L}\p{N}_-]{0,79})(?=\s|[.,!?;:]|$)/gu),
      (match) => match[1]
    )
  )
]

/** Hubs preserve source relationships without expanding a playlist into a quadratic clique. */
export function createGraphBuilder(allResources: GraphResource[], resourceCount: number) {
  // A conversation can carry an HTTP source URL. A URL alone is not permission
  // to include its title, hashtags or relationships in the saved-link projection.
  const resources = allResources.filter((resource) => !resource.resourceKind)
  const graph: LibraryGraph = {
    nodes: resources.map((resource) => ({
      id: resource.id,
      label: resource.title || resource.url,
      url: resource.url,
      platform: resource.platform,
      kind: 'link'
    })),
    edges: [],
    linkCount: resources.length,
    resourceCount,
    warnings: [],
    builtAt: Date.now()
  }
  const index = new Map(graph.nodes.map((node, i) => [node.id, i]))
  const edges = new Set<string>()
  let unreadable = 0
  const hub = (kind: LibraryGraphKind, key: string, label: string, platform = '') => {
    const id = `${kind}:${key}`
    const previous = index.get(id)
    if (previous !== undefined) return previous
    const position = graph.nodes.length
    index.set(id, position)
    graph.nodes.push({ id, kind, label, platform })
    return position
  }
  const connect = (
    id: string,
    target: number,
    kind: LibraryGraphRelation,
    evidence: 'import' | 'metadata' | 'hashtag'
  ) => {
    const source = index.get(id)
    if (source === undefined || graph.nodes[source].kind !== 'link') return
    const key = `${source}:${target}`
    if (edges.has(key)) return
    edges.add(key)
    graph.edges.push({ source, target, kind, evidence })
  }
  const tag = (id: string, label: string, evidence: 'import' | 'hashtag') => {
    const clean = label.trim().replace(/^#/, '')
    if (clean) connect(id, hub('tag', normalized(clean), `#${clean}`), 'tag', evidence)
  }
  for (const resource of resources) {
    if (resource.author.trim())
      connect(
        resource.id,
        hub(
          'creator',
          `${resource.provider}:${normalized(resource.author)}`,
          resource.author,
          resource.provider
        ),
        'creator',
        'metadata'
      )
    resource.hashtags.forEach((label) => tag(resource.id, label, 'hashtag'))
  }
  return {
    collection(id: string, properties: Record<string, unknown>) {
      const label = text(properties.title) || 'Untitled collection'
      hub('collection', id, label, text(properties.platform))
    },
    membership(properties: Record<string, unknown>) {
      const target = index.get(`collection:${text(properties.collection)}`)
      if (target !== undefined) connect(text(properties.item), target, 'collection', 'import')
    },
    content(id: string, properties: Record<string, unknown>) {
      // Garden commentary belongs to the saved link, not to a duplicate link node.
      const resourceId =
        properties.platformContentKind === 'garden-commentary' ? text(properties.parentContent) : id
      if (!index.has(resourceId)) return
      const raw = text(properties.metadataJson)
      if (!raw) return
      let metadata: Record<string, unknown>
      try {
        const parsed: unknown = JSON.parse(raw)
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
          throw new Error('Invalid metadata')
        metadata = parsed as Record<string, unknown>
      } catch {
        unreadable++
        return
      }
      for (const label of [
        ...labels(metadata.tags),
        ...labels(metadata.topics),
        ...labels(metadata.hashtags)
      ])
        tag(resourceId, label, 'import')
      const categories = [
        ...labels(metadata.categories),
        text(metadata.category),
        text(metadata.subreddit) ? `r/${text(metadata.subreddit).replace(/^r\//, '')}` : '',
        properties.platform === 'github' && text(metadata.language)
          ? `Language: ${text(metadata.language)}`
          : ''
      ]
      for (const label of categories.filter(Boolean))
        connect(resourceId, hub('category', normalized(label), label), 'category', 'import')
    },
    finish(): LibraryGraph {
      // An empty exported collection makes no claim about any link's membership.
      const used = new Set(graph.edges.flatMap((edge) => [edge.source, edge.target]))
      const remap = new Map<number, number>()
      const nodes = graph.nodes.filter((node, i) => {
        if (node.kind !== 'link' && !used.has(i)) return false
        remap.set(i, remap.size)
        return true
      })
      if (unreadable)
        graph.warnings.push(
          `${unreadable.toLocaleString()} source metadata records could not be read; their tag relationships are incomplete.`
        )
      return {
        ...graph,
        nodes,
        edges: graph.edges.map((edge) => ({
          ...edge,
          source: remap.get(edge.source)!,
          target: remap.get(edge.target)!
        }))
      }
    }
  }
}

export async function readLibraryGraph(
  data: Pick<DataService, 'listNodes'>,
  store: LibraryStore
): Promise<LibraryGraph> {
  const builder = createGraphBuilder(store.graphResources(), store.status().resources)
  for (const [schemaId, consume] of [
    [
      SocialCollectionSchema._schemaId,
      (id: string, props: Record<string, unknown>) => builder.collection(id, props)
    ],
    [
      SocialCollectionItemSchema._schemaId,
      (_id: string, props: Record<string, unknown>) => builder.membership(props)
    ],
    [
      SocialContentSchema._schemaId,
      (id: string, props: Record<string, unknown>) => builder.content(id, props)
    ]
  ] as const) {
    for (let offset = 0; ; offset += 500) {
      const nodes = await data.listNodes({
        schemaId,
        orderBy: { createdAt: 'asc' },
        limit: 500,
        offset
      })
      nodes.forEach((node) => consume(node.id, node.properties))
      if (nodes.length < 500) break
    }
  }
  return builder.finish()
}
