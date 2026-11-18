import type { CommunityAgentRun } from './agent-contract'
import type { AttachmentServices } from './ConversationPane'
import type { CommunityData } from './use-community-data'
import { ChannelSchema, ChatMessageSchema, PageSchema, TaskSchema } from '@xnetjs/data'
import { PluginSourceSchema } from '@xnetjs/plugins'
import { useQuery } from '@xnetjs/react'
import { CodeEditor } from '@xnetjs/ui'
import { Code, GitCompareArrows, RotateCcw, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  CHAT_PREVIEW_POLICY,
  readExtensionProposal,
  watchlistSource,
  extensionExamples,
  type ChatPreviewNode
} from './agent-extension'
import {
  containsExtensionAccess,
  mergeExtensionAccess,
  requestedExtensionAccess,
  suggestedExtensionAccess
} from './extension-access'
import { emptyAccessIntent, type ExtensionAccessIntent } from './extension-access-intent'
import {
  openExtensionAuthority,
  extendExtensionAuthority,
  observeExtensionAuthority,
  type ExtensionAuthority
} from './extension-authority'
import { createExtensionBroker } from './extension-broker'
import { readExtensionGrant, type ExtensionGrant, type ExtensionDataset } from './extension-data'
import { readableNode } from './extension-data'
import { desktopExtensionHost } from './extension-desktop-host'
import {
  subscribeExtensionDocuments,
  type ExtensionDocumentProjection
} from './extension-documents'
import {
  decodeExtensionRequest,
  extensionUndoMessage,
  ExtensionAccessError
} from './extension-protocol'
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
  EXTENSION_SHARE_MIME,
  type ExtensionRevision as Revision,
  type SharedExtension
} from './extension-versions'
import { ExtensionAccessPrompt } from './ExtensionAccessPrompt'
import { canReadExtensionChannel, type ExtensionSelection } from './ExtensionDataPicker'
import { ExtensionDocumentDraftsProvider, type DocumentSave } from './ExtensionDocumentEditor'
import { PreviewTree } from './ExtensionPreviewTree'
import { ExtensionVersionDiff } from './ExtensionVersionDiff'
import { IconButton, Modal, inputClass, primaryButton, secondaryButton } from './primitives'
function writeAccessLabel(grant: ExtensionGrant): string {
  const access = [
    ...(grant.taskWrites ? ['private task editing'] : []),
    ...(grant.documents?.write?.length ? ['private page editing'] : [])
  ]
  return access.join(' and ') || 'read-only'
}

export function ChatExtensionPanel({
  channelId,
  data,
  run,
  proposals,
  services,
  shared,
  onRemix,
  onPublishVersion,
  onHistory,
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
  onPublishVersion?: (revision: Revision) => Promise<void>
  onHistory?: () => void
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
  const [publishedRevision, setPublishedRevision] = useState('')
  const [allVersions, setAllVersions] = useState(false)
  const [baseRevision, setBaseRevision] = useState<string | undefined>()
  const [editing, setEditing] = useState(false)
  const [comparison, setComparison] = useState<Revision | null>(null)
  const comparisonTrigger = useRef<HTMLButtonElement | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const documentEditors = useRef(new Map<string, DocumentSave>())
  const [documents, setDocuments] = useState<ExtensionDocumentProjection[]>([])
  const [tree, setTree] = useState<ChatPreviewNode | null>(null)
  const previewElement = useRef<HTMLElement | null>(null)
  const focusPreview = useRef(false)
  useEffect(() => {
    if (tree && focusPreview.current) {
      focusPreview.current = false
      previewElement.current?.focus({ preventScroll: true })
    }
  }, [tree])
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
  const [grant, setGrant] = useState<ExtensionGrant | null>(null)
  type Build = Awaited<ReturnType<typeof compileChatExtension>>
  const [prepared, setPrepared] = useState<{ source: string; build: Build } | null>(null)
  const [checking, setChecking] = useState(false)
  const [accessDismissed, setAccessDismissed] = useState(false)
  const [runtime, setRuntime] = useState<{
    build: Build
    grant: ExtensionGrant
    authority: ExtensionAuthority
    created: string[]
  } | null>(null)
  const [pendingAccess, setPendingAccess] = useState<{
    id: string
    selection: ExtensionSelection
    intent?: ExtensionAccessIntent
    answer: (allow: boolean, selection?: ExtensionSelection) => void
  } | null>(null)
  const clearBuild = () => {
    setPrepared(null)
    setRuntime(null)
  }
  const liveSession = useRef<ExtensionSession | null>(null)
  useEffect(() => {
    liveSession.current?.mount?.(comparison ? null : previewElement.current)
  }, [comparison])
  const brokerRef = useRef<ReturnType<typeof createExtensionBroker> | null>(null)
  const undoRef = useRef<((receipt: string) => Promise<void>) | null>(null)
  const [lastReceipt, setLastReceipt] = useState<string | null>(null)
  const liveOperation = useRef<AbortController | null>(null)
  const currentData = useRef(data)
  currentData.current = data
  const restoredInstallation = useRef<string | null>(null)
  const restoredProposal = useRef<string | null>(null)
  const operation = useRef<AbortController | null>(null)
  const installKey = `xnet:chat-extension:${data.did}:${channelId}`
  const revisions = useQuery(PluginSourceSchema, { orderBy: { createdAt: 'desc' }, limit: 200 })
  useEffect(() => {
    if (editing) return
    const controller = new AbortController()
    setChecking(true)
    setAccessDismissed(false)
    void compileChatExtension(source, controller.signal)
      .then((build) => {
        if (controller.signal.aborted) return
        setPrepared({ source, build })
        setSelection(suggestedExtensionAccess(build.access, channelId))
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted)
          setError(cause instanceof Error ? cause.message : 'Could not inspect this extension.')
      })
      .finally(() => {
        if (!controller.signal.aborted) setChecking(false)
      })
    return () => controller.abort()
  }, [source, channelId, editing])
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
      setComparison(null)
      setTree(null)
      setGrant(null)
      clearBuild()
      operation.current?.abort()
      liveOperation.current?.abort()
      setManualEdit(false)
      setNotice('')
      setStatus('')
      setError('')
    } catch (cause) {
      setError(String(cause))
    }
  }, [proposalText, proposalId, run?.baseRevisionId, run?.baseVersionId])
  useEffect(() => {
    if (!shared) return
    setComparison(null)
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
    clearBuild()
    setSelection({ channelIds: [], records: [] })
    setManualEdit(false)
    setEditing(false)
    setShareOpen(false)
    setNotice('')
    setStatus('')
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
        const build =
          prepared?.source === inputSource
            ? prepared.build
            : await compileChatExtension(inputSource, controller.signal)
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
        setPrepared({ source: inputSource, build })
        if (!data.did) throw new Error('Your identity is unavailable.')
        const permissionHash = await extensionPermissionHash(build.hash, next.lineage?.versionId)
        const approved = allow
          ? readExtensionGrant(
              JSON.stringify({ version: 1, owner: data.did, hash: permissionHash, ...selection }),
              data.did,
              permissionHash
            )
          : undefined
        let saved = await openExtensionAuthority(data.bridge, data.did, channelId, permissionHash)
        if (approved) {
          if (saved && containsExtensionAccess(approved, saved.approval.grant)) {
            await extendExtensionAuthority(data.bridge, saved.authority, approved)
            saved = {
              authority: saved.authority,
              approval: (await saved.authority.read()).approval
            }
          } else
            saved = await openExtensionAuthority(
              data.bridge,
              data.did,
              channelId,
              permissionHash,
              approved
            )
        }
        if (controller.signal.aborted && allow) await saved?.authority.revoke()
        controller.signal.throwIfAborted()
        setAuthority(saved?.authority ?? null)
        const required = suggestedExtensionAccess(
          build.access,
          channelId,
          saved?.approval.grant ?? selection
        )
        if (saved && containsExtensionAccess(saved.approval.grant, required)) {
          const approved = saved.approval.grant
          setSelection({
            channelIds: approved.channelIds,
            records: approved.records,
            taskWrites: approved.taskWrites,
            documents: approved.documents,
            containers: approved.containers
          })
          setGrant(approved)
          setRuntime({
            build,
            grant: approved,
            authority: saved.authority,
            created: saved.approval.created
          })
        } else {
          setSelection(required)
          setRuntime(null)
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
          saved && containsExtensionAccess(saved.approval.grant, required)
            ? 'Opening extension…'
            : ''
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
      history,
      prepared
    ]
  )
  useEffect(() => {
    if (
      (!run && !shared) ||
      manualEdit ||
      checking ||
      !prepared ||
      prepared.source !== source ||
      revision ||
      busy ||
      editing ||
      comparison ||
      error ||
      accessDismissed
    )
      return
    const saved = history.find(
      (entry) =>
        entry.source === source &&
        entry.hash === prepared.build.hash &&
        (!shared || entry.lineage?.versionId === shared.versionId) &&
        (!run || entry.actor.includes(`· run ${run.id} ·`))
    )
    if (!saved || restoredProposal.current === saved.id) return
    restoredProposal.current = saved.id
    void preview(saved)
  }, [
    run,
    shared,
    manualEdit,
    checking,
    prepared,
    source,
    revision,
    busy,
    editing,
    comparison,
    error,
    accessDismissed,
    history,
    preview
  ])
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
    setRuntime(null)
    setPendingAccess(null)
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
  useEffect(() => {
    if (!runtime || !data.bridge) return
    const { build, authority } = runtime
    let grant = runtime.grant
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
    const makeBroker = (scope: ExtensionGrant, created: readonly string[]) =>
      createExtensionBroker(
        data.bridge!,
        scope,
        () =>
          !stopped &&
          currentData.current.did === scope.owner &&
          scope.channelIds.every((id) => canReadExtensionChannel(currentData.current, id)),
        authority,
        created
      )
    let broker = makeBroker(grant, runtime.created)
    brokerRef.current = broker
    const makeQueries = (scope: ExtensionGrant) =>
      createExtensionQueryBroker(data.bridge!, scope, authority, (id) =>
        canReadExtensionChannel(currentData.current, id)
      )
    let queries = makeQueries(grant)
    let upgrading = false
    let asking = false
    let accessRequests = 0
    const refused = new Set<string>()
    const authorize = async (
      request: ReturnType<typeof decodeExtensionRequest>,
      signal: AbortSignal
    ) => {
      if (upgrading)
        throw new ExtensionAccessError('unavailable', 'Access is being updated. Try again.')
      const next =
        request.operation === 'data.undo' &&
        grant.taskWrites &&
        !grant.taskWrites.remove &&
        (await broker.undoNeedsRemoval(request.receipt))
          ? { ...grant, taskWrites: { ...grant.taskWrites, remove: true } }
          : requestedExtensionAccess(
              request,
              grant,
              broker.createdRecords().map((record) => record.id),
              channelId
            )
      if (!next) return
      const key = JSON.stringify([
        next,
        request.operation === 'data.query' ? request.schemaId : 'mutation'
      ])
      if (refused.has(key) || asking)
        throw new ExtensionAccessError('denied', 'Additional access was not allowed.')
      if (++accessRequests > 5)
        throw new ExtensionAccessError(
          'quota',
          'This extension has asked for access too often. Reopen it to review access again.'
        )
      asking = true
      const id = crypto.randomUUID()
      try {
        const approvedScope = await new Promise<ExtensionSelection | null>((resolve, reject) => {
          const cancel = () => {
            setPendingAccess((current) => (current?.id === id ? null : current))
            reject(new ExtensionAccessError('cancelled', 'The access request was cancelled.'))
          }
          if (signal.aborted) {
            cancel()
            return
          }
          signal.addEventListener('abort', cancel, { once: true })
          setPendingAccess({
            id,
            selection: next,
            intent:
              request.operation === 'data.query' &&
              [TaskSchema._schemaId, PageSchema._schemaId].includes(
                request.schemaId as typeof TaskSchema._schemaId
              )
                ? {
                    ...emptyAccessIntent(),
                    tasks: request.schemaId === TaskSchema._schemaId,
                    pages: request.schemaId === PageSchema._schemaId
                  }
                : undefined,
            answer: (allow, chosen = next) => {
              signal.removeEventListener('abort', cancel)
              setPendingAccess(null)
              resolve(allow ? chosen : null)
            }
          })
        })
        if (!approvedScope) {
          refused.add(key)
          throw new ExtensionAccessError('denied', 'You chose not to allow this access.')
        }
        if (stopped || signal.aborted)
          throw new ExtensionAccessError('cancelled', 'The extension stopped before approval.')
        if (
          approvedScope.channelIds.some((id) => !canReadExtensionChannel(currentData.current, id))
        )
          throw new ExtensionAccessError('denied', 'This conversation is unavailable.')
        upgrading = true
        await broker.revoke()
        await extendExtensionAuthority(data.bridge!, authority, { ...grant, ...approvedScope })
        if (stopped || signal.aborted)
          throw new ExtensionAccessError('cancelled', 'The extension stopped before approval.')
        grant = { ...grant, ...approvedScope }
        const saved = await authority.read()
        broker = makeBroker(grant, saved.approval.created)
        brokerRef.current = broker
        queries = makeQueries(grant)
        setGrant(grant)
        setSelection(grant)
        subscribe()
      } catch (cause) {
        if (upgrading && !stopped) stopForAuthority(cause)
        throw cause
      } finally {
        asking = false
        upgrading = false
      }
    }
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
      if (checkingAuthority || stopped || upgrading) return
      if (
        currentData.current.did !== grant.owner ||
        grant.channelIds.some((id) => !canReadExtensionChannel(currentData.current, id))
      ) {
        stopForAuthority(
          new ExtensionAccessError('revoked', 'Conversation access is no longer available.')
        )
        return
      }
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
                title,
                view: (view) => {
                  if (!stopped) {
                    setTree(view)
                    setBusy(false)
                    setError('')
                  }
                },
                error: stopForAuthority,
                document: async (handle, revision, text) => {
                  const save = documentEditors.current.get(handle)
                  if (!save) throw new Error('Document editing has not been approved.')
                  await save(revision, text)
                },
                authorize,
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
            session.mount?.(previewElement.current)
          }
          setStatus('')
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
    const undo = async (receipt: string) => {
      const request = {
        version: 1 as const,
        id: crypto.randomUUID(),
        operation: 'data.undo' as const,
        receipt
      }
      await authorize(request, controller.signal)
      await broker.request(request, controller.signal)
      subscribe()
    }
    undoRef.current = undo
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
      setPendingAccess(null)
      if (brokerRef.current === broker) brokerRef.current = null
      if (undoRef.current === undo) undoRef.current = null
    }
  }, [runtime, data.bridge, channelId])
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
      !comparison &&
      !error
    ) {
      restoredInstallation.current = pinned.id
      void preview(pinned)
    }
  }, [installed, history, run, shared, revision, busy, editing, comparison, error, preview])
  const selectedKey = revision ? revisionKey(revision) : parentVersion
  const branches = extensionBranches(history)
  const compare = (entry: Revision, trigger: HTMLButtonElement) => {
    comparisonTrigger.current = trigger
    liveSession.current?.mount?.(null)
    setComparison(entry)
  }
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
      className="flex min-h-0 w-full flex-1 flex-col bg-background"
    >
      <header className="flex items-center gap-2 border-b border-border px-5 py-4">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-semibold">
            {comparison ? 'Extension code changes' : title}
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {comparison
              ? 'Compare saved versions'
              : editing
                ? 'Editing index.tsx'
                : 'Private extension preview'}
          </p>
        </div>
        <IconButton label="Close extension preview" onClick={onClose}>
          <X size={17} />
        </IconButton>
      </header>
      {comparison && (
        <ExtensionVersionDiff
          key={revisionKey(comparison)}
          revision={comparison}
          history={history}
          nameFor={data.nameFor}
          onBack={() => {
            setComparison(null)
            requestAnimationFrame(() => comparisonTrigger.current?.focus())
          }}
        />
      )}
      {editing ? (
        <div className={comparison ? 'hidden' : 'flex min-h-0 flex-1 flex-col gap-3 p-4'}>
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
              required
              placeholder="For example: Add a restart button"
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
          <CodeEditor
            ariaLabel="Extension TypeScript source"
            language="tsx"
            showToolbar
            value={source}
            className="min-h-[160px] flex-1"
            onChange={(value) => {
              revoke()
              clearBuild()
              setSource(value)
              setManualEdit(true)
              setIncomingVersion(null)
              setBaseRevision(revision?.id ?? baseRevision)
              setRevision(null)
            }}
            onRun={() => {
              if (changeNote.trim() && source.length <= 24000) setEditing(false)
            }}
          />
          <div className="flex flex-wrap items-center gap-3">
            <button
              className={primaryButton}
              disabled={!changeNote.trim() || source.length > 24000}
              onClick={() => setEditing(false)}
            >
              Review changes
            </button>
            <button className={secondaryButton} onClick={() => setEditing(false)}>
              Back to preview
            </button>
            <span className="text-[10px] text-muted-foreground">⌘/Ctrl+Enter to review</span>
          </div>
          {!changeNote.trim() && (
            <p className="text-xs text-muted-foreground">
              Add a short change note above to review this version.
            </p>
          )}
          {source.length > 24000 && (
            <p role="alert" className="text-xs text-destructive">
              This extension exceeds the 24,000-character source limit. Shorten it before reviewing.
            </p>
          )}
        </div>
      ) : (
        <div className={comparison ? 'hidden' : 'min-h-0 flex-1 space-y-4 overflow-auto p-5'}>
          {pendingAccess && (
            <Modal
              title="Extension access"
              finalFocus={previewElement}
              onClose={() => pendingAccess.answer(false)}
            >
              <ExtensionAccessPrompt
                title={title}
                data={data}
                selection={pendingAccess.selection}
                intent={pendingAccess.intent}
                onChange={(next) =>
                  setPendingAccess((current) =>
                    current ? { ...current, selection: mergeExtensionAccess(grant!, next) } : null
                  )
                }
                upgrade
                onAllow={() => pendingAccess.answer(true, pendingAccess.selection)}
                onDeny={() => pendingAccess.answer(false)}
              />
            </Modal>
          )}
          {summary && (
            <details className="text-xs text-muted-foreground">
              <summary className="cursor-pointer">About this extension</summary>
              <p className="mt-2 leading-5">{summary}</p>
            </details>
          )}
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
          {!grant &&
            !accessDismissed &&
            (checking || !prepared || prepared.source !== source ? (
              <p role="status" className="text-xs text-muted-foreground">
                {editing
                  ? 'Finish editing to review access.'
                  : error
                    ? 'Access could not be checked. Review the error below.'
                    : 'Checking what this extension needs…'}
              </p>
            ) : (
              <ExtensionAccessPrompt
                title={title}
                data={data}
                intent={prepared.build.access}
                selection={selection}
                busy={busy}
                onChange={setSelection}
                onAllow={() => {
                  focusPreview.current = true
                  void preview(undefined, true)
                }}
                onDeny={() => {
                  setAccessDismissed(true)
                  setStatus('Access not granted. Your data stays private.')
                }}
              />
            ))}
          {accessDismissed && !grant && (
            <button className={secondaryButton} onClick={() => setAccessDismissed(false)}>
              Review access
            </button>
          )}
          <details className="text-xs">
            <summary className="cursor-pointer text-muted-foreground">
              {grant ? 'Manage extension' : 'More options'}
            </summary>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                className={secondaryButton}
                onClick={() => {
                  if (!editing) {
                    setParentVersion(
                      revision
                        ? revisionKey(revision)
                        : (incomingVersion?.versionId ?? parentVersion)
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
            <details className="mt-3">
              <summary className="cursor-pointer">Try an example</summary>
              <div className="mt-2 flex flex-wrap gap-2">
                {extensionExamples
                  .filter((example) => !example.desktopOnly || Boolean(desktopExtensionHost()))
                  .map((example) => (
                    <button
                      key={example.title}
                      className={secondaryButton}
                      onClick={() => {
                        revoke()
                        clearBuild()
                        setRevision(null)
                        setSource(example.source)
                        setTitle(example.title)
                        setSummary(example.summary)
                        setManualEdit(true)
                        setIncomingVersion(null)
                        setParentVersion(undefined)
                        setBaseRevision(undefined)
                        setChangeNote('Initial example version')
                        setStatus('')
                        setSelection({ channelIds: [], records: [] })
                      }}
                    >
                      {example.title}
                    </button>
                  ))}
              </div>
            </details>
          </details>
          {revision && (
            <button
              className={secondaryButton}
              disabled={
                busy ||
                !!(
                  onPublishVersion &&
                  revision.source !== shared?.source &&
                  publishedRevision !== revision.id
                )
              }
              onClick={() => onRemix(revision)}
              title={
                onPublishVersion &&
                publishedRevision !== revision.id &&
                revision.source !== shared?.source
                  ? 'Publish your edit to the project before asking the agent to build on it.'
                  : undefined
              }
            >
              Edit this version with your agent
            </button>
          )}
          {onHistory && (
            <button className={secondaryButton} onClick={onHistory}>
              Project versions and development history
            </button>
          )}
          {revision &&
            onPublishVersion &&
            publishedRevision !== revision.id &&
            !incomingVersion &&
            revision.lineage?.author === data.did &&
            revision.source !== shared?.source && (
              <button
                className={secondaryButton}
                disabled={busy || sharing}
                onClick={() => {
                  setSharing(true)
                  void onPublishVersion(revision)
                    .then(() => {
                      setPublishedRevision(revision.id)
                      setParentVersion(revision.lineage?.versionId)
                      setBaseRevision(revision.id)
                      setNotice(
                        'Your version was published to the shared project. You can now build on it with the agent.'
                      )
                    })
                    .catch((cause: unknown) => setError(String(cause)))
                    .finally(() => setSharing(false))
                }}
              >
                Publish my edit to project
              </button>
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
                const undo = undoRef.current
                if (!undo || undoing) return
                setUndoing(true)
                setError('')
                setNotice('')
                void undo(lastReceipt)
                  .then(() => {
                    if (undoRef.current !== undo) return
                    setLastReceipt(null)
                    setNotice('Extension edit undone.')
                  })
                  .catch((error: unknown) => {
                    if (undoRef.current === undo) setError(extensionUndoMessage(error))
                  })
                  .finally(() => {
                    if (undoRef.current === undo) setUndoing(false)
                  })
              }}
            >
              {undoing ? 'Undoing…' : 'Undo last extension edit'}
            </button>
          )}
          {tree && (
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Running on this device</span>
              <button className={secondaryButton} onClick={revoke}>
                Stop extension
              </button>
            </div>
          )}
          {tree && (
            <section
              ref={(element) => {
                previewElement.current = element
                liveSession.current?.mount?.(element)
              }}
              tabIndex={-1}
              aria-label="Running extension"
              className={`rounded-xl border border-border ${desktopExtensionHost() ? 'h-[480px] overflow-hidden' : 'p-4'}`}
            >
              {!desktopExtensionHost() && (
                <ExtensionDocumentDraftsProvider key={authority?.epoch}>
                  <PreviewTree
                    node={tree}
                    session={liveSession.current}
                    documents={documents}
                    editors={documentEditors.current}
                  />
                </ExtensionDocumentDraftsProvider>
              )}
            </section>
          )}
          {revision && (
            <details className="space-y-2 rounded-lg border border-border p-3 text-xs">
              <summary className="cursor-pointer font-medium">
                {installed === revision.id
                  ? 'Installed on this device'
                  : 'Save or share this version'}
              </summary>
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
              <button
                className={secondaryButton}
                disabled={busy}
                onClick={(event) => compare(revision, event.currentTarget)}
              >
                <GitCompareArrows size={14} /> View code changes
              </button>
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
                        if (
                          !services.blobs ||
                          !data.bridge ||
                          revision.lineage?.author !== data.did
                        )
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
                        const file = await services.blobs.uploadData(
                          encodeSharedExtension(version),
                          {
                            filename: `${revision.title.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 60)}.xnet-extension.json`,
                            mimeType: EXTENSION_SHARE_MIME
                          }
                        )
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
            </details>
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
          <details className="border-t border-border pt-4">
            <summary className="mb-2 cursor-pointer text-xs font-semibold">Version history</summary>
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
                    <button
                      className="mt-1 inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                      disabled={busy}
                      aria-label={`View changes: ${entry.lineage?.changeNote ?? entry.title} · ${revisionKey(entry).slice(0, 8)}`}
                      onClick={(event) => compare(entry, event.currentTarget)}
                    >
                      <GitCompareArrows size={13} /> View changes
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
                Compiled sources are saved as separate versions. Failed previews are never
                installed.
              </p>
            )}
            <p className="mt-3 text-[10px] leading-5 text-muted-foreground">
              Restoring a version changes the view only. Your original messages remain accessible in
              chat. Receiving or editing source never installs it automatically.
            </p>
          </details>
        </div>
      )}
    </aside>
  )
}
