/**
 * Viz seeder — Canvas and Dashboard nodes. Canvases get real scenes (shapes,
 * sticky notes, connectors, and embedded Page/Task cards via `sourceNodeId`) so
 * the graph is visible spatially. Dashboards are created as nodes (widgets left
 * minimal). Scoped into team spaces and tagged.
 *
 * Must not import from `work` (work imports `canvasId` from here) — task ids are
 * computed inline.
 */

import type { SeedDoc, SeederModule } from '../types'
import type { DeterministicNodeImportDraft } from '@xnetjs/data'
import {
  createCanvasDoc,
  createEdge,
  createNode,
  getCanvasConnectorsMap,
  getCanvasObjectsMap
} from '@xnetjs/canvas'
import { CanvasSchema, DashboardSchema, PageSchema, TaskSchema } from '@xnetjs/data'
import { PROJECT_NAMES, seedId } from '../seed-ids'
import { pageId } from './docs'

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

/** Build a canvas scene with embedded cards, a shape, a note, and connectors. */
function buildCanvasDoc(id: string, title: string): ReturnType<typeof createCanvasDoc> {
  const doc = createCanvasDoc(id, title)
  const objects = getCanvasObjectsMap(doc)
  const connectors = getCanvasConnectorsMap(doc)

  // Embedded page card → the flagship sample page.
  const pageCard = createNode(
    'page',
    { x: 80, y: 80, width: 240, height: 140 },
    { title: 'Sample Page' }
  )
  pageCard.sourceNodeId = pageId('sample')
  pageCard.sourceSchemaId = PageSchema._schemaId

  // Embedded task card → first task of the first project.
  const taskCard = createNode(
    'task',
    { x: 420, y: 80, width: 220, height: 120 },
    { title: 'Spec task', renderMode: 'card' }
  )
  taskCard.sourceNodeId = seedId('task', PROJECT_NAMES[0], 0)
  taskCard.sourceSchemaId = TaskSchema._schemaId

  const shape = createNode(
    'shape',
    { x: 240, y: 320, width: 200, height: 100 },
    { title: 'Milestone v1', shapeType: 'rounded-rectangle' }
  )
  const note = createNode(
    'note',
    { x: 520, y: 320, width: 200, height: 120 },
    { title: 'Remember to test relationships!' }
  )

  for (const node of [pageCard, taskCard, shape, note]) objects.set(node.id, node)

  const e1 = createEdge(pageCard.id, taskCard.id, {
    relationship: { kind: 'relates-to', direction: 'directed' },
    label: 'spec'
  })
  const e2 = createEdge(taskCard.id, shape.id, {
    relationship: { kind: 'depends-on', direction: 'directed' },
    label: 'targets'
  })
  for (const edge of [e1, e2]) connectors.set(edge.id, edge)

  return doc
}

export const vizSeeder: SeederModule = {
  domain: 'viz',
  label: 'Canvases & dashboards',
  schemaIds: [CanvasSchema._schemaId, DashboardSchema._schemaId],
  seed: ({ fixtures }) => {
    const drafts: DeterministicNodeImportDraft[] = []
    const docs: SeedDoc[] = []

    CANVASES.forEach((c, i) => {
      const id = canvasId(c.slug)
      drafts.push({
        id,
        schemaId: CanvasSchema._schemaId,
        properties: {
          title: c.title,
          icon: c.icon,
          space: i === 0 ? fixtures.spaces.engineering : fixtures.spaces.design,
          folder: fixtures.folder(i === 0 ? 'work/engineering' : 'work/design'),
          tags: [fixtures.tag('design'), fixtures.tag('roadmap')]
        }
      })
      // Build a real scene for the first canvas (others stay blank-but-valid).
      if (i === 0) {
        docs.push({ nodeId: id, build: () => buildCanvasDoc(id, c.title) })
      }
    })

    for (const d of DASHBOARDS) {
      drafts.push({
        id: dashboardId(d.slug),
        schemaId: DashboardSchema._schemaId,
        properties: {
          title: d.title,
          icon: d.icon,
          space: fixtures.spaces.org,
          tags: [fixtures.tag('roadmap')],
          variables: {},
          widgets: [],
          layouts: {}
        }
      })
    }

    return { drafts, docs }
  }
}
