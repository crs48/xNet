/**
 * TabBreadcrumb — folder path of the active tab's node (exploration 0169).
 *
 * A slim strip under the tab bar: 📁 Design / Research. Renders nothing
 * for unfiled nodes or non-folderable surfaces. Query options mirror the
 * Explorer's so the bridge shares subscriptions instead of re-reading.
 */
import type { WorkbenchTab } from './state'
import { FolderSchema } from '@xnetjs/data'
import { useQuery } from '@xnetjs/react'
import { FolderClosed } from 'lucide-react'
import { Fragment, useMemo } from 'react'
import { folderPathNames } from './views/explorer-folders'
import { EXPLORER_SCHEMAS, isExplorerNodeType } from './views/explorer-items'

const QUERY_LIMIT = 500

function useFolderPathNames(tab: WorkbenchTab | null): string[] {
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
    () => (folderable && tab ? folderPathNames(tab.nodeId, nodes, folderDocs) : []),
    [folderable, tab, nodes, folderDocs]
  )
}

export function TabBreadcrumb({ tab }: { tab: WorkbenchTab | null }) {
  const names = useFolderPathNames(tab)
  if (names.length === 0) return null
  return (
    <div className="flex h-6 shrink-0 items-center gap-1.5 border-b border-hairline px-3 text-[11px] text-ink-3">
      <FolderClosed size={11} strokeWidth={1.5} className="shrink-0" />
      {names.map((name, index) => (
        <Fragment key={`${index}-${name}`}>
          {index > 0 && <span className="text-ink-3">/</span>}
          <span className="max-w-40 truncate">{name}</span>
        </Fragment>
      ))}
    </div>
  )
}
