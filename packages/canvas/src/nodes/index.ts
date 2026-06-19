/**
 * Canvas Nodes
 *
 * Node types and components for the canvas.
 */

export { CanvasNodeComponent, calculateLOD } from './CanvasNodeComponent'
export type { CanvasNodeProps, NodeRemoteUser, LODLevel } from './CanvasNodeComponent'

export { MermaidNodeComponent } from './mermaid-node'
export type { MermaidNodeData, MermaidNodeProps } from './mermaid-node'

export { ChecklistNodeComponent, ensureChecklistTaskIds } from './checklist-node'
export type { ChecklistItem, ChecklistNodeData, ChecklistNodeProps } from './checklist-node'

export { TaskNodeComponent } from './task-node'
export type { TaskNodeProps } from './task-node'

export { ShapeNodeComponent, ShapePicker, createShapePath, SHAPE_TYPES } from './shape-node'
export type { ShapeType, ShapeNodeData, ShapeNodeProps, ShapePickerProps } from './shape-node'
export {
  ShapeRegistry,
  shapeRegistry,
  ensureBuiltinShapes,
  hasShape,
  resolveShapePath,
  shapeTypes,
  type ShapeDefinition,
  type ShapePathOptions
} from './shape-registry'
export { BUILTIN_SHAPES, type BuiltinShapeType } from './shape-paths'

export { EmbedNodeComponent } from './embed-node'
export type { EmbedViewType, EmbedNodeData, EmbedNodeProps, LinkedNodeData } from './embed-node'
