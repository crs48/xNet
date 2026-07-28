/**
 * New-document identity (moved from apps/web/lib/doc-creation, 0406).
 *
 * The creatable set and id scheme are shell concerns — "New page" exists on
 * every surface — while the routes and menu chrome those docs open through
 * stay host-side.
 */

import type { ComponentType } from 'react'
import { Code2, Database, FileText, Layout, LayoutDashboard, MapPin } from 'lucide-react'

/** Doc types the shell's New affordances can create. Every one is a TabNodeType. */
export type CreatableDocType = 'page' | 'database' | 'canvas' | 'dashboard' | 'map' | 'lab'

export function newDocId(): string {
  return Math.random().toString(36).substring(2, 15)
}

export interface DocTypeMeta {
  label: string
  icon: ComponentType<{ size?: number | string; className?: string }>
}

/**
 * Presentation metadata for the creatable types — the host-agnostic half of
 * web's DOC_TYPE_ROUTES table (routes stay host-side; labels and icons are
 * shell chrome on every surface).
 */
export const DOC_TYPE_META: Record<CreatableDocType, DocTypeMeta> = {
  page: { label: 'Page', icon: FileText },
  database: { label: 'Database', icon: Database },
  canvas: { label: 'Canvas', icon: Layout },
  dashboard: { label: 'Dashboard', icon: LayoutDashboard },
  map: { label: 'Map', icon: MapPin },
  lab: { label: 'Lab', icon: Code2 }
}
