import { CodeEditor } from '@xnetjs/ui'

// CodeMirror-backed editor. Mounts lazily on a real DOM node, so it renders
// the value with syntax highlighting inside a fixed-height bordered box.
const tsSource = `import { defineSchema, string, ref } from '@xnetjs/data'

export const Task = defineSchema('Task', {
  title: string({ default: 'Untitled' }),
  done: boolean({ default: false }),
  assignee: ref('Person'),
})

export function nextStatus(task: Task): string {
  if (task.done) return 'archived'
  return task.assignee ? 'in-progress' : 'backlog'
}
`

export const TypeScript = () => (
  <div className="h-72 overflow-hidden">
    <CodeEditor value={tsSource} language="typescript" />
  </div>
)

const pySource = `def merge_lww(local, remote):
    """Last-writer-wins by lamport clock, author as tiebreak."""
    if local.lamport != remote.lamport:
        return local if local.lamport > remote.lamport else remote
    return local if local.author > remote.author else remote
`

export const Python = () => (
  <div className="h-72 overflow-hidden">
    <CodeEditor value={pySource} language="python" readOnly />
  </div>
)
