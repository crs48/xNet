/**
 * `@xnetjs/ui/wireframe` — sketch primitives for visual explorations (0403).
 *
 * Deliberately a SUB-BARREL, not part of the root `@xnetjs/ui` barrel: this is
 * dev-only authoring surface and adding it to the root barrel would make every
 * consumer pay for it and turn any later removal into a major bump
 * (CLAUDE.md sub-barrel policy, 0276).
 */
export { Screen, resolveIcon } from './Screen'
export type { ScreenProps, WireframeSurface } from './Screen'
