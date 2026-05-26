/**
 * Fake canvas plugin fixtures for CRM, ERP, and media-provider cards.
 */

import type { XNetExtension } from '../manifest'

export type CanvasPluginFixtureKind = 'crm' | 'erp' | 'media-provider'

export type CanvasPluginFixtureCardSample = {
  id: string
  pluginId: string
  contributionId: string
  title: string
  subtitle: string
  schemaId?: `xnet://${string}/${string}`
  provider?: string
  canvasKind: string
  previewTier: 'summary' | 'thumbnail' | 'shell' | 'live'
  properties: Record<string, unknown>
}

export type CanvasPluginFixture = {
  kind: CanvasPluginFixtureKind
  manifest: XNetExtension
  sampleCards: CanvasPluginFixtureCardSample[]
}

const CRM_SCHEMA_ACCOUNT = 'xnet://fixtures.crm/account'
const CRM_SCHEMA_OPPORTUNITY = 'xnet://fixtures.crm/opportunity'
const ERP_SCHEMA_PURCHASE_ORDER = 'xnet://fixtures.erp/purchase-order'
const ERP_SCHEMA_INVENTORY_ITEM = 'xnet://fixtures.erp/inventory-item'
const MEDIA_SCHEMA_EXTERNAL = 'xnet://fixtures.media/external-reference'

export const CRM_CANVAS_PLUGIN_FIXTURE: CanvasPluginFixture = {
  kind: 'crm',
  manifest: {
    id: 'com.xnet.fixtures.crm',
    name: 'Canvas CRM Fixture',
    version: '0.0.1',
    description: 'Development fixture for customer planning and pipeline canvas cards.',
    author: 'xNet',
    permissions: {
      schemas: {
        read: [CRM_SCHEMA_ACCOUNT, CRM_SCHEMA_OPPORTUNITY],
        create: [CRM_SCHEMA_ACCOUNT, CRM_SCHEMA_OPPORTUNITY]
      },
      capabilities: {
        storage: 'local'
      }
    },
    contributes: {
      canvasCards: [
        {
          id: 'crm.account-card',
          type: 'canvas.card',
          name: 'CRM Account Card',
          description: 'Renders account health, owner, renewal, and open pipeline.',
          icon: 'Building2',
          schemaId: CRM_SCHEMA_ACCOUNT,
          provider: 'crm',
          canvasKinds: ['record', 'database-row'],
          previewTiers: ['summary', 'thumbnail', 'shell'],
          rendererEntrypoint: 'fixtures/crm/cards/account.render',
          previewEntrypoint: 'fixtures/crm/cards/account.preview',
          fallbackLabel: 'CRM account'
        },
        {
          id: 'crm.opportunity-card',
          type: 'canvas.card',
          name: 'CRM Opportunity Card',
          description: 'Renders deal stage, amount, close date, confidence, and blockers.',
          icon: 'BadgeDollarSign',
          schemaId: CRM_SCHEMA_OPPORTUNITY,
          provider: 'crm',
          canvasKinds: ['record', 'timeline-item'],
          previewTiers: ['summary', 'thumbnail', 'shell'],
          rendererEntrypoint: 'fixtures/crm/cards/opportunity.render',
          previewEntrypoint: 'fixtures/crm/cards/opportunity.preview',
          fallbackLabel: 'CRM opportunity'
        }
      ],
      canvasIngestors: [
        {
          id: 'crm.account-url-ingestor',
          type: 'canvas.ingestor',
          name: 'CRM Account URL Ingestor',
          input: 'url',
          urlPatterns: ['https://crm.example.test/accounts/*'],
          matchEntrypoint: 'fixtures/crm/ingestors/account-url.match',
          ingestEntrypoint: 'fixtures/crm/ingestors/account-url.ingest'
        }
      ],
      canvasEdges: [
        {
          id: 'crm.owns',
          type: 'canvas.edge',
          name: 'Owns Relationship',
          label: 'owns',
          directed: true,
          allowedSourceSchemas: [CRM_SCHEMA_ACCOUNT],
          allowedTargetSchemas: [CRM_SCHEMA_OPPORTUNITY],
          style: 'solid'
        },
        {
          id: 'crm.blocks',
          type: 'canvas.edge',
          name: 'Deal Blocker',
          label: 'blocks',
          directed: true,
          allowedSourceSchemas: [CRM_SCHEMA_OPPORTUNITY],
          allowedTargetSchemas: [CRM_SCHEMA_OPPORTUNITY],
          style: 'dashed'
        }
      ],
      canvasInspectors: [
        {
          id: 'crm.account-inspector',
          type: 'canvas.inspector',
          name: 'CRM Account Inspector',
          placement: 'side-panel',
          supportedSchemas: [CRM_SCHEMA_ACCOUNT, CRM_SCHEMA_OPPORTUNITY],
          supportedProviders: ['crm'],
          panelEntrypoint: 'fixtures/crm/inspectors/account.render'
        }
      ],
      canvasTemplates: [
        {
          id: 'crm.account-plan-template',
          type: 'canvas.template',
          name: 'Account Plan',
          category: 'planning',
          tags: ['crm', 'sales', 'renewal'],
          instantiateEntrypoint: 'fixtures/crm/templates/account-plan.instantiate',
          previewEntrypoint: 'fixtures/crm/templates/account-plan.preview'
        }
      ]
    }
  },
  sampleCards: [
    {
      id: 'fixture-crm-account-acme',
      pluginId: 'com.xnet.fixtures.crm',
      contributionId: 'crm.account-card',
      title: 'ACME Corp',
      subtitle: 'Enterprise account',
      schemaId: CRM_SCHEMA_ACCOUNT,
      provider: 'crm',
      canvasKind: 'record',
      previewTier: 'shell',
      properties: {
        owner: 'Jordan Lee',
        health: 'at-risk',
        renewalDate: '2026-09-30',
        openPipelineUsd: 480000,
        stakeholders: ['CFO', 'VP Operations', 'Security Lead']
      }
    },
    {
      id: 'fixture-crm-opportunity-renewal',
      pluginId: 'com.xnet.fixtures.crm',
      contributionId: 'crm.opportunity-card',
      title: 'ACME renewal',
      subtitle: 'Negotiation',
      schemaId: CRM_SCHEMA_OPPORTUNITY,
      provider: 'crm',
      canvasKind: 'record',
      previewTier: 'shell',
      properties: {
        amountUsd: 320000,
        stage: 'negotiation',
        closeDate: '2026-07-15',
        confidence: 0.72,
        blockers: ['security review', 'procurement timing']
      }
    }
  ]
}

export const ERP_CANVAS_PLUGIN_FIXTURE: CanvasPluginFixture = {
  kind: 'erp',
  manifest: {
    id: 'com.xnet.fixtures.erp',
    name: 'Canvas ERP Fixture',
    version: '0.0.1',
    description: 'Development fixture for operations planning and ERP canvas cards.',
    author: 'xNet',
    permissions: {
      schemas: {
        read: [ERP_SCHEMA_PURCHASE_ORDER, ERP_SCHEMA_INVENTORY_ITEM],
        create: [ERP_SCHEMA_PURCHASE_ORDER, ERP_SCHEMA_INVENTORY_ITEM]
      },
      capabilities: {
        storage: 'local'
      }
    },
    contributes: {
      canvasCards: [
        {
          id: 'erp.purchase-order-card',
          type: 'canvas.card',
          name: 'Purchase Order Card',
          description: 'Renders supplier, status, due date, receiving risk, and line totals.',
          icon: 'ClipboardList',
          schemaId: ERP_SCHEMA_PURCHASE_ORDER,
          provider: 'erp',
          canvasKinds: ['record', 'workflow-item'],
          previewTiers: ['summary', 'thumbnail', 'shell'],
          rendererEntrypoint: 'fixtures/erp/cards/purchase-order.render',
          previewEntrypoint: 'fixtures/erp/cards/purchase-order.preview',
          fallbackLabel: 'Purchase order'
        },
        {
          id: 'erp.inventory-item-card',
          type: 'canvas.card',
          name: 'Inventory Item Card',
          description: 'Renders stock, reorder threshold, lead time, and warehouse placement.',
          icon: 'Package',
          schemaId: ERP_SCHEMA_INVENTORY_ITEM,
          provider: 'erp',
          canvasKinds: ['record', 'map-pin'],
          previewTiers: ['summary', 'thumbnail', 'shell'],
          rendererEntrypoint: 'fixtures/erp/cards/inventory-item.render',
          previewEntrypoint: 'fixtures/erp/cards/inventory-item.preview',
          fallbackLabel: 'Inventory item'
        }
      ],
      canvasLayouts: [
        {
          id: 'erp.supply-chain-layout',
          type: 'canvas.layout',
          name: 'Supply Chain Layout',
          description:
            'Places suppliers, purchase orders, inventory, and fulfillment nodes by flow.',
          icon: 'Network',
          scope: 'selection',
          supportedSchemas: [ERP_SCHEMA_PURCHASE_ORDER, ERP_SCHEMA_INVENTORY_ITEM],
          applyEntrypoint: 'fixtures/erp/layouts/supply-chain.apply'
        }
      ],
      canvasEdges: [
        {
          id: 'erp.supplies',
          type: 'canvas.edge',
          name: 'Supplies',
          label: 'supplies',
          directed: true,
          allowedSourceSchemas: [ERP_SCHEMA_PURCHASE_ORDER],
          allowedTargetSchemas: [ERP_SCHEMA_INVENTORY_ITEM],
          style: 'solid'
        },
        {
          id: 'erp.delayed-by',
          type: 'canvas.edge',
          name: 'Delayed By',
          label: 'delayed by',
          directed: true,
          allowedSourceSchemas: [ERP_SCHEMA_INVENTORY_ITEM],
          allowedTargetSchemas: [ERP_SCHEMA_PURCHASE_ORDER],
          style: 'dotted'
        }
      ],
      canvasTemplates: [
        {
          id: 'erp.procurement-war-room',
          type: 'canvas.template',
          name: 'Procurement War Room',
          category: 'erp',
          tags: ['erp', 'procurement', 'operations'],
          instantiateEntrypoint: 'fixtures/erp/templates/procurement-war-room.instantiate',
          previewEntrypoint: 'fixtures/erp/templates/procurement-war-room.preview'
        }
      ]
    }
  },
  sampleCards: [
    {
      id: 'fixture-erp-po-1042',
      pluginId: 'com.xnet.fixtures.erp',
      contributionId: 'erp.purchase-order-card',
      title: 'PO-1042',
      subtitle: 'Northwind Components',
      schemaId: ERP_SCHEMA_PURCHASE_ORDER,
      provider: 'erp',
      canvasKind: 'workflow-item',
      previewTier: 'shell',
      properties: {
        supplier: 'Northwind Components',
        status: 'awaiting shipment',
        dueDate: '2026-06-12',
        totalUsd: 18750,
        receivingRisk: 'medium'
      }
    },
    {
      id: 'fixture-erp-inventory-servo',
      pluginId: 'com.xnet.fixtures.erp',
      contributionId: 'erp.inventory-item-card',
      title: 'Servo Motor A17',
      subtitle: 'Warehouse 4',
      schemaId: ERP_SCHEMA_INVENTORY_ITEM,
      provider: 'erp',
      canvasKind: 'record',
      previewTier: 'thumbnail',
      properties: {
        sku: 'A17-SERVO',
        onHand: 42,
        reorderPoint: 60,
        leadTimeDays: 18,
        warehouse: 'SJC-4'
      }
    }
  ]
}

export const MEDIA_PROVIDER_CANVAS_PLUGIN_FIXTURE: CanvasPluginFixture = {
  kind: 'media-provider',
  manifest: {
    id: 'com.xnet.fixtures.media',
    name: 'Canvas Media Provider Fixture',
    version: '0.0.1',
    description: 'Development fixture for embedded video, playlist, and web media cards.',
    author: 'xNet',
    permissions: {
      schemas: {
        read: [MEDIA_SCHEMA_EXTERNAL],
        create: [MEDIA_SCHEMA_EXTERNAL]
      },
      capabilities: {
        network: ['youtube.com', 'youtu.be', 'open.spotify.com', 'vimeo.com'],
        storage: 'local'
      }
    },
    contributes: {
      canvasCards: [
        {
          id: 'media.youtube-video-card',
          type: 'canvas.card',
          name: 'YouTube Video Card',
          description: 'Renders a safe activation shell and preview for YouTube videos.',
          icon: 'Youtube',
          schemaId: MEDIA_SCHEMA_EXTERNAL,
          provider: 'youtube',
          canvasKinds: ['external-reference', 'media'],
          previewTiers: ['summary', 'thumbnail', 'shell', 'live'],
          rendererEntrypoint: 'fixtures/media/cards/youtube-video.render',
          previewEntrypoint: 'fixtures/media/cards/youtube-video.preview',
          permissions: ['network', 'canvas.render'],
          fallbackLabel: 'YouTube video'
        },
        {
          id: 'media.spotify-playlist-card',
          type: 'canvas.card',
          name: 'Spotify Playlist Card',
          description: 'Renders a safe activation shell and preview for Spotify playlists.',
          icon: 'Music2',
          schemaId: MEDIA_SCHEMA_EXTERNAL,
          provider: 'spotify',
          canvasKinds: ['external-reference', 'media'],
          previewTiers: ['summary', 'thumbnail', 'shell', 'live'],
          rendererEntrypoint: 'fixtures/media/cards/spotify-playlist.render',
          previewEntrypoint: 'fixtures/media/cards/spotify-playlist.preview',
          permissions: ['network', 'canvas.render'],
          fallbackLabel: 'Spotify playlist'
        }
      ],
      canvasIngestors: [
        {
          id: 'media.url-ingestor',
          type: 'canvas.ingestor',
          name: 'Media URL Ingestor',
          input: 'url',
          urlPatterns: [
            'https://www.youtube.com/watch*',
            'https://youtu.be/*',
            'https://open.spotify.com/*',
            'https://vimeo.com/*'
          ],
          matchEntrypoint: 'fixtures/media/ingestors/media-url.match',
          ingestEntrypoint: 'fixtures/media/ingestors/media-url.ingest'
        }
      ],
      canvasInspectors: [
        {
          id: 'media.embed-inspector',
          type: 'canvas.inspector',
          name: 'Embed Inspector',
          placement: 'popover',
          supportedKinds: ['external-reference', 'media'],
          supportedProviders: ['youtube', 'spotify', 'vimeo'],
          panelEntrypoint: 'fixtures/media/inspectors/embed.render'
        }
      ]
    }
  },
  sampleCards: [
    {
      id: 'fixture-media-youtube-roadmap',
      pluginId: 'com.xnet.fixtures.media',
      contributionId: 'media.youtube-video-card',
      title: 'Planning review video',
      subtitle: 'YouTube',
      schemaId: MEDIA_SCHEMA_EXTERNAL,
      provider: 'youtube',
      canvasKind: 'external-reference',
      previewTier: 'live',
      properties: {
        url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        embedUrl: 'https://www.youtube.com/embed/dQw4w9WgXcQ',
        durationSeconds: 213,
        activationMode: 'click-to-activate'
      }
    },
    {
      id: 'fixture-media-spotify-focus',
      pluginId: 'com.xnet.fixtures.media',
      contributionId: 'media.spotify-playlist-card',
      title: 'Focus playlist',
      subtitle: 'Spotify',
      schemaId: MEDIA_SCHEMA_EXTERNAL,
      provider: 'spotify',
      canvasKind: 'external-reference',
      previewTier: 'live',
      properties: {
        url: 'https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M',
        embedUrl: 'https://open.spotify.com/embed/playlist/37i9dQZF1DXcBWIGoYBM5M',
        trackCount: 50,
        activationMode: 'click-to-activate'
      }
    }
  ]
}

export const CANVAS_PLUGIN_FIXTURES: CanvasPluginFixture[] = [
  CRM_CANVAS_PLUGIN_FIXTURE,
  ERP_CANVAS_PLUGIN_FIXTURE,
  MEDIA_PROVIDER_CANVAS_PLUGIN_FIXTURE
]

export function getCanvasPluginFixture(
  kind: CanvasPluginFixtureKind
): CanvasPluginFixture | undefined {
  return CANVAS_PLUGIN_FIXTURES.find((fixture) => fixture.kind === kind)
}

export function createCanvasPluginFixtureManifests(): XNetExtension[] {
  return CANVAS_PLUGIN_FIXTURES.map((fixture) => fixture.manifest)
}

export function createCanvasPluginFixtureCards(): CanvasPluginFixtureCardSample[] {
  return CANVAS_PLUGIN_FIXTURES.flatMap((fixture) => fixture.sampleCards)
}
