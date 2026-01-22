import { useState, type ReactNode } from 'react'
import { ChevronRight } from 'lucide-react'
import { cn } from '../utils'

export interface TreeNode {
  id: string
  label: string
  icon?: ReactNode
  badge?: string | ReactNode
  children?: TreeNode[]
  defaultExpanded?: boolean
  onSelect?: () => void
}

export interface TreeViewProps {
  nodes: TreeNode[]
  className?: string
  selectedId?: string
  onSelect?: (id: string) => void
}

export function TreeView({ nodes, className, selectedId, onSelect }: TreeViewProps) {
  return (
    <div className={cn('text-sm', className)} role="tree">
      {nodes.map((node) => (
        <TreeNodeComponent
          key={node.id}
          node={node}
          depth={0}
          selectedId={selectedId}
          onSelect={onSelect}
        />
      ))}
    </div>
  )
}

function TreeNodeComponent({
  node,
  depth,
  selectedId,
  onSelect
}: {
  node: TreeNode
  depth: number
  selectedId?: string
  onSelect?: (id: string) => void
}) {
  const [expanded, setExpanded] = useState(node.defaultExpanded ?? depth < 1)
  const hasChildren = node.children && node.children.length > 0
  const isSelected = selectedId === node.id

  return (
    <div role="treeitem" aria-expanded={hasChildren ? expanded : undefined}>
      <div
        className={cn(
          'flex items-center gap-1 py-0.5 px-1 rounded-sm cursor-pointer text-[13px]',
          'hover:bg-accent hover:text-accent-foreground',
          isSelected && 'bg-accent text-accent-foreground'
        )}
        style={{ paddingLeft: depth * 16 + 4 }}
        onClick={() => {
          if (hasChildren) setExpanded(!expanded)
          onSelect?.(node.id)
          node.onSelect?.()
        }}
      >
        {hasChildren ? (
          <ChevronRight
            className={cn(
              'h-3 w-3 shrink-0 text-muted-foreground transition-transform',
              expanded && 'rotate-90'
            )}
          />
        ) : (
          <span className="w-3 shrink-0" />
        )}

        {node.icon && <span className="shrink-0">{node.icon}</span>}

        <span className="truncate">{node.label}</span>

        {node.badge && (
          <span className="ml-auto text-[10px] text-muted-foreground shrink-0">{node.badge}</span>
        )}
      </div>

      {expanded &&
        node.children?.map((child) => (
          <TreeNodeComponent
            key={child.id}
            node={child}
            depth={depth + 1}
            selectedId={selectedId}
            onSelect={onSelect}
          />
        ))}
    </div>
  )
}
