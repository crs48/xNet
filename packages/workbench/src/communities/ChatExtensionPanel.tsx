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
  extensionExamples,
  type ChatPreviewNode
} from './agent-extension'
import {
  grantKey,
  readExtensionGrant,
  subscribeExtensionData,
  type ExtensionGrant
} from './extension-data'
import { compileChatExtension, runChatExtension } from './extension-sandbox'
import {
  ExtensionDataPicker,
  canReadExtensionChannel,
  type ExtensionSelection
} from './ExtensionDataPicker'
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
  run,
  proposals,
  onReview,
  onClose
}: {
  channelId: string
  data: CommunityData
  run?: CommunityAgentRun
  proposals: CommunityAgentRun[]
  onReview: (id: string) => void
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
  const [selection, setSelection] = useState<ExtensionSelection>({
    channelIds: [channelId],
    records: []
  })
  const [grant, setGrant] = useState<ExtensionGrant | null>(null)
  const [build, setBuild] = useState<{ code: string; hash: string } | null>(null)
  const liveOperation = useRef<AbortController | null>(null)
  const currentData = useRef(data)
  currentData.current = data
  const restoredInstallation = useRef<string | null>(null)
  const operation = useRef<AbortController | null>(null)
  const installKey = `xnet:chat-extension:${data.did}:${channelId}`
  const revisions = useQuery(PluginSourceSchema, { orderBy: { createdAt: 'desc' }, limit: 200 })
  const history = revisions.data.flatMap((node): Revision[] => {
    const manifest = node.manifest as Record<string, unknown> | undefined
    const files = node.files as Record<string, unknown> | undefined
    const revisionSource = files?.['index.tsx'] ?? files?.['index.ts']
    const info = manifest?.chatPreview as Record<string, unknown> | undefined
    if (
      node.createdBy !== data.did ||
      info?.channelId !== channelId ||
      typeof revisionSource !== 'string' ||
      typeof info?.hash !== 'string'
    )
      return []
    return [
      {
        id: node.id,
        title: node.name ?? 'Untitled extension',
        summary: node.description ?? '',
        source: revisionSource,
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
  const proposalText = run?.extension ? JSON.stringify(run.extension) : run?.text
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
      setTree(null)
      setGrant(null)
      setBuild(null)
      operation.current?.abort()
      liveOperation.current?.abort()
      setManualEdit(false)
      setStatus('Review this proposal, then build a private preview.')
      setError('')
    } catch (cause) {
      setError(String(cause))
    }
  }, [proposalText, proposalId])
  const preview = useCallback(
    async (candidate?: Revision, allow = false) => {
      const inputSource = candidate?.source ?? source
      const inputTitle = candidate?.title ?? title
      const inputSummary = candidate?.summary ?? summary
      operation.current?.abort()
      const controller = new AbortController()
      operation.current = controller
      liveOperation.current?.abort()
      setGrant(null)
      setTree(null)
      setBusy(true)
      setError('')
      setStatus('Compiling TypeScript…')
      try {
        const build = await compileChatExtension(inputSource, controller.signal)
        controller.signal.throwIfAborted()
        if (candidate && candidate.hash !== build.hash) {
          setSource(inputSource)
          setTitle(inputTitle)
          setSummary(inputSummary)
          setBaseRevision(candidate.id)
          setRevision(null)
          throw new Error(
            'This version uses an older runtime. Review its source and allow data to build a new revision.'
          )
        }
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
              entry: 'index.tsx',
              files: { 'index.tsx': inputSource },
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
        controller.signal.throwIfAborted()
        setBuild(build)
        if (!data.did) throw new Error('Your identity is unavailable.')
        const key = grantKey(data.did, channelId, build.hash)
        const saved = localStorage.getItem(key)
        const approved = allow
          ? readExtensionGrant(
              JSON.stringify({ version: 1, owner: data.did, hash: build.hash, ...selection }),
              data.did,
              build.hash
            )
          : saved
            ? readExtensionGrant(saved, data.did, build.hash)
            : null
        if (approved) {
          localStorage.setItem(key, JSON.stringify(approved))
          setSelection({ channelIds: approved.channelIds, records: approved.records })
          setGrant(approved)
        }
        setRevision(next)
        setSource(next.source)
        setTitle(next.title)
        setSummary(next.summary)
        setStatus(
          approved
            ? 'Loading approved xNet data…'
            : 'Select data below, then allow access to preview this version.'
        )
      } catch (cause) {
        if (!controller.signal.aborted) {
          setError(String(cause))
          setStatus('The extension has no active data access.')
        }
      } finally {
        if (operation.current === controller) setBusy(false)
      }
    },
    [
      source,
      title,
      summary,
      data.bridge,
      data.did,
      run,
      manualEdit,
      baseRevision,
      revision,
      channelId,
      selection
    ]
  )
  const revoke = () => {
    operation.current?.abort()
    liveOperation.current?.abort()
    setGrant(null)
    setTree(null)
    setBusy(false)
    setError('')
    setStatus('Access revoked. The extension has stopped and its view is cleared.')
    if (data.did && build) {
      try {
        localStorage.removeItem(grantKey(data.did, channelId, build.hash))
      } catch {
        setError(
          'Access stopped, but the saved grant could not be removed. Clear this device’s site data before reopening it.'
        )
      }
    }
  }
  const permissions = JSON.stringify([data.did, data.channels, data.spaces, data.members])
  useEffect(() => {
    if (!grant || !build || !data.bridge) return
    setTree(null)
    let stopped = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const render = (dataset: Parameters<typeof runChatExtension>[1]) => {
      liveOperation.current?.abort()
      const controller = new AbortController()
      liveOperation.current = controller
      setBusy(true)
      void runChatExtension(build.code, dataset, channelId, controller.signal)
        .then((result) => {
          if (stopped || controller.signal.aborted) return
          setTree(result)
          setError('')
          setStatus(`Live xNet data · ${dataset.nodes.length} approved records · read-only`)
        })
        .catch((cause) => {
          if (stopped || controller.signal.aborted) return
          setTree(null)
          setError(String(cause))
        })
        .finally(() => {
          if (!stopped && !controller.signal.aborted) setBusy(false)
        })
    }
    const unsubscribe = subscribeExtensionData(
      data.bridge,
      grant,
      (id) => canReadExtensionChannel(currentData.current, id),
      (result) => {
        clearTimeout(timer)
        liveOperation.current?.abort()
        setTree(null)
        if (result.error) {
          setError(result.error.message)
          setBusy(false)
          return
        }
        if (result.data) {
          const dataset = result.data
          timer = setTimeout(() => render(dataset), 100)
        }
      }
    )
    // An expiring membership can revoke access without a store change.
    let expiryTimer: ReturnType<typeof setTimeout> | undefined
    const checkMembership = () => {
      if (stopped) return
      if (grant.channelIds.some((id) => !canReadExtensionChannel(currentData.current, id))) {
        stopped = true
        unsubscribe()
        liveOperation.current?.abort()
        setTree(null)
        setBusy(false)
        setGrant(null)
        setError('Conversation membership expired. Extension access has stopped.')
        return
      }
      const expiry = currentData.current.members
        .map((member) => member.expiresAt ?? 0)
        .filter((time) => time > Date.now())
        .sort((a, b) => a - b)[0]
      if (expiry)
        expiryTimer = setTimeout(checkMembership, Math.min(expiry - Date.now() + 20, 2147483647))
    }
    checkMembership()
    return () => {
      stopped = true
      clearTimeout(timer)
      clearTimeout(expiryTimer)
      unsubscribe()
      liveOperation.current?.abort()
    }
  }, [grant, build, data.bridge, channelId, permissions])
  useEffect(() => {
    const pinned = history.find((entry) => entry.id === installed)
    if (
      pinned &&
      restoredInstallation.current !== pinned.id &&
      !run &&
      !revision &&
      !busy &&
      !editing &&
      !error
    ) {
      restoredInstallation.current = pinned.id
      void preview(pinned)
    }
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
          Uses real xNet React hooks with the data you select. Each version needs your approval.
          Read-only views run in an isolated worker with no network or device access.
        </div>
        <details className="text-xs">
          <summary className="cursor-pointer">Try a data-driven example</summary>
          <div className="mt-2 flex flex-wrap gap-2">
            {extensionExamples.map((example) => (
              <button
                key={example.title}
                className={secondaryButton}
                onClick={() => {
                  revoke()
                  setBuild(null)
                  setRevision(null)
                  setSource(example.source)
                  setTitle(example.title)
                  setSummary(example.summary)
                  setManualEdit(true)
                  if (example.title === 'Selected tasks')
                    setSelection({ channelIds: [], records: [] })
                }}
              >
                {example.title}
              </button>
            ))}
          </div>
        </details>
        <ExtensionDataPicker
          data={data}
          selection={selection}
          onChange={(next) => {
            revoke()
            setSelection(next)
          }}
        />
        <div className="flex flex-wrap gap-2">
          <button
            disabled={busy}
            className={primaryButton}
            onClick={() => void preview(undefined, true)}
          >
            <Play size={13} />
            {busy ? 'Loading…' : 'Allow selected data and preview'}
          </button>
          <button className={secondaryButton} onClick={() => setEditing(!editing)}>
            <Code size={14} />
            {editing ? 'Hide source' : 'Edit TypeScript'}
          </button>
          {grant && (
            <button className={secondaryButton} onClick={revoke}>
              Revoke data access
            </button>
          )}
          {busy && (
            <button
              className={secondaryButton}
              onClick={() => {
                revoke()
                setStatus('Preview stopped.')
              }}
            >
              Stop
            </button>
          )}
        </div>
        {editing && (
          <label className="block text-xs">
            index.tsx
            <textarea
              aria-label="Extension TypeScript source"
              spellCheck={false}
              maxLength={24000}
              value={source}
              onChange={(event) => {
                revoke()
                setBuild(null)
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
            <p>
              {grant
                ? `${grant.channelIds.length} conversations · ${grant.records.length} individual records · read-only`
                : 'No data access granted.'}
            </p>
            <p className="break-all text-[10px] text-muted-foreground">
              {revision.actor}
              <br />
              Build {revision.hash.slice(0, 16)}
            </p>
            <button
              className={secondaryButton}
              disabled={busy || !tree || !grant || installed === revision.id}
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
        {proposals.length > 0 && (
          <details className="border-t border-border pt-4 text-xs">
            <summary className="cursor-pointer font-semibold">
              Agent drafts ({proposals.length})
            </summary>
            <div className="mt-2 space-y-2">
              {[...proposals].reverse().map((proposal) => (
                <button
                  key={proposal.id}
                  disabled={busy}
                  onClick={() => onReview(proposal.id)}
                  className="flex w-full items-center justify-between gap-2 rounded-lg border border-border p-3 text-left hover:bg-muted disabled:opacity-40"
                >
                  <span>
                    {proposal.provider === 'codex' ? 'Codex' : 'Claude'} draft
                    <time
                      className="mt-1 block text-[10px] text-muted-foreground"
                      dateTime={new Date(proposal.startedAt).toISOString()}
                    >
                      {new Date(proposal.startedAt).toLocaleString()}
                    </time>
                  </span>
                  Review
                </button>
              ))}
            </div>
          </details>
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
              Compiled sources are saved as separate versions. Failed previews are never installed.
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
