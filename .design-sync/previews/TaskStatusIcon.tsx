import { ThemeProvider, TaskStatusIcon } from '@xnetjs/ui'

const STATUSES: { status: string; label: string }[] = [
  { status: 'triage', label: 'Triage' },
  { status: 'backlog', label: 'Backlog' },
  { status: 'todo', label: 'To Do' },
  { status: 'in-progress', label: 'In Progress' },
  { status: 'in-review', label: 'In Review' },
  { status: 'done', label: 'Done' },
  { status: 'cancelled', label: 'Cancelled' }
]

export const AllStates = () => (
  <ThemeProvider defaultTheme="light">
    <div className="flex flex-wrap gap-3">
      {STATUSES.map(({ status, label }) => (
        <div
          key={status}
          className="flex items-center gap-2 rounded-lg border border-border bg-background p-3 text-sm text-foreground"
        >
          <TaskStatusIcon status={status} size={16} />
          {label}
        </div>
      ))}
    </div>
  </ThemeProvider>
)

export const Sizes = () => (
  <ThemeProvider defaultTheme="light">
    <div className="flex items-center gap-3 rounded-lg border border-border bg-background p-3">
      <TaskStatusIcon status="in-progress" size={12} />
      <TaskStatusIcon status="in-progress" size={16} />
      <TaskStatusIcon status="in-progress" size={20} />
      <TaskStatusIcon status="done" size={24} />
      <TaskStatusIcon status="in-review" size={28} />
    </div>
  </ThemeProvider>
)
