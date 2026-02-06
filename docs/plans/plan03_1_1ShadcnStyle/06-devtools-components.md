# 06 - DevTools-Specific Components

> Specialized components for the devtools panel: TreeView, StatusDot, LogEntry, KeyValue, CodeBlock

## Overview

While the devtools panels use standard primitives (Tabs, ScrollArea, etc.), they also need specialized components for protocol inspection. These components always render in dark mode (the devtools panel forces `.dark` context) and are designed for information density.

## Components

### TreeView

**Used by:** Yjs Inspector (Y.Doc tree), Node Explorer (property hierarchy).

```typescript
// packages/ui/src/composed/TreeView.tsx

interface TreeNode {
  id: string
  label: string
  icon?: ReactNode
  badge?: string | ReactNode
  children?: TreeNode[]
  defaultExpanded?: boolean
  onSelect?: () => void
}

interface TreeViewProps {
  nodes: TreeNode[]
  className?: string
  selectedId?: string
  onSelect?: (id: string) => void
}

export function TreeView({ nodes, className, selectedId, onSelect }: TreeViewProps) {
  return (
    <div className={cn('text-sm', className)} role="tree">
      {nodes.map(node => (
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

function TreeNodeComponent({ node, depth, selectedId, onSelect }: {
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
          isSelected && 'bg-accent text-accent-foreground',
        )}
        style={{ paddingLeft: depth * 16 + 4 }}
        onClick={() => {
          if (hasChildren) setExpanded(!expanded)
          onSelect?.(node.id)
          node.onSelect?.()
        }}
      >
        {/* Expand/collapse arrow */}
        {hasChildren ? (
          <ChevronRight className={cn(
            'h-3 w-3 shrink-0 text-muted-foreground transition-transform',
            expanded && 'rotate-90'
          )} />
        ) : (
          <span className="w-3 shrink-0" />
        )}

        {/* Icon */}
        {node.icon && <span className="shrink-0">{node.icon}</span>}

        {/* Label */}
        <span className="truncate">{node.label}</span>

        {/* Badge */}
        {node.badge && (
          <span className="ml-auto text-[10px] text-muted-foreground shrink-0">
            {node.badge}
          </span>
        )}
      </div>

      {/* Children */}
      {expanded && node.children?.map(child => (
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
```

### StatusDot

**Used by:** Sync Monitor (peer status), connection indicators.

```typescript
// packages/ui/src/composed/StatusDot.tsx

const statusDotVariants = cva(
  'inline-block rounded-full shrink-0',
  {
    variants: {
      status: {
        connected: 'bg-success',
        connecting: 'bg-warning animate-pulse',
        disconnected: 'bg-muted-foreground',
        error: 'bg-destructive',
        synced: 'bg-success',
        syncing: 'bg-primary animate-pulse',
      },
      size: {
        sm: 'h-1.5 w-1.5',
        md: 'h-2 w-2',
        lg: 'h-2.5 w-2.5',
      },
    },
    defaultVariants: {
      size: 'md',
    },
  }
)

interface StatusDotProps extends VariantProps<typeof statusDotVariants> {
  className?: string
  label?: string
}

export function StatusDot({ status, size, className, label }: StatusDotProps) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn(statusDotVariants({ status, size }), className)} />
      {label && <span className="text-xs text-muted-foreground">{label}</span>}
    </span>
  )
}
```

### LogEntry

**Used by:** Sync Monitor event log, Change Timeline, Telemetry events.

```typescript
// packages/ui/src/composed/LogEntry.tsx

interface LogEntryProps {
  timestamp: number | string
  direction?: 'in' | 'out' | 'info' | 'error' | 'success'
  message: string | ReactNode
  detail?: string
  className?: string
}

const directionConfig = {
  in: { arrow: '←', color: 'text-chart-2' },
  out: { arrow: '→', color: 'text-chart-1' },
  info: { arrow: '●', color: 'text-muted-foreground' },
  error: { arrow: '!', color: 'text-destructive' },
  success: { arrow: '✓', color: 'text-success' },
}

export function LogEntry({ timestamp, direction = 'info', message, detail, className }: LogEntryProps) {
  const config = directionConfig[direction]

  return (
    <div className={cn(
      'flex items-start gap-2 px-3 py-0.5 font-mono text-[11px] hover:bg-accent/50',
      className
    )}>
      <span className="text-muted-foreground w-14 shrink-0 text-right">
        {formatTime(timestamp)}
      </span>
      <span className={cn('w-3 text-center shrink-0', config.color)}>
        {config.arrow}
      </span>
      <span className="text-foreground flex-1 break-all">
        {message}
      </span>
      {detail && (
        <span className="text-muted-foreground shrink-0 text-[10px]">
          {detail}
        </span>
      )}
    </div>
  )
}
```

### KeyValue

**Used by:** Node Explorer detail pane, Change detail, any property display.

```typescript
// packages/ui/src/composed/KeyValue.tsx

interface KeyValueProps {
  label: string
  value: string | ReactNode
  mono?: boolean
  copyable?: boolean
  className?: string
}

export function KeyValue({ label, value, mono, copyable, className }: KeyValueProps) {
  return (
    <div className={cn('flex items-start gap-2 text-[11px] py-0.5', className)}>
      <span className="text-muted-foreground min-w-[80px] shrink-0">{label}</span>
      <span className={cn(
        'text-foreground flex-1 break-all',
        mono && 'font-mono'
      )}>
        {value}
      </span>
      {copyable && typeof value === 'string' && (
        <CopyButton text={value} />
      )}
    </div>
  )
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)

  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      }}
      className="text-muted-foreground hover:text-foreground shrink-0"
      title="Copy"
    >
      {copied ? <CheckIcon className="h-3 w-3" /> : <CopyIcon className="h-3 w-3" />}
    </button>
  )
}
```

### CodeBlock

**Used by:** Change Timeline payload display, Yjs Inspector values.

```typescript
// packages/ui/src/composed/CodeBlock.tsx

interface CodeBlockProps {
  code: string
  language?: string
  maxHeight?: number
  className?: string
}

export function CodeBlock({ code, language, maxHeight = 200, className }: CodeBlockProps) {
  return (
    <ScrollArea className={cn('rounded-md', className)} style={{ maxHeight }}>
      <pre className="bg-muted/50 rounded-md p-3 text-[11px] font-mono overflow-x-auto">
        <code className="text-foreground whitespace-pre-wrap break-all">
          {code}
        </code>
      </pre>
    </ScrollArea>
  )
}
```

### DataTable (Simplified)

**Used by:** State vector display, peer scores, telemetry metrics.

```typescript
// packages/ui/src/composed/DataTable.tsx

interface Column<T> {
  key: keyof T | string
  label: string
  align?: 'left' | 'right' | 'center'
  render?: (value: unknown, row: T) => ReactNode
}

interface DataTableProps<T> {
  columns: Column<T>[]
  data: T[]
  className?: string
  compact?: boolean
}

export function DataTable<T extends Record<string, unknown>>({
  columns, data, className, compact
}: DataTableProps<T>) {
  const cellPadding = compact ? 'px-2 py-0.5' : 'px-3 py-1.5'

  return (
    <div className={cn('w-full overflow-auto', className)}>
      <table className="w-full text-[11px]">
        <thead>
          <tr className="border-b border-border">
            {columns.map(col => (
              <th key={String(col.key)} className={cn(
                cellPadding, 'font-medium text-muted-foreground',
                col.align === 'right' && 'text-right',
                col.align === 'center' && 'text-center',
              )}>
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, i) => (
            <tr key={i} className="border-b border-border/50 hover:bg-accent/50">
              {columns.map(col => (
                <td key={String(col.key)} className={cn(
                  cellPadding, 'text-foreground',
                  col.align === 'right' && 'text-right',
                  col.align === 'center' && 'text-center',
                )}>
                  {col.render
                    ? col.render(row[col.key as keyof T], row)
                    : String(row[col.key as keyof T] ?? '')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
```

## Checklist

- [ ] Implement TreeView with expand/collapse and selection
- [ ] Implement StatusDot with CVA variants
- [ ] Implement LogEntry with direction colors
- [ ] Implement KeyValue with copy support
- [ ] Implement CodeBlock with ScrollArea
- [ ] Implement DataTable for simple tabular data
- [ ] Export all composed components from package index
- [ ] Verify all components render with semantic tokens
- [ ] Verify all components work in forced dark mode (devtools context)
- [ ] Write basic render tests for TreeView
- [ ] Write tests for StatusDot variants

---

[Previous: App Theming](./05-app-theming.md)
