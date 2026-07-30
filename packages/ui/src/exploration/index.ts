/**
 * `@xnetjs/ui/exploration` — document blocks for visual explorations (0403).
 *
 * A sub-barrel, not part of the root `@xnetjs/ui` barrel: dev-only authoring
 * surface (CLAUDE.md sub-barrel policy, 0276). Re-exports the wireframe kit too
 * so an MDX page needs one import line.
 */
export {
  Callout,
  FileTree,
  AnnotatedCode,
  Columns,
  Column,
  Checklist,
  OpenQuestions
} from './blocks'
export type { CalloutTone, FileTreeEntry, CodeAnnotation, ChecklistItem } from './blocks'
export { Diagram } from './Diagram'
export type { DiagramProps } from './Diagram'
export { Screen, resolveIcon } from '../wireframe'
export type { ScreenProps, WireframeSurface } from '../wireframe'
