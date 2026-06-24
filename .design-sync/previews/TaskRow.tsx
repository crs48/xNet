import { ThemeProvider, TaskRow } from '@xnetjs/ui'

const tasks = [
  {
    id: 'task_1',
    title: 'Wire change-log replay into cold boot',
    completed: false,
    status: 'in-progress',
    priority: 'high',
    dueDate: Date.UTC(2026, 5, 30),
    assignees: ['did:key:z6MkpAliceSyncEngine', 'did:key:z6MkpBobProtocol'],
    shortId: 'XN-142',
    referenceCount: 2,
    github: { prState: 'open', reviewState: 'approved', ciState: 'passing' } as const
  },
  {
    id: 'task_2',
    title: 'Rotate hub signing keys',
    completed: false,
    status: 'todo',
    priority: 'urgent',
    dueDate: Date.UTC(2026, 5, 20),
    assignees: ['did:key:z6MkpCarolSec'],
    shortId: 'XN-98'
  },
  {
    id: 'task_3',
    title: 'Triage flaky editor-ux Playwright suite',
    completed: false,
    status: 'triage',
    priority: 'medium',
    dueDate: Date.UTC(2026, 5, 23),
    assignees: [
      'did:key:z6MkpAliceSyncEngine',
      'did:key:z6MkpBobProtocol',
      'did:key:z6MkpDaveQA',
      'did:key:z6MkpEveRelease'
    ],
    shortId: 'XN-203'
  },
  {
    id: 'task_4',
    title: 'Publish protocol conformance vectors',
    completed: true,
    status: 'done',
    priority: 'low',
    assignees: ['did:key:z6MkpBobProtocol'],
    shortId: 'XN-71',
    referenceCount: 5
  }
]

export const TaskList = () => (
  <ThemeProvider defaultTheme="light">
    <div className="max-w-2xl space-y-1 rounded-lg border border-border bg-background p-2">
      {tasks.map((task) => (
        <TaskRow
          key={task.id}
          task={task}
          onOpen={() => undefined}
          onToggleCompleted={() => undefined}
        />
      ))}
    </div>
  </ThemeProvider>
)

export const SelectionAndFocus = () => (
  <ThemeProvider defaultTheme="light">
    <div className="max-w-2xl space-y-1 rounded-lg border border-border bg-background p-2">
      <TaskRow task={tasks[0]} selected onSelect={() => undefined} onOpen={() => undefined} />
      <TaskRow task={tasks[1]} focused onSelect={() => undefined} onOpen={() => undefined} />
      <TaskRow task={tasks[2]} onSelect={() => undefined} onOpen={() => undefined} />
    </div>
  </ThemeProvider>
)

export const Compact = () => (
  <ThemeProvider defaultTheme="light">
    <div className="max-w-2xl rounded-lg border border-border bg-background p-2">
      {tasks.map((task) => (
        <TaskRow key={task.id} task={task} density="compact" onOpen={() => undefined} />
      ))}
    </div>
  </ThemeProvider>
)
