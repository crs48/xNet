import { ThemeProvider, TaskCard } from '@xnetjs/ui'

const inProgress = {
  id: 'task_1',
  title: 'Wire change-log replay into cold boot',
  completed: false,
  status: 'in-progress',
  priority: 'high',
  dueDate: Date.UTC(2026, 5, 30),
  assignees: ['did:key:z6MkpAliceSyncEngine', 'did:key:z6MkpBobProtocol'],
  shortId: 'XN-142',
  referenceCount: 3,
  github: { prState: 'open', reviewState: 'approved', ciState: 'passing' } as const
}

const urgent = {
  id: 'task_2',
  title: 'Rotate hub signing keys before the cert expires',
  completed: false,
  status: 'todo',
  priority: 'urgent',
  dueDate: Date.UTC(2026, 5, 20),
  assignees: ['did:key:z6MkpCarolSec'],
  shortId: 'XN-98'
}

const done = {
  id: 'task_3',
  title: 'Publish protocol conformance vectors',
  completed: true,
  status: 'done',
  priority: 'low',
  assignees: ['did:key:z6MkpBobProtocol'],
  shortId: 'XN-71',
  referenceCount: 5
}

export const Cards = () => (
  <ThemeProvider defaultTheme="light">
    <div className="flex flex-wrap gap-3">
      <TaskCard task={inProgress} className="w-64" onOpen={() => undefined} onToggleCompleted={() => undefined} />
      <TaskCard task={urgent} className="w-64" onOpen={() => undefined} onToggleCompleted={() => undefined} />
      <TaskCard task={done} className="w-64" onOpen={() => undefined} onToggleCompleted={() => undefined} />
    </div>
  </ThemeProvider>
)

export const Focused = () => (
  <ThemeProvider defaultTheme="light">
    <div className="flex flex-wrap gap-3">
      <TaskCard task={inProgress} focused className="w-64" onOpen={() => undefined} />
    </div>
  </ThemeProvider>
)

export const Mini = () => (
  <ThemeProvider defaultTheme="light">
    <div className="flex flex-col gap-1.5">
      <TaskCard task={inProgress} mode="mini" className="w-56" onOpen={() => undefined} />
      <TaskCard task={urgent} mode="mini" className="w-56" onOpen={() => undefined} />
      <TaskCard task={done} mode="mini" className="w-56" onOpen={() => undefined} />
    </div>
  </ThemeProvider>
)

export const Tombstone = () => (
  <ThemeProvider defaultTheme="light">
    <div className="flex flex-wrap gap-3">
      <TaskCard
        task={{ id: 'task_x', title: 'Migrate legacy avatars', completed: false, deleted: true }}
        className="w-64"
        onRestore={() => undefined}
      />
    </div>
  </ThemeProvider>
)
