import { ThemeProvider, TaskDetailForm } from '@xnetjs/ui'

const people = [
  { did: 'did:key:z6MkpAliceSyncEngine', name: 'Alice Nguyen', isSelf: true },
  { did: 'did:key:z6MkpBobProtocol', name: 'Bob Mercer' },
  { did: 'did:key:z6MkpCarolSec', name: 'Carol Diaz' },
  { did: 'did:key:z6MkpDaveQA', name: 'Dave Okafor' }
]

const tagOptions = [
  { id: 'tag_sync', name: 'sync' },
  { id: 'tag_protocol', name: 'protocol' },
  { id: 'tag_p0', name: 'p0' }
]

const task = {
  id: 'task_142',
  title: 'Wire change-log replay into cold boot',
  completed: false,
  status: 'in-progress',
  priority: 'high',
  dueDate: Date.UTC(2026, 5, 30),
  assignees: ['did:key:z6MkpAliceSyncEngine', 'did:key:z6MkpBobProtocol'],
  shortId: 'XN-142'
}

const noop = () => undefined

export const Editing = () => (
  <ThemeProvider defaultTheme="light">
    <div className="max-w-md">
      <TaskDetailForm
        task={task}
        people={people}
        tags={[
          { id: 'tag_sync', name: 'sync' },
          { id: 'tag_p0', name: 'p0' }
        ]}
        tagOptions={tagOptions}
        sourceLabel="Open in Sync workspace"
        onTitleChange={noop}
        onStatusChange={noop}
        onPriorityChange={noop}
        onDueDateChange={noop}
        onAssigneesChange={noop}
        onTagsChange={noop}
        onOpenSource={noop}
        onClose={noop}
      />
    </div>
  </ThemeProvider>
)

export const MinimalReadOnly = () => (
  <ThemeProvider defaultTheme="light">
    <div className="max-w-md">
      <TaskDetailForm
        task={{
          id: 'task_71',
          title: 'Publish protocol conformance vectors',
          completed: true,
          status: 'done',
          priority: 'medium',
          dueDate: Date.UTC(2026, 5, 20),
          assignees: ['did:key:z6MkpBobProtocol'],
          shortId: 'XN-71'
        }}
        people={people}
        titleReadOnly
        metaNotice="Title is owned by the host document."
      />
    </div>
  </ThemeProvider>
)
