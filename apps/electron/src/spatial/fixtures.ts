import type { SpatialLibraryAdapter } from '../shared/spatial-library'
import { createSpatialSnapshot } from '../shared/spatial-library'

export function fixtureAdapter(count: number): SpatialLibraryAdapter {
  const groups = ['collection', 'tag', 'category', 'creator'] as const
  const snapshot = createSpatialSnapshot(
    {
      nodes: [
        ...Array.from({ length: count }, (_, i) => ({
          id: `demo:${i}`,
          label: `Learning resource ${i + 1}`,
          kind: 'link' as const,
          platform: ['youtube', 'github', 'web'][i % 3],
          url: `https://example.org/resource/${i + 1}`
        })),
        ...Array.from({ length: 40 }, (_, i) => ({
          id: `group:${i}`,
          label: `${groups[i % 4]} ${i + 1}`,
          kind: groups[i % 4],
          platform: ''
        }))
      ],
      edges: Array.from({ length: count * 2 }, (_, i) => ({
        source: Math.floor(i / 2),
        target: count + (i % 40),
        kind: groups[i % 4],
        evidence: 'import' as const
      })),
      linkCount: count,
      resourceCount: count,
      builtAt: 0,
      warnings: ['Synthetic data. No personal Library content is loaded.']
    },
    `synthetic-${count}-v1`
  )
  return {
    snapshot: async () => snapshot,
    detail: async (id) => {
      const node = snapshot.graph.nodes.find((node) => node.id === id)
      return node
        ? {
            id,
            title: node.label,
            description:
              'A synthetic saved link for testing selection, search, filters and headset performance.',
            platform: node.platform,
            author: 'Demo',
            coverage: { description: { state: 'partial', reason: 'Synthetic preview only' } },
            transcript: null,
            thumbnail: false
          }
        : null
    },
    thumbnail: async () => null,
    close() {}
  }
}
