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
import { createCanvasDoc, getCanvasConnectorsMap, getCanvasObjectsMap } from '@xnetjs/canvas'
import {
  CanvasSchema,
  DashboardSchema,
  DatabaseSchema,
  MapSchema,
  MediaAssetSchema,
  MetricSchema,
  ObservationSchema,
  PageSchema,
  TaskSchema
} from '@xnetjs/data'
import { card, frame, group, note, shape, styledEdge } from '../builders/canvas-builder'
import {
  buildDashboard,
  chart,
  metricCount,
  pageLinks,
  savedView,
  streakHeatmap,
  taskList
} from '../builders/dashboard-builder'
import { PROJECT_NAMES, seedId } from '../seed-ids'
import { databaseId } from './database-drafts'
import { pageId } from './docs'

export const canvasId = (slug: string): string => seedId('canvas', slug)
export const dashboardId = (slug: string): string => seedId('dashboard', slug)
export const mapId = (slug: string): string => seedId('map', slug)

const POINT = (lng: number, lat: number, name: string) => ({
  type: 'Feature' as const,
  geometry: { type: 'Point' as const, coordinates: [lng, lat] },
  properties: { name }
})

const CANVASES = [
  { slug: 'roadmap', title: 'Roadmap', icon: '🗺️' },
  { slug: 'architecture', title: 'Architecture', icon: '🏗️' },
  { slug: 'brainstorm', title: 'Brainstorm', icon: '💡' }
] as const

/**
 * Build a canvas scene exercising every card kind (page/database/dashboard/
 * media/task), a frame + a group, and styled connectors across relationship
 * kinds, all embedding seeded nodes.
 */
function buildCanvasDoc(id: string, title: string): ReturnType<typeof createCanvasDoc> {
  const doc = createCanvasDoc(id, title)
  const objects = getCanvasObjectsMap(doc)
  const connectors = getCanvasConnectorsMap(doc)

  const pageCard = card(
    'page',
    { x: 80, y: 80, width: 240, height: 140 },
    { title: 'Sample Page' },
    {
      nodeId: pageId('sample'),
      schemaId: PageSchema._schemaId
    }
  )
  const taskCard = card(
    'task',
    { x: 80, y: 280, width: 220, height: 120 },
    { title: 'Spec task', renderMode: 'card' },
    { nodeId: seedId('task', PROJECT_NAMES[0], 0), schemaId: TaskSchema._schemaId }
  )
  const dbCard = card(
    'database',
    { x: 420, y: 80, width: 280, height: 180 },
    { title: 'Tasks Tracker' },
    { nodeId: databaseId('tracker'), schemaId: DatabaseSchema._schemaId }
  )
  const dashCard = card(
    'dashboard',
    { x: 760, y: 80, width: 280, height: 180 },
    { title: 'Team Overview' },
    { nodeId: dashboardId('overview'), schemaId: DashboardSchema._schemaId }
  )
  const mediaCard = card(
    'media',
    { x: 760, y: 320, width: 200, height: 150 },
    { title: 'Sample image', kind: 'image' },
    { nodeId: seedId('media', 0), schemaId: MediaAssetSchema._schemaId }
  )
  const stickyNote = note({ x: 420, y: 320, width: 220, height: 120 }, 'Everything connects here!')
  const milestoneShape = shape(
    { x: 420, y: 500, width: 200, height: 90 },
    'Milestone v1',
    'rounded-rectangle'
  )

  // A presentation frame grouping the page + task; a group around media + note.
  const presentationFrame = frame('presentation', { x: 40, y: 40 }, 'Spec review', [
    pageCard.id,
    taskCard.id
  ])
  const mediaGroup = group({ x: 720, y: 290, width: 280, height: 200 }, 'Assets', [
    mediaCard.id,
    stickyNote.id
  ])

  for (const node of [
    presentationFrame,
    mediaGroup,
    pageCard,
    taskCard,
    dbCard,
    dashCard,
    mediaCard,
    stickyNote,
    milestoneShape
  ]) {
    objects.set(node.id, node)
  }

  const edges = [
    styledEdge(pageCard.id, taskCard.id, 'relates-to', undefined, 'spec'),
    styledEdge(
      taskCard.id,
      dbCard.id,
      'depends-on',
      { strokeDasharray: '6 4', markerEnd: 'arrow' },
      'tracked in'
    ),
    styledEdge(dbCard.id, dashCard.id, 'references', { curved: true, markerEnd: 'arrow' }, 'feeds'),
    styledEdge(taskCard.id, milestoneShape.id, 'blocks', { stroke: '#ef4444', markerEnd: 'arrow' })
  ]
  for (const edge of edges) connectors.set(edge.id, edge)

  return doc
}

export const vizSeeder: SeederModule = {
  domain: 'viz',
  label: 'Canvases & dashboards',
  schemaIds: [CanvasSchema._schemaId, DashboardSchema._schemaId, MapSchema._schemaId],
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

    // ─── Dashboards populated with real, runtime-bound widgets ───────────
    const analytics = buildDashboard(
      [
        metricCount('tasks-total', 'Tasks', TaskSchema._schemaId),
        metricCount('pages-total', 'Pages', PageSchema._schemaId),
        metricCount('metrics-total', 'Metrics', MetricSchema._schemaId),
        chart('bar', 'tasks-by-status', 'Tasks by status', TaskSchema._schemaId, 'status'),
        chart(
          'line',
          'obs-over-time',
          'Observations over time',
          ObservationSchema._schemaId,
          'day',
          {
            timeField: 'day'
          }
        ),
        streakHeatmap('activity-streak', 'Daily activity')
      ],
      { timeRange: { kind: 'preset', preset: '30d' }, custom: { team: 'Engineering' } }
    )
    drafts.push({
      id: dashboardId('overview'),
      schemaId: DashboardSchema._schemaId,
      properties: {
        title: 'Team Overview',
        icon: '📊',
        space: fixtures.spaces.org,
        tags: [fixtures.tag('roadmap')],
        ...analytics
      }
    })

    const teamHub = buildDashboard(
      [
        taskList('recent-tasks', 'Recent tasks'),
        pageLinks('recent-pages', 'Recent pages'),
        savedView('task-board', 'Task board', TaskSchema._schemaId)
      ],
      { timeRange: { kind: 'preset', preset: '7d' } }
    )
    drafts.push({
      id: dashboardId('reliability'),
      schemaId: DashboardSchema._schemaId,
      properties: {
        title: 'Reliability',
        icon: '📈',
        space: fixtures.spaces.org,
        tags: [fixtures.tag('roadmap')],
        ...teamHub
      }
    })

    // ─── Map populated with a real basemap, viewport + a markers layer ───
    drafts.push({
      id: mapId('offices'),
      schemaId: MapSchema._schemaId,
      properties: {
        title: 'Office Locations',
        icon: '🗺️',
        basemap: 'protomaps-light',
        viewport: { longitude: -98, latitude: 39.5, zoom: 3 },
        layers: [
          {
            id: 'offices',
            name: 'Offices',
            source: {
              kind: 'geojson',
              data: {
                type: 'FeatureCollection',
                features: [
                  POINT(-122.42, 37.77, 'San Francisco'),
                  POINT(-73.99, 40.73, 'New York'),
                  POINT(-0.13, 51.5, 'London')
                ]
              }
            },
            style: { geometry: 'point', color: '#2f7ed8', size: 7 },
            visible: true,
            popupProperties: ['name']
          }
        ],
        space: fixtures.spaces.org,
        tags: [fixtures.tag('roadmap')]
      }
    })

    return { drafts, docs }
  }
}
