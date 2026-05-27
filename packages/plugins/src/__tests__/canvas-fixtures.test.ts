/**
 * Canvas plugin fixture tests.
 */

import { describe, expect, it } from 'vitest'
import {
  CANVAS_PLUGIN_FIXTURES,
  createCanvasPluginFixtureCards,
  createCanvasPluginFixtureManifests,
  getCanvasPluginFixture
} from '../fixtures/canvas'
import { validateManifest } from '../manifest'
import { PluginRegistry } from '../registry'

function createMockStore() {
  const nodes: Record<string, unknown>[] = []

  return {
    list: async () => nodes,
    create: async (options: { schemaId: string; properties: Record<string, unknown> }) => {
      const node = {
        id: `node-${nodes.length}`,
        schemaId: options.schemaId,
        properties: options.properties
      }
      nodes.push(node)
      return node
    },
    delete: async (id: string) => {
      const index = nodes.findIndex((node) => node.id === id)
      if (index >= 0) {
        nodes.splice(index, 1)
      }
    },
    subscribe: () => () => {},
    _nodes: nodes
  }
}

describe('canvas plugin fixtures', () => {
  it('provides CRM, ERP, and media provider fixture manifests', () => {
    expect(CANVAS_PLUGIN_FIXTURES.map((fixture) => fixture.kind)).toEqual([
      'crm',
      'erp',
      'media-provider'
    ])

    for (const manifest of createCanvasPluginFixtureManifests()) {
      expect(() => validateManifest(manifest)).not.toThrow()
      expect(manifest.contributes?.canvasCards?.length).toBeGreaterThan(0)
    }
  })

  it('installs fixture manifests into the plugin contribution registry', async () => {
    const registry = new PluginRegistry(createMockStore() as any, 'web')

    for (const manifest of createCanvasPluginFixtureManifests()) {
      await registry.install(manifest)
    }

    const contributions = registry.getContributions()

    expect(contributions.canvasCards.get('crm.account-card')?.provider).toBe('crm')
    expect(contributions.canvasCards.get('erp.purchase-order-card')?.schemaId).toBe(
      'xnet://fixtures.erp/purchase-order'
    )
    expect(contributions.canvasCards.get('media.youtube-video-card')?.previewTiers).toContain(
      'live'
    )
    expect(contributions.canvasIngestors.get('media.url-ingestor')?.urlPatterns).toContain(
      'https://open.spotify.com/*'
    )
    expect(contributions.canvasEdges.get('erp.supplies')?.label).toBe('supplies')
  })

  it('keeps sample cards aligned with their manifest card contributions', () => {
    const manifests = createCanvasPluginFixtureManifests()
    const contributionIds = new Set(
      manifests.flatMap((manifest) =>
        (manifest.contributes?.canvasCards ?? []).map((contribution) => contribution.id)
      )
    )

    for (const card of createCanvasPluginFixtureCards()) {
      expect(contributionIds.has(card.contributionId)).toBe(true)
      expect(card.pluginId).toMatch(/^com\.xnet\.fixtures\./)
      expect(card.title.length).toBeGreaterThan(0)
      expect(card.properties).not.toEqual({})
    }
  })

  it('returns individual fixtures by kind', () => {
    expect(getCanvasPluginFixture('crm')?.manifest.id).toBe('com.xnet.fixtures.crm')
    expect(getCanvasPluginFixture('erp')?.manifest.id).toBe('com.xnet.fixtures.erp')
    expect(getCanvasPluginFixture('media-provider')?.manifest.id).toBe('com.xnet.fixtures.media')
  })
})
