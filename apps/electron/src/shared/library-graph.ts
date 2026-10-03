import type { LibraryResource } from './library'

export type LibraryGraphKind = 'link' | 'collection' | 'creator' | 'tag' | 'category'
export type LibraryGraphRelation = Exclude<LibraryGraphKind, 'link'>
export type LibraryGraphNode = {
  id: string
  kind: LibraryGraphKind
  label: string
  platform: string
  url?: string
}
export type LibraryGraphEdge = {
  source: number
  target: number
  kind: LibraryGraphRelation
  evidence: 'import' | 'metadata' | 'hashtag'
}
export type LibraryGraph = {
  nodes: LibraryGraphNode[]
  edges: LibraryGraphEdge[]
  resourceCount: number
  linkCount: number
  warnings: string[]
  builtAt: number
}
export type LibraryGraphDetail = {
  resource: LibraryResource | null
  source: Record<string, unknown> | null
}
