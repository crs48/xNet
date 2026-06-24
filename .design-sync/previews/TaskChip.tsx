import { ThemeProvider, TaskChip } from '@xnetjs/ui'

const inProgress = {
  id: 'task_sync',
  title: 'Wire change-log replay into cold boot',
  completed: false,
  status: 'in-progress',
  priority: 'high',
  dueDate: Date.UTC(2026, 5, 30),
  shortId: 'XN-142'
}

const overdue = {
  id: 'task_audit',
  title: 'Rotate hub signing keys',
  completed: false,
  status: 'todo',
  priority: 'urgent',
  dueDate: Date.UTC(2026, 5, 20),
  shortId: 'XN-98'
}

const done = {
  id: 'task_done',
  title: 'Publish protocol conformance vectors',
  completed: true,
  status: 'done',
  priority: 'medium',
  shortId: 'XN-71'
}

export const States = () => (
  <ThemeProvider defaultTheme="light">
    <div className="flex flex-wrap gap-3">
      <TaskChip task={inProgress} onOpen={() => undefined} onToggleCompleted={() => undefined} />
      <TaskChip task={overdue} onOpen={() => undefined} onToggleCompleted={() => undefined} />
      <TaskChip task={done} onOpen={() => undefined} onToggleCompleted={() => undefined} />
    </div>
  </ThemeProvider>
)

export const InlineInText = () => (
  <ThemeProvider defaultTheme="light">
    <p className="max-w-md text-sm text-foreground">
      Blocked on{' '}
      <TaskChip task={overdue} onOpen={() => undefined} /> until the new keypair lands, then{' '}
      <TaskChip task={inProgress} onOpen={() => undefined} /> can resume.
    </p>
  </ThemeProvider>
)

export const Tombstones = () => (
  <ThemeProvider defaultTheme="light">
    <div className="flex flex-wrap gap-3">
      <TaskChip
        task={{ id: 'task_archived', title: 'Migrate legacy avatars', completed: false, deleted: true }}
        onRestore={() => undefined}
      />
      <TaskChip task={null} />
    </div>
  </ThemeProvider>
)
