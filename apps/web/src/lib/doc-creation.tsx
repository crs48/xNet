/**
 * Shared document-creation affordances: the per-type route/icon/label table
 * and the "New …" dropdown items used by both the sidebar and the home page.
 */
export { newDocId, type CreatableDocType } from '@xnetjs/workbench'
import type { CreatableDocType } from '@xnetjs/workbench'
import type { ComponentType } from 'react'
import { Code2, Database, FileText, Layout, LayoutDashboard, MapPin } from 'lucide-react'

export interface DocTypeRoute {
  to: string
  paramKey: string
  label: string
  icon: ComponentType<{ size?: number | string; className?: string }>
}

export const DOC_TYPE_ROUTES: Record<CreatableDocType, DocTypeRoute> = {
  page: { to: '/doc/$docId', paramKey: 'docId', label: 'Page', icon: FileText },
  database: { to: '/db/$dbId', paramKey: 'dbId', label: 'Database', icon: Database },
  canvas: { to: '/canvas/$canvasId', paramKey: 'canvasId', label: 'Canvas', icon: Layout },
  dashboard: {
    to: '/dashboard/$dashboardId',
    paramKey: 'dashboardId',
    label: 'Dashboard',
    icon: LayoutDashboard
  },
  map: { to: '/map/$mapId', paramKey: 'mapId', label: 'Map', icon: MapPin },
  lab: { to: '/lab/$labId', paramKey: 'labId', label: 'Lab', icon: Code2 }
}

/** The shared "New …" dropdown entries. */
export function CreateDocMenuItems({
  types,
  onCreate
}: {
  types: readonly CreatableDocType[]
  onCreate: (type: CreatableDocType) => void
}): JSX.Element {
  return (
    <>
      {types.map((type) => {
        const route = DOC_TYPE_ROUTES[type]
        const Icon = route.icon
        return (
          <button
            key={type}
            onClick={() => onCreate(type)}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent text-left text-foreground bg-transparent border-none cursor-pointer"
          >
            <Icon size={14} />
            <span>{route.label}</span>
          </button>
        )
      })}
    </>
  )
}
