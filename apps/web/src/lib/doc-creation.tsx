/**
 * Shared document-creation affordances: the per-type route/icon/label table
 * and the "New …" dropdown items used by both the sidebar and the home page.
 */
export { newDocId, type CreatableDocType } from '@xnetjs/workbench'
import { DOC_TYPE_META, type CreatableDocType, type DocTypeMeta } from '@xnetjs/workbench'

export interface DocTypeRoute extends DocTypeMeta {
  to: string
  paramKey: string
}

// Routes are the web-only half; labels/icons come from the shell's shared
// DOC_TYPE_META so both surfaces render the same "New …" affordances.
export const DOC_TYPE_ROUTES: Record<CreatableDocType, DocTypeRoute> = {
  page: { to: '/doc/$docId', paramKey: 'docId', ...DOC_TYPE_META.page },
  database: { to: '/db/$dbId', paramKey: 'dbId', ...DOC_TYPE_META.database },
  canvas: { to: '/canvas/$canvasId', paramKey: 'canvasId', ...DOC_TYPE_META.canvas },
  dashboard: { to: '/dashboard/$dashboardId', paramKey: 'dashboardId', ...DOC_TYPE_META.dashboard },
  map: { to: '/map/$mapId', paramKey: 'mapId', ...DOC_TYPE_META.map },
  lab: { to: '/lab/$labId', paramKey: 'labId', ...DOC_TYPE_META.lab }
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
