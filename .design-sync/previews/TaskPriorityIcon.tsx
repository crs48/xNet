import { ThemeProvider, TaskPriorityIcon } from '@xnetjs/ui'

// `medium` intentionally renders nothing (the default, "no signal" priority).
const PRIORITIES: { priority: string; label: string }[] = [
  { priority: 'low', label: 'Low' },
  { priority: 'medium', label: 'Medium' },
  { priority: 'high', label: 'High' },
  { priority: 'urgent', label: 'Urgent' }
]

export const AllPriorities = () => (
  <ThemeProvider defaultTheme="light">
    <div className="flex flex-wrap gap-3">
      {PRIORITIES.map(({ priority, label }) => (
        <div
          key={priority}
          className="flex items-center gap-2 rounded-lg border border-border bg-background p-3 text-sm text-foreground"
        >
          <span className="flex h-4 w-4 items-center justify-center">
            <TaskPriorityIcon priority={priority} size={16} />
          </span>
          {label}
        </div>
      ))}
    </div>
  </ThemeProvider>
)

export const Sizes = () => (
  <ThemeProvider defaultTheme="light">
    <div className="flex items-center gap-3 rounded-lg border border-border bg-background p-3">
      <TaskPriorityIcon priority="high" size={14} />
      <TaskPriorityIcon priority="high" size={18} />
      <TaskPriorityIcon priority="high" size={22} />
      <TaskPriorityIcon priority="urgent" size={18} />
      <TaskPriorityIcon priority="urgent" size={22} />
    </div>
  </ThemeProvider>
)
