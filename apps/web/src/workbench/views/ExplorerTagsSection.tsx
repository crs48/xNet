/**
 * Explorer Tags section (exploration 0169): active tags ranked by usage
 * across the loaded items; clicking opens the tag page.
 */
import type { ExplorerItem } from './explorer-rows'
import { useNavigate } from '@tanstack/react-router'
import { Hash } from 'lucide-react'
import { useMemo } from 'react'
import { rankTagsByUsage } from '../../components/tag-view-data'
import { useWorkspaceTags } from '../../hooks/useWorkspaceTags'
import { navigateToNode } from '../navigation'
import { setPreviewIntent } from '../tabs'

export function ExplorerTagsSection({ items }: { items: ExplorerItem[] }) {
  const navigate = useNavigate()
  const { allTags } = useWorkspaceTags()

  const ranked = useMemo(() => {
    const active = allTags.filter((tag) => !tag.archived && tag.name)
    return rankTagsByUsage(active, items)
  }, [allTags, items])

  if (ranked.length === 0) return null
  return (
    <div className="px-1">
      <div className="px-2 pb-1 pt-3 text-[10px] font-medium uppercase tracking-wider text-ink-3">
        Tags
      </div>
      {ranked.map((tag) => (
        <button
          key={tag.id}
          type="button"
          onClick={() => {
            setPreviewIntent()
            navigateToNode(navigate, 'tag', tag.id)
          }}
          className="flex h-[26px] w-full cursor-pointer items-center gap-2 rounded-sm border-none bg-transparent px-2 text-left text-ink-2 transition-colors hover:bg-accent hover:text-ink-1"
        >
          <Hash size={13} strokeWidth={1.5} className="shrink-0 text-ink-3" />
          <span className="min-w-0 flex-1 truncate text-xs">{tag.name}</span>
        </button>
      ))}
    </div>
  )
}
