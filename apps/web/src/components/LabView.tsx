/**
 * LabView — the Lab surface (exploration 0180).
 *
 * Edit code, pick a language + runtime rung, Run it (Cmd/Ctrl+Enter), see the
 * captured output, and Publish the Lab as a live workbench command. Sandbox
 * Labs run through the runtime ladder (SES/QuickJS); App Labs render in a
 * sandboxed iframe and relay their output over postMessage.
 */

import type { LabFrameMessage, LabLanguage, LabRunResult, LabRuntimeTier } from '@xnetjs/labs'
import {
  APP_FRAME_SANDBOX,
  LAB_LANGUAGE_OPTIONS,
  LAB_RUNTIME_OPTIONS,
  LabSchema,
  buildAppFrameSrcdoc,
  buildLabExtensionManifest,
  createLabHostBridge,
  publishLabAsExtension
} from '@xnetjs/labs'
import { useNode, useXNet } from '@xnetjs/react'
import { CodeEditor, type CodeEditorLanguage } from '@xnetjs/ui'
import { CheckCircle2, Loader2, Play, Upload } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createWebLabLadder, labStoreFromNodeStore } from '../lib/lab-runtime'
import { usePublishTitle } from '../workbench/route-title'

const DEFAULT_CODE = `// Write code, then Run (Cmd/Ctrl+Enter).
// 'return' a value and use console.log; read your data via xnet.query(...).
const answer = 6 * 7
console.log('hello from your Lab')
return answer
`

const QUIET_BUTTON =
  'flex items-center gap-2 rounded-md border border-hairline bg-surface-0 px-3 py-1.5 text-xs text-ink-1 transition-colors hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-50'

const SELECT =
  'rounded-md border border-hairline bg-surface-0 px-2 py-1.5 text-xs text-ink-1 focus:outline-none'

function editorLanguage(language: LabLanguage): CodeEditorLanguage {
  return language
}

function permissionLines(perms: { schemas?: { read?: string[] | '*' } } | undefined): string {
  const read = perms?.schemas?.read
  if (!read) return '• no special access'
  return read === '*' ? '• Read all your data' : `• Read: ${read.join(', ')}`
}

export function LabView({ labId }: { labId: string }): JSX.Element {
  const { nodeStore, pluginRegistry } = useXNet()
  const { data: lab, update } = useNode(LabSchema, labId, {
    createIfMissing: {
      title: 'Untitled Lab',
      code: DEFAULT_CODE,
      language: 'javascript',
      runtime: 'sandbox'
    }
  })

  const ladder = useMemo(() => createWebLabLadder(), [])
  const host = useMemo(
    () =>
      nodeStore
        ? createLabHostBridge({
            // An authored Lab reads your own workspace; publishing can narrow this.
            store: labStoreFromNodeStore(nodeStore),
            permissions: { schemas: { read: '*' } }
          })
        : undefined,
    [nodeStore]
  )

  const [code, setCode] = useState(lab?.code ?? DEFAULT_CODE)
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<LabRunResult | null>(null)
  const [published, setPublished] = useState<string | null>(null)
  const [appRunId, setAppRunId] = useState<string | null>(null)
  const hydrated = useRef(false)

  const language = (lab?.language as LabLanguage) ?? 'javascript'
  const runtime = (lab?.runtime as LabRuntimeTier) ?? 'sandbox'

  // Seed local code from the node once it loads.
  useEffect(() => {
    if (!hydrated.current && lab?.code !== undefined) {
      setCode(lab.code)
      hydrated.current = true
    }
  }, [lab?.code])

  // Publish the title for the header/tab/recents (0166, 0353).
  usePublishTitle(labId, lab?.title, lab?.id)

  // Persist code edits (lightly debounced).
  useEffect(() => {
    if (!hydrated.current || code === lab?.code) return
    const timer = setTimeout(() => void update({ code }), 500)
    return () => clearTimeout(timer)
  }, [code, lab?.code, update])

  // Collect App-Lab frame messages over postMessage.
  useEffect(() => {
    if (runtime !== 'app' || !appRunId) return
    const logs: LabRunResult['logs'] = []
    const onMessage = (event: MessageEvent<LabFrameMessage & { runId?: string }>) => {
      const data = event.data
      if (!data || data.runId !== appRunId) return
      if (data.type === 'lab:log') logs.push({ level: data.level, message: data.message })
      else if (data.type === 'lab:done') {
        setResult({ ok: true, value: data.value, logs: [...logs], durationMs: 0, engine: 'app' })
        setRunning(false)
      } else if (data.type === 'lab:error') {
        setResult({ ok: false, error: data.error, logs: [...logs], durationMs: 0, engine: 'app' })
        setRunning(false)
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [runtime, appRunId])

  const run = useCallback(async () => {
    setPublished(null)
    setRunning(true)
    if (runtime === 'app') {
      // The iframe (rendered below) runs the code; messages resolve `running`.
      setResult(null)
      setAppRunId(`run-${Date.now()}-${code.length}`)
      return
    }
    try {
      const next = await ladder.run({ code, language, tier: runtime, host, timeoutMs: 2000 })
      setResult(next)
      await update({
        lastOutput: { value: next.value, logs: next.logs },
        lastError: next.ok ? '' : (next.error ?? 'error')
      })
    } catch (err) {
      setResult({
        ok: false,
        logs: [],
        error: err instanceof Error ? err.message : String(err),
        durationMs: 0,
        engine: runtime
      })
    } finally {
      setRunning(false)
    }
  }, [code, language, runtime, host, ladder, update])

  const publish = useCallback(async () => {
    if (!pluginRegistry || !nodeStore) return
    const manifest = buildLabExtensionManifest(
      { id: labId, title: lab?.title || 'Untitled Lab', description: lab?.description },
      {
        permissions: { schemas: { read: '*' } },
        execute: async () => {
          const node = await nodeStore.get(labId as never)
          const props = (node?.properties ?? {}) as Record<string, unknown>
          await ladder.run({
            code: String(props.code ?? ''),
            language: (props.language as LabLanguage) ?? 'javascript',
            tier: (props.runtime as LabRuntimeTier) ?? 'sandbox',
            host
          })
        }
      }
    )
    try {
      const out = await publishLabAsExtension({
        manifest,
        registry: pluginRegistry,
        source: 'authored',
        requestPermission: (perms) =>
          window.confirm(
            `Install "${manifest.name}" as a workbench command?\n\nCapabilities:\n${permissionLines(perms)}`
          )
      })
      setPublished(out.id)
    } catch {
      setPublished(null)
    }
  }, [pluginRegistry, nodeStore, labId, lab?.title, lab?.description, ladder, host])

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={lab?.title ?? ''}
          onChange={(event) => void update({ title: event.target.value })}
          placeholder="Untitled Lab"
          aria-label="Lab title"
          className="min-w-40 flex-1 rounded-md border border-hairline bg-surface-0 px-3 py-1.5 text-sm font-medium text-ink-1 focus:outline-none"
        />
        <select
          value={language}
          aria-label="Language"
          className={SELECT}
          onChange={(event) => void update({ language: event.target.value as LabLanguage })}
        >
          {LAB_LANGUAGE_OPTIONS.map((option) => (
            <option key={option.id} value={option.id}>
              {option.name}
            </option>
          ))}
        </select>
        <select
          value={runtime}
          aria-label="Runtime"
          className={SELECT}
          onChange={(event) => void update({ runtime: event.target.value as LabRuntimeTier })}
        >
          {LAB_RUNTIME_OPTIONS.map((option) => (
            <option key={option.id} value={option.id}>
              {option.name}
            </option>
          ))}
        </select>
        <button className={QUIET_BUTTON} onClick={() => void run()} disabled={running}>
          {running ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
          Run
        </button>
        <button
          className={QUIET_BUTTON}
          onClick={() => void publish()}
          disabled={!pluginRegistry}
          title={pluginRegistry ? 'Publish as a workbench command' : 'Plugins are disabled'}
        >
          <Upload size={14} />
          Publish
        </button>
      </div>

      {/* Editor */}
      <div className="min-h-0 flex-1">
        <CodeEditor
          value={code}
          onChange={setCode}
          language={editorLanguage(language)}
          onRun={() => void run()}
        />
      </div>

      {/* App-Lab iframe (renders + runs DOM code; output relayed over postMessage) */}
      {runtime === 'app' && appRunId ? (
        <iframe
          key={appRunId}
          title="lab-app"
          sandbox={APP_FRAME_SANDBOX}
          srcDoc={buildAppFrameSrcdoc(code, appRunId)}
          className="h-40 w-full rounded-md border border-hairline bg-white"
        />
      ) : null}

      {/* Output */}
      <OutputPanel result={result} published={published} />
    </div>
  )
}

function OutputPanel({
  result,
  published
}: {
  result: LabRunResult | null
  published: string | null
}): JSX.Element {
  return (
    <div
      data-testid="lab-output"
      className="max-h-48 min-h-16 shrink-0 overflow-auto rounded-md border border-hairline bg-surface-1 p-3 font-mono text-xs"
    >
      {published ? (
        <div className="mb-2 flex items-center gap-2 text-ink-2">
          <CheckCircle2 size={13} /> Installed as <span className="text-ink-1">{published}</span>
        </div>
      ) : null}
      {!result ? (
        <span className="text-ink-3">Output appears here after you Run.</span>
      ) : (
        <div className="flex flex-col gap-1">
          {result.logs.map((entry, index) => (
            <div key={index} className={entry.level === 'error' ? 'text-rose-500' : 'text-ink-2'}>
              {entry.message}
            </div>
          ))}
          {result.ok ? (
            result.value !== undefined ? (
              <div className="text-ink-1">⇒ {JSON.stringify(result.value)}</div>
            ) : null
          ) : (
            <div className="text-rose-500">✗ {result.error}</div>
          )}
          <div className="text-ink-3">
            {result.engine} · {result.durationMs}ms
          </div>
        </div>
      )}
    </div>
  )
}
