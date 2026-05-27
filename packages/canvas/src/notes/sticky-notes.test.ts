import { describe, expect, it } from 'vitest'
import {
  CANVAS_STICKY_NOTE_ROLE,
  createCanvasStickyNoteNode,
  createCanvasStickyNotePromotionDraft,
  createCanvasStickyNoteProperties,
  isCanvasStickyNoteNode,
  promoteCanvasStickyNoteNode
} from './sticky-notes'

const viewport = {
  x: 120,
  y: 80,
  zoom: 1
}

describe('sticky note helpers', () => {
  it('creates sticky note properties with a color preset', () => {
    expect(createCanvasStickyNoteProperties({ title: 'Idea', color: 'green' })).toMatchObject({
      title: 'Idea',
      label: 'Idea',
      stickyNoteRole: CANVAS_STICKY_NOTE_ROLE,
      stickyNoteColor: 'green',
      fill: '#dcfce7',
      stroke: '#16a34a'
    })
  })

  it('creates source-backed sticky note canvas nodes', () => {
    const node = createCanvasStickyNoteNode({
      viewport,
      title: 'Research angle',
      body: 'Follow up with customer quotes.'
    })

    expect(node.type).toBe('note')
    expect(node.position).toMatchObject({
      x: 0,
      y: -10,
      width: 240,
      height: 180
    })
    expect(isCanvasStickyNoteNode(node)).toBe(true)
  })

  it('creates promotion drafts for tasks and database rows', () => {
    const node = createCanvasStickyNoteNode({
      viewport,
      title: 'Review proposal',
      body: 'Needs product sign-off.'
    })
    const taskDraft = createCanvasStickyNotePromotionDraft(node, 'task')
    const rowDraft = createCanvasStickyNotePromotionDraft(node, 'database-row')

    expect(taskDraft).toMatchObject({
      target: 'task',
      canvasKind: 'note',
      title: 'Review proposal',
      sourceProperties: {
        status: 'todo',
        priority: 'medium',
        source: 'canvas'
      }
    })
    expect(taskDraft.schemaId).toContain('Task')
    expect(rowDraft).toMatchObject({
      target: 'database-row',
      sourceProperties: {
        cell_title: 'Review proposal',
        cell_notes: 'Needs product sign-off.'
      }
    })
    expect(rowDraft.schemaId).toContain('DatabaseRow')
  })

  it('promotes sticky notes into source-backed canvas projections', () => {
    const node = createCanvasStickyNoteNode({
      viewport,
      title: 'Planning memo',
      color: 'violet'
    })
    const promoted = promoteCanvasStickyNoteNode(node, 'page')

    expect(promoted.type).toBe('page')
    expect(promoted.sourceSchemaId).toContain('Page')
    expect(promoted.properties).toMatchObject({
      title: 'Planning memo',
      stickyNotePromoted: true,
      stickyNotePromotionTarget: 'page',
      sourceDisplayKind: 'page'
    })
  })
})
