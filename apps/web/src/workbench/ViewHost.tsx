/**
 * ViewHost — mounts the registered view component for a tab (explorations
 * 0166, 0406).
 *
 * The *active* editor group renders the router outlet (router stays
 * authoritative); ViewHost renders the inactive group of a split.
 * Background tabs are not rendered at all, so they hold no Y.Doc
 * subscriptions (the strongest form of the background-tab downgrade).
 *
 * Views come from the workbench view registry — the host app registers its
 * table at boot (web: `platform/hosted-views.tsx`), so this file no longer
 * imports a single view component.
 */
import type { WorkbenchTab } from './state'
import { hostedView } from '@xnetjs/workbench'

export function ViewHost({ tab }: { tab: WorkbenchTab }) {
  const View = hostedView(tab.nodeType)
  // Pages are full-bleed documents that own their scroll (see
  // GroupContent in EditorArea for the routed equivalent).
  const hostClass =
    tab.nodeType === 'page'
      ? 'h-full min-h-0 overflow-hidden'
      : 'h-full min-h-0 overflow-y-auto p-6'

  return (
    <div className={hostClass}>
      {/* keyed so switching tabs fully remounts the view */}
      <View key={tab.id} nodeId={tab.nodeId} />
    </div>
  )
}
