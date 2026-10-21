import type { CommunityAgentRun } from './agent-contract'
import type { AttachmentServices } from './ConversationPane'
import type { CommunityData } from './use-community-data'
import { ChannelSchema, ChatMessageSchema } from '@xnetjs/data'
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
  openExtensionAuthority,
  observeExtensionAuthority,
  type ExtensionAuthority
} from './extension-authority'
import { createExtensionBroker } from './extension-broker'
import { readExtensionGrant, type ExtensionGrant, type ExtensionDataset } from './extension-data'
import { readableNode } from './extension-data'
import {
  subscribeExtensionDocuments,
  type ExtensionDocumentProjection
} from './extension-documents'
import { decodeExtensionRequest, extensionUndoMessage } from './extension-protocol'
import { createExtensionQueryBroker } from './extension-queries'
import {
  compileChatExtension,
  startChatExtension,
  type ExtensionSession
} from './extension-sandbox'
import {
  createExtensionVersion,
  extensionPermissionHash,
  versionLineage,
  encodeSharedExtension,
  extensionBranches,
  revisionKey,
  sourceChangeSummary,
  EXTENSION_SHARE_MIME,
  type ExtensionRevision as Revision,
  type SharedExtension
} from './extension-versions'
import {
  ExtensionDataPicker,
  canReadExtensionChannel,
  type ExtensionSelection
} from './ExtensionDataPicker'
import {
  ExtensionDocumentEditor,
  ExtensionDocumentDraftsProvider,
  type DocumentSave
} from './ExtensionDocumentEditor'
import { IconButton, inputClass, primaryButton, secondaryButton } from './primitives'
function writeAccessLabel(grant: ExtensionGrant): string {
  const access = [
    ...(grant.taskWrites ? ['private task editing'] : []),
    ...(grant.documents?.write?.length ? ['private page editing'] : [])
  ]
  return access.join(' and ') || 'read-only'
}

function PreviewTree({
  node,
  session,
  documents,
  editors
}: {
  node: ChatPreviewNode
  session: ExtensionSession | null
  documents: readonly ExtensionDocumentProjection[]
  editors: ReadonlyMap<string, DocumentSave>
}) {
  const styles = {
    stack: 'flex flex-col gap-3',
    grid: 'grid grid-cols-1 gap-3 sm:grid-cols-2',
    card: 'rounded-xl border border-border p-4',
    text: 'whitespace-pre-wrap text-sm leading-6',
    badge: 'inline-block self-start rounded-full bg-muted px-3 py-1 text-xs',
    button: secondaryButton,
    input: inputClass,
    document: '',
    'document-editor': ''
  }
  if (node.type === 'text' && !node.children?.length)
    return <span className={styles.text}>{node.text}</span>
  if (node.type === 'document-editor') {
    const document = documents.find((item) => item.handle === node.handle)
    return document ? (
      <ExtensionDocumentEditor document={document} save={editors.get(document.handle)} />
    ) : (
      <p>Document access is unavailable.</p>
    )
  }
  if (node.type === 'document') {
    const document = documents.find((item) => item.handle === node.handle)
    return (
      <section className="rounded-lg border border-border p-3" aria-label="Approved document">
        <p className="mb-2 text-xs text-muted-foreground">Document · read-only</p>
        <div className="whitespace-pre-wrap text-sm">
          {document?.text ?? 'Document access is unavailable.'}
        </div>
      </section>
    )
  }
  if (node.type === 'button')
    return (
      <button
        className={secondaryButton}
        disabled={node.disabled}
        aria-label={node.label}
        onClick={() => session?.event(node.id!, 'click')}
      >
        {node.text}
        {node.children?.map((child, index) => (
          <PreviewTree
            key={index}
            node={child}
            session={session}
            documents={documents}
            editors={editors}
          />
        ))}
      </button>
    )
  if (node.type === 'input')
    return (
      <input
        className={inputClass}
        aria-label={node.label ?? 'Extension input'}
        disabled={node.disabled}
        value={node.value ?? ''}
        placeholder={node.placeholder}
        maxLength={node.maxLength ?? 2000}
        onChange={(event) => session?.event(node.id!, 'input', event.target.value)}
      />
    )
  return (
    <div className={styles[node.type]}>
      {node.text}
      {node.children?.map((child, index) => (
        <PreviewTree
          key={index}
          node={child}
          session={session}
          documents={documents}
          editors={editors}
        />
      ))}
    </div>
  )
}
export function ChatExtensionPanel({
  channelId,
  data,
  run,
  proposals,
  services,
  shared,
  onRemix,
  onReview,
  onClose
}: {
  channelId: string
  data: CommunityData
  run?: CommunityAgentRun
  proposals: CommunityAgentRun[]
  services: AttachmentServices
  shared?: SharedExtension
  onRemix: (revision: Revision) => void
  onReview: (id: string) => void
  onClose: () => void
}) {
  const [source, setSource] = useState(watchlistSource)
  const [title, setTitle] = useState('Our watchlist')
  const [summary, setSummary] = useState('A view of films and links shared in this conversation.')
  const [manualEdit, setManualEdit] = useState(false)
  const [incomingVersion, setIncomingVersion] = useState<SharedExtension | null>(null)
  const [parentVersion, setParentVersion] = useState<string | undefined>()
  const [changeNote, setChangeNote] = useState('Initial version')
  const [shareOpen, setShareOpen] = useState(false)
  const [sharing, setSharing] = useState(false)
  const [allVersions, setAllVersions] = useState(false)
  const [baseRevision, setBaseRevision] = useState<string | undefined>()
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const documentEditors = useRef(new Map<string, DocumentSave>())
  const [documents, setDocuments] = useState<ExtensionDocumentProjection[]>([])
  const [tree, setTree] = useState<ChatPreviewNode | null>(null)
  const [revision, setRevision] = useState<Revision | null>(null)
  const [installed, setInstalled] = useState<string | null>(null)
  const [status, setStatus] = useState('')
  const [notice, setNotice] = useState('')
  const [undoing, setUndoing] = useState(false)
  const [selection, setSelection] = useState<ExtensionSelection>({
    channelIds: [channelId],
    records: []
  })
  const [authority, setAuthority] = useState<ExtensionAuthority | null>(null)
  const createdRecords = useRef<string[]>([])
  const [grant, setGrant] = useState<ExtensionGrant | null>(null)
  const [build, setBuild] = useState<{ code: string; hash: string } | null>(null)
  const liveSession = useRef<ExtensionSession | null>(null)
  const brokerRef = useRef<ReturnType<typeof createExtensionBroker> | null>(null)
  const [lastReceipt, setLastReceipt] = useState<string | null>(null)
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
        base: typeof info.base === 'string' ? info.base : undefined,
        lineage: info.lineage as Revision['lineage']
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
      setBaseRevision(run?.baseRevisionId)
      setParentVersion(run?.baseVersionId)
      setIncomingVersion(null)
      setChangeNote(
        run?.baseRevisionId
          ? proposal.summary.slice(0, 1000) || 'Agent revision'
          : 'Initial version'
      )
      setShareOpen(false)
      setRevision(null)
      setTree(null)
      setGrant(null)
      setBuild(null)
      operation.current?.abort()
      liveOperation.current?.abort()
      setManualEdit(false)
      setNotice('')
      setStatus('Review this proposal, then build a private preview.')
      setError('')
    } catch (cause) {
      setError(String(cause))
    }
  }, [proposalText, proposalId, run?.baseRevisionId, run?.baseVersionId])
  useEffect(() => {
    if (!shared) return
    operation.current?.abort()
    liveOperation.current?.abort()
    setSource(shared.source)
    setTitle(shared.title)
    setSummary(shared.summary)
    setIncomingVersion(shared)
    setParentVersion(shared.parent)
    setChangeNote(shared.changeNote)
    setBaseRevision(undefined)
    setRevision(null)
    setTree(null)
    setGrant(null)
    setAuthority(null)
    setBuild(null)
    setSelection({ channelIds: [], records: [] })
    setManualEdit(false)
    setEditing(false)
    setShareOpen(false)
    setNotice('')
    setStatus('Shared source received. Review it and choose your own data access.')
    setError('')
  }, [shared])
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
      setNotice('')
      setUndoing(false)
      setStatus('Compiling TypeScript…')
      try {
        const build = await compileChatExtension(inputSource, controller.signal)
        controller.signal.throwIfAborted()
        if (candidate && candidate.hash !== build.hash) {
          setSource(inputSource)
          setTitle(inputTitle)
          setSummary(inputSummary)
          setBaseRevision(candidate.id)
          setParentVersion(revisionKey(candidate))
          setIncomingVersion(null)
          setChangeNote('Rebuilt for the current runtime')
          setRevision(null)
          throw new Error(
            'This version uses an older runtime. Review its source and allow data to build a new revision.'
          )
        }
        if (!data.bridge) throw new Error('The local store is unavailable.')
        let existing =
          candidate ??
          history.find(
            (entry) =>
              incomingVersion &&
              entry.lineage?.versionId === incomingVersion.versionId &&
              entry.hash === build.hash &&
              entry.source === inputSource
          ) ??
          (revision?.hash === build.hash && revision.source === inputSource ? revision : undefined)
        const actor = incomingVersion
          ? `Shared by ${incomingVersion.author}`
          : run && !manualEdit
            ? `${run.provider} · run ${run.id} · requested by ${data.did}`
            : `Edited by ${data.did}`
        const lineage =
          existing?.lineage ??
          (incomingVersion
            ? versionLineage(incomingVersion)
            : versionLineage(
                await createExtensionVersion({
                  title: inputTitle,
                  summary: inputSummary,
                  source: inputSource,
                  author: data.did!,
                  parent: parentVersion,
                  changeNote
                })
              ))
        existing ??= history.find(
          (entry) =>
            entry.lineage?.versionId === lineage.versionId &&
            entry.hash === build.hash &&
            entry.source === inputSource
        )
        const id = existing?.id ?? `chat-extension-${crypto.randomUUID()}`
        const next: Revision = existing ?? {
          id,
          title: inputTitle,
          summary: inputSummary,
          source: inputSource,
          hash: build.hash,
          actor,
          createdAt: Date.now(),
          base: baseRevision ?? revision?.id,
          lineage
        }
        if (!existing)
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
                  lineage,
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
        const permissionHash = await extensionPermissionHash(build.hash, next.lineage?.versionId)
        const approved = allow
          ? readExtensionGrant(
              JSON.stringify({ version: 1, owner: data.did, hash: permissionHash, ...selection }),
              data.did,
              permissionHash
            )
          : undefined
        const saved = await openExtensionAuthority(
          data.bridge,
          data.did,
          channelId,
          permissionHash,
          approved
        )
        if (controller.signal.aborted && allow) await saved?.authority.revoke()
        controller.signal.throwIfAborted()
        setAuthority(saved?.authority ?? null)
        createdRecords.current = saved?.approval.created ?? []
        if (saved) {
          const approved = saved.approval.grant
          setSelection({
            channelIds: approved.channelIds,
            records: approved.records,
            taskWrites: approved.taskWrites,
            documents: approved.documents,
            containers: approved.containers
          })
          setGrant(approved)
        } else if (candidate || incomingVersion) {
          setSelection({ channelIds: [], records: [] })
        }
        setRevision(next)
        setParentVersion(revisionKey(next))
        setIncomingVersion(null)
        setChangeNote(next.lineage?.changeNote ?? 'Saved version')
        setEditing(false)
        setShareOpen(false)
        setSource(next.source)
        setTitle(next.title)
        setSummary(next.summary)
        setStatus(
          saved
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
      selection,
      incomingVersion,
      parentVersion,
      changeNote,
      history
    ]
  )
  const revoke = () => {
    const retiringOperation = operation.current
    const draining = brokerRef.current?.revoke()
    brokerRef.current = null
    liveSession.current?.stop()
    liveSession.current = null
    setLastReceipt(null)
    setDocuments([])
    operation.current?.abort()
    liveOperation.current?.abort()
    setGrant(null)
    setTree(null)
    setBusy(false)
    setError('')
    setNotice('')
    setStatus('Stopping extension access…')
    const durableRevoke = authority?.revoke()
    void Promise.all([draining, durableRevoke])
      .then(() => {
        if (operation.current === retiringOperation && !liveSession.current)
          setStatus(
            'Access revoked on this device. Reopening or rolling back code will require approval.'
          )
      })
      .catch(() => {
        setError(
          'The extension stopped, but permission revocation could not be saved. Retry revocation before reopening it.'
        )
      })
  }
  const permissions = JSON.stringify([data.did, data.channels, data.spaces, data.members])
  useEffect(() => {
    if (!grant || !build || !data.bridge || !authority) return
    setTree(null)
    let stopped = false
    void authority
      .read()
      .then(({ approval }) => {
        if (!stopped) setLastReceipt(approval.lastReceipt)
      })
      .catch(() => {
        if (!stopped) setLastReceipt(null)
      })
    const controller = new AbortController()
    liveOperation.current = controller
    const broker = createExtensionBroker(
      data.bridge,
      grant,
      () =>
        !stopped &&
        currentData.current.did === grant.owner &&
        grant.channelIds.every((id) => canReadExtensionChannel(currentData.current, id)),
      authority,
      createdRecords.current
    )
    brokerRef.current = broker
    const queries = createExtensionQueryBroker(data.bridge, grant, authority, (id) =>
      canReadExtensionChannel(currentData.current, id)
    )
    let unsubscribe = () => {}
    let session: ExtensionSession | null = null
    let delivery = 0
    let documentData: ExtensionDocumentProjection[] | null = grant.documents?.read.length
      ? null
      : []
    let latestDataset: { data: ExtensionDataset | null; error: Error | null } | null = null
    let stopDocuments = () => {}

    const stopForAuthority = (cause: unknown) => {
      if (stopped) return
      stopped = true
      unsubscribe()
      void broker.revoke()
      session?.stop()
      controller.abort()
      setDocuments([])
      setLastReceipt(null)
      setTree(null)
      setBusy(false)
      setGrant(null)
      setStatus('Extension stopped. Review the error, then retry the preview.')
      setError(cause instanceof Error ? cause.message : 'Extension permission is unavailable.')
    }
    let checkingAuthority = false
    const checkAuthority = () => {
      if (checkingAuthority || stopped) return
      checkingAuthority = true
      void authority
        .read()
        .then(() => queries.checkExpiry())
        .catch(stopForAuthority)
        .finally(() => {
          checkingAuthority = false
        })
    }
    const unobserve = observeExtensionAuthority(authority.key, checkAuthority)
    const authorityTimer = setInterval(checkAuthority, 500)
    const deliver = (result: { data: ExtensionDataset | null; error: Error | null }) => {
      const serial = ++delivery
      void authority
        .read()
        .then(() => {
          if (stopped || serial !== delivery) return
          if (result.error) {
            stopForAuthority(result.error)
            return
          }
          if (!result.data) return
          if (session) session.update(result.data)
          else {
            session = startChatExtension(
              build.code,
              result.data,
              channelId,
              {
                view: (view) => {
                  if (!stopped) {
                    setTree(view)
                    setBusy(false)
                    setError('')
                  }
                },
                error: stopForAuthority,
                request: async (request, signal) => {
                  const decoded = decodeExtensionRequest(request)
                  if (decoded.operation === 'data.query') return queries.query(decoded, signal)
                  const result = await broker.request(decoded, signal)
                  if (!broker.active || signal.aborted) throw new Error('Extension access stopped.')
                  setNotice('')
                  setLastReceipt(result.receipt)
                  subscribe()
                  return {
                    batchId: result.batchId,
                    receipt: result.receipt,
                    tempIds: {},
                    results: result.results.map((node) =>
                      node ? { ...readableNode(node), deleted: node.deleted } : null
                    )
                  }
                }
              },
              controller.signal
            )
            liveSession.current = session
          }
          setStatus(
            `Live xNet data · ${result.data.grant.records.length} selected records · ${grant.containers?.length ?? 0} containers · ${writeAccessLabel(grant)}`
          )
        })
        .catch(stopForAuthority)
    }
    const deliverLatest = () => {
      if (!latestDataset || documentData === null) return
      deliver({
        ...latestDataset,
        data: latestDataset.data ? { ...latestDataset.data, documents: documentData } : null
      })
    }
    const subscribe = () => {
      const records = [
        ...grant.records,
        ...broker
          .createdRecords()
          .filter((record) => !grant.records.some((existing) => existing.id === record.id))
      ]
      latestDataset = {
        data: { grant: { ...grant, records }, nodes: [], hostQueries: true },
        error: null
      }
      deliverLatest()
    }
    let invalidationTimer: ReturnType<typeof setTimeout> | undefined
    if (data.bridge.subscribeToChanges) {
      unsubscribe = data.bridge.subscribeToChanges((event) => {
        const records = new Set([
          ...grant.records.map((record) => record.id),
          ...broker.createdRecords().map((record) => record.id)
        ])
        const affected = [event.node, event.previousNode].some(
          (node) =>
            node &&
            (queries.affects(node) ||
              records.has(node.id) ||
              (node.schemaId === ChannelSchema._schemaId && grant.channelIds.includes(node.id)) ||
              (node.schemaId === ChatMessageSchema._schemaId &&
                grant.channelIds.includes(String(node.properties.channel))))
        )
        if (!affected || invalidationTimer || stopped) return
        invalidationTimer = setTimeout(() => {
          invalidationTimer = undefined
          if (!stopped) session?.invalidate()
        }, 250)
      })
    }
    subscribe()
    void subscribeExtensionDocuments(
      data.bridge,
      grant,
      authority,
      (next) => {
        if (stopped) return
        documentData = next
        setDocuments(next)
        deliverLatest()
      },
      stopForAuthority,
      controller.signal,
      {
        register: (handle, save) => documentEditors.current.set(handle, save),
        unregister: (handle) => {
          documentEditors.current.delete(handle)
        },
        current: () => !stopped && currentData.current.did === grant.owner
      }
    )
      .then((cleanup) => {
        if (stopped) cleanup()
        else stopDocuments = cleanup
      })
      .catch(stopForAuthority)
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
      clearTimeout(expiryTimer)
      clearInterval(authorityTimer)
      clearTimeout(invalidationTimer)
      unobserve()
      stopDocuments()
      unsubscribe()
      void broker.revoke()
      session?.stop()
      controller.abort()
      if (brokerRef.current === broker) brokerRef.current = null
    }
  }, [grant, build, data.bridge, channelId, permissions, authority])
  useEffect(() => {
    const pinned = history.find((entry) => entry.id === installed)
    if (
      pinned &&
      restoredInstallation.current !== pinned.id &&
      !run &&
      !shared &&
      !revision &&
      !busy &&
      !editing &&
      !error
    ) {
      restoredInstallation.current = pinned.id
      void preview(pinned)
    }
  }, [installed, history, run, shared, revision, busy, editing, error, preview])
  const selectedKey = revision ? revisionKey(revision) : parentVersion
  const branches = extensionBranches(history)
  const parent = history.find(
    (entry) => revisionKey(entry) === revision?.lineage?.parent || entry.id === revision?.base
  )
  const difference = revision && parent ? sourceChangeSummary(parent.source, revision.source) : null
  const rootOf = (key: string | undefined) => {
    const seen = new Set<string>()
    while (key && !seen.has(key)) {
      seen.add(key)
      const entry = history.find((item) => revisionKey(item) === key)
      const next = entry?.lineage?.parent ?? entry?.base
      if (!next) return key
      key = next
    }
    return key
  }
  const family = rootOf(selectedKey)
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
        {incomingVersion && (
          <div className="rounded-lg border border-border p-3 text-xs">
            <p>
              Shared by {data.nameFor(incomingVersion.author)} ·{' '}
              {incomingVersion.versionId.slice(0, 8)}
            </p>
            <p className="mt-1">{incomingVersion.changeNote}</p>
            {incomingVersion.parent && (
              <p className="mt-1 text-muted-foreground">
                Based on {incomingVersion.parent.slice(0, 8)}. Parent links describe the author's
                stated history.
              </p>
            )}
          </div>
        )}
        {!grant && (
          <div className="rounded-lg bg-muted p-3 text-xs leading-5">
            Choose the data this version can use. Task editing, page text, and page editing need
            separate approval. You can revoke access at any time.
          </div>
        )}
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
                  setIncomingVersion(null)
                  setParentVersion(undefined)
                  setBaseRevision(undefined)
                  setChangeNote('Initial example version')
                  if (example.title === 'Selected tasks')
                    setSelection({ channelIds: [], records: [] })
                }}
              >
                {example.title}
              </button>
            ))}
          </div>
        </details>
        <details open={!grant} className="text-xs">
          <summary className="cursor-pointer font-semibold">
            {grant
              ? `Data access · ${grant.channelIds.length} conversations · ${grant.records.length} records · ${grant.containers?.length ?? 0} containers · ${writeAccessLabel(grant)}`
              : 'Review data access'}
          </summary>
          <div className="mt-3">
            <ExtensionDataPicker
              data={data}
              selection={selection}
              onChange={(next) => {
                revoke()
                setSelection(next)
              }}
            />
          </div>
        </details>
        <div className="flex flex-wrap gap-2">
          {!revision && (
            <button disabled={busy} className={secondaryButton} onClick={() => void preview()}>
              Save version for review
            </button>
          )}
          <button
            disabled={busy}
            className={primaryButton}
            onClick={() => void preview(undefined, true)}
          >
            <Play size={13} />
            {busy ? 'Loading…' : 'Allow selected data and preview'}
          </button>
          <button
            className={secondaryButton}
            onClick={() => {
              if (!editing) {
                setParentVersion(
                  revision ? revisionKey(revision) : (incomingVersion?.versionId ?? parentVersion)
                )
                setBaseRevision(revision?.id ?? baseRevision)
                setChangeNote('')
              }
              setEditing(!editing)
            }}
          >
            <Code size={14} />
            {editing ? 'Hide source' : 'Edit TypeScript'}
          </button>
          {authority && (
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
        {revision && (
          <button className={secondaryButton} disabled={busy} onClick={() => onRemix(revision)}>
            Edit this version with your agent
          </button>
        )}
        {editing && (
          <div className="space-y-3">
            <label className="block text-xs">
              Version title
              <input
                className={inputClass}
                value={title}
                maxLength={120}
                onChange={(event) => {
                  revoke()
                  setTitle(event.target.value)
                  setManualEdit(true)
                  setIncomingVersion(null)
                  setRevision(null)
                }}
              />
            </label>
            <label className="block text-xs">
              What changed?
              <input
                className={inputClass}
                value={changeNote}
                maxLength={1000}
                onChange={(event) => {
                  revoke()
                  setChangeNote(event.target.value)
                  setManualEdit(true)
                  setIncomingVersion(null)
                  setRevision(null)
                }}
              />
            </label>
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
                  setIncomingVersion(null)
                  setBaseRevision(revision?.id ?? baseRevision)
                  setRevision(null)
                }}
                rows={16}
                className={`${inputClass} mt-2 font-mono text-xs`}
              />
            </label>
          </div>
        )}
        {status && (
          <p role="status" className="text-xs text-muted-foreground">
            {status}
          </p>
        )}
        {notice && (
          <p role="status" className="rounded-lg bg-muted p-3 text-xs">
            {notice}
          </p>
        )}
        {error && (
          <p role="alert" className="break-words text-xs text-destructive">
            {error}
          </p>
        )}
        {lastReceipt && (
          <button
            className={secondaryButton}
            disabled={undoing}
            onClick={() => {
              const broker = brokerRef.current
              if (!broker || undoing) return
              setUndoing(true)
              setError('')
              setNotice('')
              void broker
                .request({
                  version: 1,
                  id: crypto.randomUUID(),
                  operation: 'data.undo',
                  receipt: lastReceipt
                })
                .then(() => {
                  if (brokerRef.current !== broker) return
                  setLastReceipt(null)
                  setNotice('Extension edit undone.')
                })
                .catch((error: unknown) => {
                  if (brokerRef.current === broker) setError(extensionUndoMessage(error))
                })
                .finally(() => {
                  if (brokerRef.current === broker) setUndoing(false)
                })
            }}
          >
            {undoing ? 'Undoing…' : 'Undo last extension edit'}
          </button>
        )}
        {tree && (
          <section aria-label="Running extension" className="rounded-xl border border-border p-4">
            <ExtensionDocumentDraftsProvider key={authority?.epoch}>
              <PreviewTree
                node={tree}
                session={liveSession.current}
                documents={documents}
                editors={documentEditors.current}
              />
            </ExtensionDocumentDraftsProvider>
          </section>
        )}
        {revision && (
          <div className="space-y-2 rounded-lg border border-border p-3 text-xs">
            <p className="font-medium">
              {installed === revision.id ? 'Installed on this device' : 'Proposed version'}
            </p>
            <p>
              {grant
                ? `${grant.channelIds.length} conversations · ${grant.records.length} individual records · ${grant.containers?.length ?? 0} containers · ${writeAccessLabel(grant)}`
                : 'No data access granted.'}
            </p>
            {revision.lineage && (
              <p>
                By {data.nameFor(revision.lineage.author)} ·{' '}
                {revision.lineage.versionId.slice(0, 8)}
                <span className="mt-1 block">{revision.lineage.changeNote}</span>
              </p>
            )}
            {difference && (
              <details>
                <summary className="cursor-pointer">
                  Source changes: +{difference.added} / −{difference.removed} lines
                </summary>
                <p className="mt-2">Changed region compared with {parent?.title}:</p>
                <pre className="max-h-40 overflow-auto whitespace-pre-wrap text-[10px]">
                  {difference.before || '(no removed lines)'}
                </pre>
                <hr className="my-2" />
                <pre className="max-h-40 overflow-auto whitespace-pre-wrap text-[10px]">
                  {difference.after || '(no added lines)'}
                </pre>
              </details>
            )}
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
                  setNotice(
                    'Installed on this device. Other members must review and install their own copy.'
                  )
                } catch {
                  setError('Could not save this installation.')
                }
              }}
            >
              Install this version locally
            </button>
            {revision.lineage?.author === data.did && (
              <button className={secondaryButton} onClick={() => setShareOpen(!shareOpen)}>
                Share this version…
              </button>
            )}
            {revision.lineage && revision.lineage.author !== data.did && (
              <p>Remix this version to share your own changes.</p>
            )}
            {shareOpen && (
              <div className="space-y-2 rounded-lg bg-muted p-3">
                <p>
                  Share this version's TypeScript source and change note with this conversation.
                  Data permissions, page text and task records are not included. Review source for
                  private content before sharing.
                </p>
                <p className="font-medium">{revision.lineage?.changeNote}</p>
                <button
                  disabled={sharing}
                  className={primaryButton}
                  onClick={async () => {
                    setSharing(true)
                    setError('')
                    try {
                      if (!services.blobs || !data.bridge || revision.lineage?.author !== data.did)
                        throw new Error('This version cannot be shared from this device.')
                      const version = await createExtensionVersion({
                        title: revision.title,
                        summary: revision.summary,
                        source: revision.source,
                        author: data.did!,
                        parent: revision.lineage.parent,
                        changeNote: revision.lineage.changeNote
                      })
                      if (version.versionId !== revision.lineage.versionId)
                        throw new Error(
                          'The saved version changed. Save a new version before sharing.'
                        )
                      const file = await services.blobs.uploadData(encodeSharedExtension(version), {
                        filename: `${revision.title.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 60)}.xnet-extension.json`,
                        mimeType: EXTENSION_SHARE_MIME
                      })
                      await data.bridge.create(ChatMessageSchema, {
                        channel: channelId,
                        content: `Shared extension: ${revision.title}\n${version.changeNote}`,
                        attachments: [file]
                      })
                      services.transfers?.enqueueUpload(file)
                      setShareOpen(false)
                      setNotice(
                        'Version shared in this conversation. Saved locally; delivery to other devices is not confirmed.'
                      )
                    } catch (cause) {
                      setError(
                        cause instanceof Error ? cause.message : 'Could not share this version.'
                      )
                    } finally {
                      setSharing(false)
                    }
                  }}
                >
                  {sharing ? 'Sharing…' : 'Share source in this conversation'}
                </button>
              </div>
            )}
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
          <button className="mb-3 text-xs underline" onClick={() => setAllVersions(!allVersions)}>
            {allVersions ? 'Show this extension family' : 'Show all saved extensions'}
          </button>
          <ol aria-label="Extension branches" className="space-y-2">
            {branches
              .filter(
                ({ entry }) => allVersions || !family || rootOf(revisionKey(entry)) === family
              )
              .map(({ entry, depth, missingParent }) => (
                <li
                  key={entry.id}
                  style={{ marginLeft: Math.min(depth, 6) * 12 }}
                  className={`${depth ? 'ml-3 border-l-2 border-border pl-3' : ''}`}
                >
                  <button
                    disabled={busy}
                    aria-current={revision?.id === entry.id ? 'true' : undefined}
                    className={`w-full rounded-lg border p-3 text-left text-xs ${revision?.id === entry.id ? 'border-foreground bg-muted' : 'border-border hover:bg-muted'}`}
                    onClick={() => void preview(entry)}
                  >
                    <span className="flex items-center gap-2">
                      <RotateCcw size={13} />
                      {entry.title}
                      <span className="ml-auto">Try version</span>
                    </span>
                    <span className="mt-1 line-clamp-2">
                      {entry.lineage?.changeNote ?? 'Earlier local build'}
                    </span>
                    <span className="mt-1 block text-[10px] text-muted-foreground">
                      {entry.lineage ? data.nameFor(entry.lineage.author) : 'You'} ·{' '}
                      {new Date(entry.createdAt).toLocaleString()} ·{' '}
                      {entry.lineage?.versionId.slice(0, 8) ?? entry.id.slice(-8)}
                      {installed === entry.id ? ' · installed' : ''}
                      {revision?.id === entry.id ? ' · viewing' : ''}
                    </span>
                    {entry.lineage?.parent && (
                      <span className="mt-1 block text-[10px]">
                        ↳ From {entry.lineage.parent.slice(0, 8)}
                        {missingParent ? ' · parent not available on this device' : ''}
                      </span>
                    )}
                  </button>
                </li>
              ))}
          </ol>
          {revisions.hasMore && (
            <p className="mt-2 text-xs">
              Showing the latest 200 local versions. Older ancestry may be outside this window.
            </p>
          )}
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
