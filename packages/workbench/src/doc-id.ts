/**
 * New-document identity (moved from apps/web/lib/doc-creation, 0406).
 *
 * The creatable set and id scheme are shell concerns — "New page" exists on
 * every surface — while the routes and menu chrome those docs open through
 * stay host-side.
 */

/** Doc types the shell's New affordances can create. Every one is a TabNodeType. */
export type CreatableDocType = 'page' | 'database' | 'canvas' | 'dashboard' | 'map' | 'lab'

export function newDocId(): string {
  return Math.random().toString(36).substring(2, 15)
}
