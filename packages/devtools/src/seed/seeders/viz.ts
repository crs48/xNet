/**
 * Viz seeder — Canvas and Dashboard nodes, scoped into the demo Space. The Yjs
 * scene/widget internals are left empty (valid, openable surfaces); the goal is
 * to exercise the surfaces and their relationships, not to author rich scenes.
 */

import type { SeederModule } from '../types'
import type { DeterministicNodeImportDraft } from '@xnetjs/data'
import { CanvasSchema, DashboardSchema } from '@xnetjs/data'
import { seedId } from '../seed-ids'
import { folderId, tagId } from './spaces'

export const canvasId = (slug: string): string => seedId('canvas', slug)
export const dashboardId = (slug: string): string => seedId('dashboard', slug)

const CANVASES = [
  { slug: 'roadmap', title: 'Roadmap', icon: '🗺️' },
  { slug: 'architecture', title: 'Architecture', icon: '🏗️' },
  { slug: 'brainstorm', title: 'Brainstorm', icon: '💡' }
] as const

const DASHBOARDS = [
  { slug: 'overview', title: 'Team Overview', icon: '📊' },
  { slug: 'reliability', title: 'Reliability', icon: '📈' }
] as const

export const vizSeeder: SeederModule = {
  domain: 'viz',
  label: 'Canvases & dashboards',
  schemaIds: [CanvasSchema._schemaId, DashboardSchema._schemaId],
  seed: ({ space }) => {
    const drafts: DeterministicNodeImportDraft[] = []

    for (const c of CANVASES) {
      drafts.push({
        id: canvasId(c.slug),
        schemaId: CanvasSchema._schemaId,
        properties: {
          title: c.title,
          icon: c.icon,
          space,
          folder: folderId('work'),
          tags: [tagId('design')]
        }
      })
    }

    for (const d of DASHBOARDS) {
      drafts.push({
        id: dashboardId(d.slug),
        schemaId: DashboardSchema._schemaId,
        properties: {
          title: d.title,
          icon: d.icon,
          space,
          variables: {},
          widgets: [],
          layouts: {}
        }
      })
    }

    return { drafts }
  }
}
