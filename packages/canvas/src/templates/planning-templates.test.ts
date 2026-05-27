import { describe, expect, it } from 'vitest'
import {
  CANVAS_PLANNING_TEMPLATE_DEFINITIONS,
  createCanvasPlanningTemplateInstance,
  getCanvasPlanningTemplateDefinition
} from './planning-templates'

const viewport = {
  x: 1000,
  y: 600,
  zoom: 1
}

describe('planning templates', () => {
  it('defines the expected built-in planning templates', () => {
    expect(CANVAS_PLANNING_TEMPLATE_DEFINITIONS.map((template) => template.id)).toEqual([
      'research-synthesis',
      'product-roadmap',
      'incident-review',
      'planning-board'
    ])
    expect(getCanvasPlanningTemplateDefinition('product-roadmap')).toMatchObject({
      name: 'Product Roadmap',
      category: 'product'
    })
  })

  it('creates deterministic node and edge instances from a template', () => {
    const instance = createCanvasPlanningTemplateInstance({
      templateId: 'planning-board',
      viewport,
      idPrefix: 'template'
    })

    expect(instance.rootNodeId).toBe('template-kanban')
    expect(instance.nodes).toHaveLength(7)
    expect(instance.edges).toHaveLength(4)
    expect(instance.bounds).toEqual({
      x: 440,
      y: 280,
      width: 1120,
      height: 640
    })
    expect(instance.nodes[0]).toMatchObject({
      id: 'template-kanban',
      type: 'group',
      properties: {
        title: 'Planning Board',
        frameVariant: 'kanban',
        memberIds: [
          'template-goals',
          'template-backlog',
          'template-doing',
          'template-done',
          'template-blockers',
          'template-decisions'
        ]
      }
    })
    expect(instance.nodes.find((node) => node.id === 'template-blockers')).toMatchObject({
      type: 'note',
      properties: {
        stickyNoteRole: 'sticky-note',
        stickyNoteColor: 'rose'
      }
    })
    expect(instance.edges[0]).toMatchObject({
      id: 'template-edge-0',
      source: { objectId: 'template-goals' },
      target: { objectId: 'template-backlog' },
      relationship: {
        kind: 'references',
        label: 'Scopes'
      }
    })
  })
})
