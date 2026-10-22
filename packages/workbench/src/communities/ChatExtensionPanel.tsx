import type { CommunityAgentRun } from './agent-contract'
import type { CommunityData } from './use-community-data'
import { PluginSourceSchema } from '@xnetjs/plugins'
import { useQuery } from '@xnetjs/react'
import { Code, Play, RotateCcw, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  CHAT_PREVIEW_POLICY,
  readExtensionProposal,
  watchlistSource,
  type ChatPreviewMessage,
  type ChatPreviewNode
} from './agent-extension'
import { compileChatExtension, runChatExtension } from './extension-sandbox'
import { IconButton, inputClass, primaryButton, secondaryButton } from './primitives'
interface Revision {
  id: string
  title: string
  summary: string
  source: string
  hash: string
  actor: string
  createdAt: number
  base?: string
}
function PreviewTree({ node }: { node: ChatPreviewNode }) {
  const styles = {
    stack: 'flex flex-col gap-3',
    grid: 'grid grid-cols-1 gap-3 sm:grid-cols-2',
    card: 'rounded-xl border border-border p-4',
    text: 'whitespace-pre-wrap text-sm leading-6',
    badge: 'inline-block self-start rounded-full bg-muted px-3 py-1 text-xs'
  }
  return (
    <div className={styles[node.type]}>
      {node.text}
      {node.children?.map((child, index) => (
        <PreviewTree key={index} node={child} />
      ))}
    </div>
  )
}
export function ChatExtensionPanel({
  channelId,
  data,
  messages,
  run,
  onClose
}: {
  channelId: string
  data: CommunityData
  messages: ChatPreviewMessage[]
  run?: CommunityAgentRun
  onClose: () => void
}) {
  const [source, setSource] = useState(watchlistSource)
  const [title, setTitle] = useState('Our watchlist')
  const [summary, setSummary] = useState('A view of films and links shared in this conversation.')
  const [manualEdit, setManualEdit] = useState(false)
  const [baseRevision, setBaseRevision] = useState<string | undefined>()
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [tree, setTree] = useState<ChatPreviewNode | null>(null)
  const [revision, setRevision] = useState<Revision | null>(null)
  const [installed, setInstalled] = useState<string | null>(null)
  const [status, setStatus] = useState('')
  const operation = useRef<AbortController | null>(null)
  const installKey = `xnet:chat-extension:${data.did}:${channelId}`
  const revisions = useQuery(PluginSourceSchema, { orderBy: { createdAt: 'desc' }, limit: 200 })
  const history = revisions.data.flatMap((node): Revision[] => {
    const manifest = node.manifest as Record<string, unknown> | undefined
    const files = node.files as Record<string, unknown> | undefined
    const info = manifest?.chatPreview as Record<string, unknown> | undefined
    if (
      node.createdBy !== data.did ||
      info?.channelId !== channelId ||
      typeof files?.['index.ts'] !== 'string' ||
      typeof info?.hash !== 'string'
    )
      return []
    return [
      {
        id: node.id,
        title: node.name ?? 'Untitled extension',
        summary: node.description ?? '',
        source: files['index.ts'],
        hash: info.hash,
        actor: String(info.actor),
        createdAt: node.createdAt,
        base: typeof info.base === 'string' ? info.base : undefined
      }
    ]
  })
  useEffect(() => {
    try {
      setInstalled(localStorage.getItem(installKey))
    } catch {
      setError('This device cannot remember extension installations.')
    }
    return () => operation.current?.abort()
  }, [installKey])
  const proposalText = run?.text
  const proposalId = run?.id
  useEffect(() => {
    if (!proposalText) return
    try {
      const proposal = readExtensionProposal(proposalText)
      setSource(proposal.source)
      setTitle(proposal.title)
      setSummary(proposal.summary)
      setBaseRevision(undefined)
      setRevision(null)
      setManualEdit(false)
      setStatus('Review this proposal, then build a private preview.')
      setError('')
    } catch (cause) {
      setError(String(cause))
    }
  }, [proposalText, proposalId])
  const preview = useCallback(
    async (candidate?: Revision) => {
      const inputSource = candidate?.source ?? source
      const inputTitle = candidate?.title ?? title
      const inputSummary = candidate?.summary ?? summary
      operation.current?.abort()
      const controller = new AbortController()
      operation.current = controller
      setBusy(true)
      setError('')
      setStatus('Compiling TypeScript…')
      try {
        const build = await compileChatExtension(inputSource, controller.signal)
        controller.signal.throwIfAborted()
        if (candidate && candidate.hash !== build.hash)
          throw new Error(
            'The source or compiler changed. Create a new revision before installing it.'
          )
        const result = await runChatExtension(build.code, messages, controller.signal)
        if (!data.bridge) throw new Error('The local store is unavailable.')
        const id = candidate?.id ?? `chat-extension-${crypto.randomUUID()}`
        const actor =
          run && !manualEdit
            ? `${run.provider} · run ${run.id} · requested by ${data.did}`
            : `Edited by ${data.did}`
        const next: Revision = candidate ?? {
          id,
          title: inputTitle,
          summary: inputSummary,
          source: inputSource,
          hash: build.hash,
          actor,
          createdAt: Date.now(),
          base: baseRevision ?? revision?.id
        }
        if (!candidate)
          await data.bridge.create(
            PluginSourceSchema,
            {
              name: inputTitle,
              description: inputSummary,
              entry: 'index.ts',
              files: { 'index.ts': inputSource },
              manifest: {
                id,
                name: inputTitle,
                version: '0.0.1',
                permissions: { capabilities: { network: false } },
                chatPreview: {
                  channelId,
                  hash: build.hash,
                  actor,
                  base: baseRevision ?? revision?.id,
                  runId: run?.id,
                  compiler: '@swc/wasm-web@1.15.41',
                  policy: CHAT_PREVIEW_POLICY
                }
              }
            },
            id
          )
        setBaseRevision(next.id)
        setTree(result)
        setRevision(next)
        setSource(next.source)
        setTitle(next.title)
        setSummary(next.summary)
        setStatus(`Preview built · ${messages.length} selected messages · no data changes`)
      } catch (cause) {
        if (!controller.signal.aborted) {
          setError(String(cause))
          setStatus('The last working preview is preserved.')
        }
      } finally {
        if (operation.current === controller) setBusy(false)
      }
    },
    [
      source,
      title,
      summary,
      messages,
      data.bridge,
      data.did,
      run,
      manualEdit,
      baseRevision,
      revision,
      channelId
    ]
  )
  useEffect(() => {
    const pinned = history.find((entry) => entry.id === installed)
    if (pinned && !run && !revision && !busy && !editing && !error) void preview(pinned)
  }, [installed, history, run, revision, busy, editing, error, preview])
  return (
    <aside
      aria-label="Extension preview"
      className="flex min-h-0 w-full flex-col border-l border-border bg-background lg:w-[420px] lg:shrink-0"
    >
      <header className="flex items-center gap-2 border-b border-border px-5 py-4">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-semibold">{title}</h2>
          <p className="mt-1 text-xs text-muted-foreground">Private extension preview</p>
        </div>
        <IconButton label="Close extension preview" onClick={onClose}>
          <X size={17} />
        </IconButton>
      </header>
      <div className="min-h-0 flex-1 space-y-4 overflow-auto p-5">
        <p className="text-xs leading-5 text-muted-foreground">{summary}</p>
        <div className="rounded-lg bg-muted p-3 text-xs leading-5">
          Reads a snapshot of {messages.length} messages in this conversation. No writes, network,
          filesystem, or host access. Compiled in a worker; the preview stops after two seconds.
        </div>
        <div className="flex flex-wrap gap-2">
          <button disabled={busy} className={primaryButton} onClick={() => void preview()}>
            <Play size={13} />
            {busy ? 'Building…' : 'Build preview'}
          </button>
          <button className={secondaryButton} onClick={() => setEditing(!editing)}>
            <Code size={14} />
            {editing ? 'Hide source' : 'Edit TypeScript'}
          </button>
          {busy && (
            <button
              className={secondaryButton}
              onClick={() => {
                operation.current?.abort()
                setBusy(false)
                setStatus('Preview stopped.')
              }}
            >
              Stop
            </button>
          )}
        </div>
        {editing && (
          <label className="block text-xs">
            index.ts
            <textarea
              aria-label="Extension TypeScript source"
              spellCheck={false}
              maxLength={24000}
              value={source}
              onChange={(event) => {
                setSource(event.target.value)
                setManualEdit(true)
                setBaseRevision(revision?.id ?? baseRevision)
                setRevision(null)
              }}
              rows={16}
              className={`${inputClass} mt-2 font-mono text-xs`}
            />
          </label>
        )}
        {status && (
          <p role="status" className="text-xs text-muted-foreground">
            {status}
          </p>
        )}
        {error && (
          <p role="alert" className="break-words text-xs text-destructive">
            {error}
          </p>
        )}
        {tree && (
          <div className="rounded-xl border border-border p-4">
            <PreviewTree node={tree} />
          </div>
        )}
        {revision && (
          <div className="space-y-2 rounded-lg border border-border p-3 text-xs">
            <p className="font-medium">
              {installed === revision.id ? 'Installed on this device' : 'Proposed version'}
            </p>
            <p>Permissions: unchanged · selected messages only.</p>
            <p className="break-all text-[10px] text-muted-foreground">
              {revision.actor}
              <br />
              Build {revision.hash.slice(0, 16)}
            </p>
            <button
              className={secondaryButton}
              disabled={busy || installed === revision.id}
              onClick={() => {
                try {
                  localStorage.setItem(installKey, revision.id)
                  setInstalled(revision.id)
                  setStatus(
                    'Installed on this device. Other members must review and install their own copy.'
                  )
                } catch {
                  setError('Could not save this installation.')
                }
              }}
            >
              Install this version locally
            </button>
          </div>
        )}
        <div className="border-t border-border pt-4">
          <h3 className="mb-2 text-xs font-semibold">Version history</h3>
          {history.map((entry) => (
            <button
              key={entry.id}
              disabled={busy}
              className="mb-2 flex w-full items-center gap-2 rounded-lg border border-border p-3 text-left text-xs"
              onClick={() => void preview(entry)}
            >
              <RotateCcw size={13} />
              <span className="min-w-0 flex-1 truncate">
                {entry.title}
                <span className="mt-1 block text-[10px] text-muted-foreground">
                  {new Date(entry.createdAt).toLocaleString()} · {entry.hash.slice(0, 8)}
                  {installed === entry.id ? ' · installed' : ''}
                </span>
              </span>
              Preview
            </button>
          ))}
          {!history.length && (
            <p className="text-xs text-muted-foreground">
              Successful builds are saved as separate, hash-pinned source revisions.
            </p>
          )}
          <p className="mt-3 text-[10px] leading-5 text-muted-foreground">
            Restoring a version changes the view only. Your original messages remain accessible in
            chat. Receiving or editing source never installs it automatically.
          </p>
        </div>
      </div>
    </aside>
  )
}
