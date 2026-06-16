/**
 * TabBreadcrumb — Space + folder path of the active tab's node
 * (exploration 0169, Space crumb added in 0190).
 *
 * A slim strip under the tab bar: ◇ Acme Eng › 📁 Design / Research. The Space
 * crumb is clickable and re-scopes the Explorer (Notion's "click the teamspace"
 * pattern); it renders even when the node has no folder, so a workspace doc is
 * never left without a home label. Renders nothing only for a truly unfiled,
 * space-less node or a non-folderable surface. Query options mirror the
 * Explorer's so the bridge shares subscriptions instead of re-reading.
 */
import { FolderSchema } from '@xnetjs/data'
import { useQuery } from '@xnetjs/react'
import { FolderClosed, Users } from 'lucide-react'
import { Fragment, useMemo } from 'react'
import { useSpaces } from '../hooks/useSpaces'
import { useWorkbench, type WorkbenchTab } from './state'
import { folderPathNames } from './views/explorer-folders'
import { EXPLORER_SCHEMAS, isExplorerNodeType } from './views/explorer-items'
import { nodeSpaceId } from './views/explorer-scope'

const QUERY_LIMIT = 500

function useBreadcrumb(tab: WorkbenchTab | null): {
  folderNames: string[]
  spaceId: string | null
} {
  const folderable = Boolean(tab && isExplorerNodeType(tab.nodeType))
  const schema = folderable
    ? EXPLORER_SCHEMAS[tab!.nodeType as keyof typeof EXPLORER_SCHEMAS]
    : EXPLORER_SCHEMAS.page

  const { data: nodes } = useQuery(schema, {
    orderBy: { updatedAt: 'desc' },
    limit: QUERY_LIMIT,
    enabled: folderable
  })
  const { data: folderDocs } = useQuery(FolderSchema, {
    orderBy: { createdAt: 'asc' },
    enabled: folderable
  })

  return useMemo(
    () => ({
      folderNames: folderable && tab ? folderPathNames(tab.nodeId, nodes, folderDocs) : [],
      spaceId: folderable && tab ? nodeSpaceId(tab.nodeId, nodes) : null
    }),
    [folderable, tab, nodes, folderDocs]
  )
}

export function TabBreadcrumb({ tab }: { tab: WorkbenchTab | null }) {
  const { folderNames, spaceId } = useBreadcrumb(tab)
  const { getSpace } = useSpaces()
  const setCurrentSpace = useWorkbench((state) => state.setCurrentSpace)
  const space = getSpace(spaceId)

  if (!space && folderNames.length === 0) return null

  return (
    <div className="flex h-6 shrink-0 items-center gap-1.5 border-b border-hairline px-3 text-[11px] text-ink-3">
      {space ? (
        <button
          type="button"
          onClick={() => setCurrentSpace(space.id)}
          title={`Filter to ${space.name}`}
          className="flex cursor-pointer items-center gap-1 border-none bg-transparent p-0 text-ink-3 hover:text-ink-1"
        >
          {space.icon ? (
            <span className="leading-none">{space.icon}</span>
          ) : (
            <Users size={11} strokeWidth={1.5} className="shrink-0" />
          )}
          <span className="max-w-40 truncate">{space.name || 'Untitled space'}</span>
        </button>
      ) : null}
      {space && folderNames.length > 0 ? <span className="text-ink-3">›</span> : null}
      {folderNames.length > 0 ? (
        <>
          <FolderClosed size={11} strokeWidth={1.5} className="shrink-0" />
          {folderNames.map((name, index) => (
            <Fragment key={`${index}-${name}`}>
              {index > 0 && <span className="text-ink-3">/</span>}
              <span className="max-w-40 truncate">{name}</span>
            </Fragment>
          ))}
        </>
      ) : null}
    </div>
  )
}
