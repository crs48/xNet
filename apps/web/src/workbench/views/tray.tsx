/**
 * Bottom Panel tray views (exploration 0166): quick capture,
 * notifications, sync activity, and the query console — the
 * "terminal" of a data workspace (run a QueryAST, get a table).
 */
import { useNavigate } from '@tanstack/react-router'
import { SavedViewSchema, TaskSchema, type SavedViewDescriptor } from '@xnetjs/data'
import { SavedViewRunner, useHubStatus, useMutate, useQuery } from '@xnetjs/react'
import { CheckSquare2, CornerDownLeft, FileText } from 'lucide-react'
import { useState } from 'react'
import { InboxTray } from '../../comms/InboxTray'
import { isWorkerRuntimeEnabled } from '../../lib/data-runtime'
import { WORKBENCH_SAVED_VIEW_REGISTRY } from '../../lib/saved-view-registry'
import { useWorkbenchStatus } from '../status'
import { parseConsoleInput } from './console-input'

function generateId(prefix: string): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return `${prefix}_${globalThis.crypto.randomUUID()}`
  }
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
}

// ─── Quick capture ─────────────────────────────────────────────────

export function QuickCaptureTray() {
  const { create } = useMutate()
  const navigate = useNavigate()
  const [value, setValue] = useState('')
  const [captured, setCaptured] = useState<string[]>([])

  const captureTask = async () => {
    const title = value.trim()
    if (!title) return
    setValue('')
    await create(
      TaskSchema,
      { title, completed: false, status: 'todo', source: 'api' },
      generateId('task')
    )
    setCaptured((prev) => [title, ...prev].slice(0, 6))
  }

  const capturePage = () => {
    const title = value.trim()
    if (!title) return
    setValue('')
    const id = `default/${title.toLowerCase().replace(/\s+/g, '-')}`
    void navigate({ to: '/doc/$docId', params: { docId: id } })
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-2 p-3">
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') void captureTask()
          }}
          placeholder="Capture a task… (Enter)"
          className="h-7 flex-1 rounded-md border border-hairline bg-surface-0 px-2 text-xs text-ink-1 outline-none placeholder:text-ink-3 focus:border-border-emphasis"
        />
        <button
          type="button"
          onClick={() => void captureTask()}
          disabled={!value.trim()}
          className="flex h-7 cursor-pointer items-center gap-1.5 rounded-md border border-hairline bg-surface-0 px-2 text-xs text-ink-2 transition-colors hover:text-ink-1 disabled:cursor-default disabled:opacity-50"
        >
          <CheckSquare2 size={12} strokeWidth={1.5} />
          Task
          <CornerDownLeft size={10} strokeWidth={1.5} className="text-ink-3" />
        </button>
        <button
          type="button"
          onClick={capturePage}
          disabled={!value.trim()}
          className="flex h-7 cursor-pointer items-center gap-1.5 rounded-md border border-hairline bg-surface-0 px-2 text-xs text-ink-2 transition-colors hover:text-ink-1 disabled:cursor-default disabled:opacity-50"
        >
          <FileText size={12} strokeWidth={1.5} />
          Page
        </button>
      </div>
      {captured.length > 0 && (
        <ul className="m-0 flex list-none flex-col gap-1 overflow-y-auto p-0 text-xs text-ink-3">
          {captured.map((title, index) => (
            <li key={`${title}-${index}`} className="truncate">
              ✓ {title}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ─── Notifications ─────────────────────────────────────────────────

function JobsList({ jobs }: { jobs: ReturnType<typeof useWorkbenchStatus.getState>['jobs'] }) {
  const jobList = Object.values(jobs)
  if (jobList.length === 0) return null
  return (
    <ul className="m-0 flex shrink-0 list-none flex-col gap-1 border-b border-hairline p-3 text-xs text-ink-2">
      {jobList.map((job) => (
        <li key={job.id} className="flex items-center gap-2">
          <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-ink-3" />
          {job.label}
          {typeof job.progress === 'number' && (
            <span className="font-mono text-ink-3">{Math.round(job.progress * 100)}%</span>
          )}
        </li>
      ))}
    </ul>
  )
}

export function NotificationsTray() {
  const jobs = useWorkbenchStatus((state) => state.jobs)
  return (
    <div className="flex h-full min-h-0 flex-col">
      <JobsList jobs={jobs} />
      <div className="min-h-0 flex-1">
        <InboxTray />
      </div>
    </div>
  )
}

// ─── Sync activity ─────────────────────────────────────────────────

export function SyncTray() {
  const hubStatus = useHubStatus()
  const jobs = useWorkbenchStatus((state) => state.jobs)

  return (
    <div className="flex h-full min-h-0 flex-col gap-2 p-3 font-mono text-[11px] text-ink-2">
      <div>
        hub: <span className="text-ink-1">{hubStatus}</span>
      </div>
      <div>
        runtime:{' '}
        <span className="text-ink-1">{isWorkerRuntimeEnabled() ? 'worker' : 'main-thread'}</span>
      </div>
      <div>
        background jobs:{' '}
        <span className="text-ink-1">
          {Object.values(jobs).length === 0
            ? 'idle'
            : Object.values(jobs)
                .map((job) => job.label)
                .join(', ')}
        </span>
      </div>
    </div>
  )
}

// ─── Query console ─────────────────────────────────────────────────

const CONSOLE_PLACEHOLDER = `{ "version": 1, "title": "Console", "query": { … QueryAST … } }`

export function QueryConsoleTray() {
  const [source, setSource] = useState('')
  const [descriptor, setDescriptor] = useState<SavedViewDescriptor | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [runId, setRunId] = useState(0)

  const run = () => {
    const result = parseConsoleInput(source)
    setError(result.error)
    setDescriptor(result.descriptor)
    if (result.descriptor) setRunId((id) => id + 1)
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-2 p-3">
      <div className="flex items-start gap-2">
        <textarea
          value={source}
          onChange={(event) => setSource(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
              event.preventDefault()
              run()
            }
          }}
          placeholder={CONSOLE_PLACEHOLDER}
          spellCheck={false}
          className="h-16 flex-1 resize-y rounded-md border border-hairline bg-surface-0 p-2 font-mono text-[11px] text-ink-1 outline-none placeholder:text-ink-3 focus:border-border-emphasis"
        />
        <button
          type="button"
          onClick={run}
          className="h-7 cursor-pointer rounded-md border border-hairline bg-surface-0 px-3 font-mono text-[11px] text-ink-1 transition-colors hover:bg-accent"
          title="Run (⌘Enter)"
        >
          Run
        </button>
      </div>
      {error && (
        <pre className="m-0 whitespace-pre-wrap font-mono text-[11px] text-destructive">
          {error}
        </pre>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {descriptor ? (
          <SavedViewRunner
            descriptor={descriptor}
            registry={WORKBENCH_SAVED_VIEW_REGISTRY}
            resetKey={String(runId)}
            emptyLabel="No rows."
          />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-ink-3">
            Paste a SavedViewDescriptor or bare QueryAST and run it.
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Saved views need a queryable list too (left Data view) ────────

export function useSavedViews() {
  return useQuery(SavedViewSchema, { orderBy: { updatedAt: 'desc' }, limit: 100 })
}
