/**
 * Hosted-view registry (0406) — how the shell renders tab content without
 * importing a single view component.
 *
 * The old ViewHost import table had one virtue worth keeping: a new
 * {@link TabNodeType} was a compile error until every view existed. So
 * registration takes the COMPLETE map — the app's one `registerHostedViews`
 * call is where exhaustiveness is enforced, at its compile time, not by a
 * runtime warning here.
 *
 * Reading before the app registers is a bug in boot ordering, and it throws:
 * a shell that silently renders nothing is the failure mode 0406 exists to
 * kill ("absent" and "unreadable" must be different values).
 */
import type { TabNodeType } from './state'
import type { ComponentType } from 'react'

export type HostedView = ComponentType<{ nodeId: string }>

let hostedViews: Record<TabNodeType, HostedView> | null = null

/** The app registers its full view table once at boot (idempotent). */
export function registerHostedViews(views: Record<TabNodeType, HostedView>): void {
  hostedViews = views
}

export function hostedView(nodeType: TabNodeType): HostedView {
  if (!hostedViews) {
    throw new Error(
      `[workbench] hostedView('${nodeType}') before registerHostedViews — the host app must register its view table at boot`
    )
  }
  return hostedViews[nodeType]
}
