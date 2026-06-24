import { Badge, ResponsiveTable, type ResponsiveTableColumn } from '@xnetjs/ui'

// Responsive table: a real <table> on desktop, stacked cards on mobile.
// Columns support `primary`, `align`, and custom `render`. `keyField` IDs rows.

type SurfaceRow = {
  id: string
  title: string
  owner: string
  status: string
  updated: string
}

const columns: ResponsiveTableColumn<SurfaceRow>[] = [
  { key: 'title', header: 'Surface', primary: true },
  { key: 'owner', header: 'Owner' },
  {
    key: 'status',
    header: 'Status',
    render: (value) => (
      <Badge variant={value === 'Live' ? 'success' : 'secondary'}>{String(value)}</Badge>
    )
  },
  { key: 'updated', header: 'Updated', align: 'right' }
]

const rows: SurfaceRow[] = [
  { id: '1', title: 'Storybook manager', owner: 'UI Platform', status: 'Live', updated: '2m ago' },
  { id: '2', title: 'Preview workspace', owner: 'Codex', status: 'Draft', updated: '18m ago' },
  { id: '3', title: 'Electron menu', owner: 'Desktop', status: 'Live', updated: '1h ago' },
  { id: '4', title: 'Sync inspector', owner: 'Protocol', status: 'Live', updated: '3h ago' },
  { id: '5', title: 'Billing dashboard', owner: 'Cloud', status: 'Draft', updated: 'Yesterday' }
]

export const Striped = () => (
  <div className="max-w-2xl rounded-lg border border-border bg-background p-3">
    <ResponsiveTable data={rows} columns={columns} keyField="id" striped hoverable />
  </div>
)

export const Empty = () => (
  <div className="max-w-2xl rounded-lg border border-border bg-background p-3">
    <ResponsiveTable
      data={[]}
      columns={columns}
      keyField="id"
      emptyState={
        <div className="py-8 text-center text-sm text-foreground-muted">
          No surfaces yet. Create a story to get started.
        </div>
      }
    />
  </div>
)
