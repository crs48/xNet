import { describe, expect, it } from 'vitest'
import { fixtureAdapter } from '../spatial/fixtures'
import { selectGraph, relationKinds } from './library-graph/model'
import { graphSearchIndex, searchGraph } from './library-graph/navigation'
import { projectSpatialSnapshot, validateSpatialSnapshot } from './spatial-library'

describe('spatial snapshots', () => {
  it('rejects mismatched revisions, invalid positions, duplicate identities and bad edges', async () => {
    const snapshot = await fixtureAdapter(1000).snapshot(new AbortController().signal)
    expect(validateSpatialSnapshot(snapshot)).toBe(snapshot)
    expect(() => validateSpatialSnapshot({ ...snapshot, layoutRevision: 'other' })).toThrow()
    expect(() => validateSpatialSnapshot({ ...snapshot, positions: [NaN] })).toThrow()
    expect(() =>
      validateSpatialSnapshot({
        ...snapshot,
        graph: {
          ...snapshot.graph,
          nodes: [snapshot.graph.nodes[0], ...snapshot.graph.nodes.slice(0, -1)]
        }
      })
    ).toThrow()
    expect(() =>
      validateSpatialSnapshot({
        ...snapshot,
        graph: { ...snapshot.graph, edges: [{ ...snapshot.graph.edges[0], source: -1 }] }
      })
    ).toThrow()
  })
  it('retains resource coordinates under source, group and neighborhood filtering', async () => {
    const snapshot = await fixtureAdapter(1000).snapshot(new AbortController().signal)
    const visible = selectGraph(snapshot.graph, 'youtube', relationKinds, null, ['group:0'])
    const projected = projectSpatialSnapshot(snapshot, visible)
    for (const [i, node] of visible.nodes.entries()) {
      const old = snapshot.graph.nodes.findIndex((n) => n.id === node.id)
      expect(projected.positions.slice(i * 3, i * 3 + 3)).toEqual(
        snapshot.positions.slice(old * 3, old * 3 + 3)
      )
    }
    expect(visible.linkCount).toBeGreaterThan(0)
    expect(visible.linkCount).toBeLessThan(1000)
  })
  it('keeps the full fixture searchable independently of rendering budgets', async () => {
    const snapshot = await fixtureAdapter(56_000).snapshot(new AbortController().signal)
    expect(snapshot.graph.linkCount).toBe(56_000)
    expect(
      searchGraph(graphSearchIndex(snapshot.graph), 'Learning resource 56000').items[0].node.id
    ).toBe('demo:55999')
  })
})
