/**
 * TabBreadcrumb — folder path of the active tab's node (exploration 0169).
 *
 * A slim strip under the tab bar: 📁 Design / Research. Renders nothing
 * for unfiled nodes or non-folderable surfaces. Query options mirror the
 * Explorer's so the bridge shares subscriptions instead of re-reading.
 */
import type { WorkbenchTab } from './state'
import { FolderSchema, folderPathIds, type FolderLike } from '@xnetjs/data'
import { useQuery } from '@xnetjs/react'
import { FolderClosed } from 'lucide-react'
import { Fragment, useMemo } from 'react'
import { EXPLORER_SCHEMAS, isExplorerNodeType } from './views/explorer-rows'

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

  return useMemo(() => {
    if (!folderable || !tab) return []
    const node = (nodes ?? []).find((doc) => doc.id === tab.nodeId)
    const folderId = typeof node?.folder === 'string' ? node.folder : null
    if (!folderId) return []

    const byId = new Map<string, FolderLike>(
      (folderDocs ?? []).map((doc) => [
        doc.id,
        { id: doc.id, name: doc.name as string, parent: (doc.parent as string) ?? null }
      ])
    )
    if (!byId.has(folderId)) return []
    return folderPathIds(folderId, byId).map((id) => byId.get(id)?.name || 'Untitled folder')
  }, [folderable, tab, nodes, folderDocs])
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
