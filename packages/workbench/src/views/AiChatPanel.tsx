/**
 * AI Chat panel (explorations 0174 + 0192).
 *
 * A Bring-Your-Own-Model chat surface: detects the available model connectors,
 * lets the user pick/configure one (cloud key, local Ollama/LM Studio, bridge,
 * or in-tab Gemini Nano), and streams an assistant reply through the shared
 * AiAgentRuntime.
 *
 * The runtime is grounded in the user's workspace (0192 Phase 1): an
 * AiSurfaceService built from the local NodeStore + schema registry produces a
 * read-only context pack for each turn, injected ahead of the conversation so
 * the assistant answers about the user's own pages/databases/nodes. This is
 * read-only — live tool execution + approval-gated writes are the next step.
 *
 * Event handling, send-eligibility, and connector→provider mapping live in
 * `ai-chat-connector.ts`; context formatting in `ai-context.ts` and the schema
 * adapter in `ai-schemas.ts` (all pure + tested); this file is composition.
 */

import {
  createAIProvider,
  createAiAgentRuntime,
  createAiSurfaceService,
  createManagedProvider,
  createPromptApiProvider,
  detectConnectors,
  downloadPromptApiModel,
  promptApiAvailability,
  type AiAgentRuntime,
  type AiSurfaceService,
  type AIProvider,
  type AIToolCall,
  type ConnectorDetection,
  type ConnectorTier,
  type ManagedBudgetSnapshot,
  type PromptApiAvailability
} from '@xnetjs/plugins'
import { useIdentity } from '@xnetjs/react'
import { useDataBridge, useNodeStore } from '@xnetjs/react/internal'
import { Bot, Loader2, Send } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { usePlatform } from '../platform'
import { createFramedBridgeProvider, type BridgeAgentFrame } from './ai-bridge-frames'
import { createChatCeremony, type CeremonyPending, type ChatCeremony } from './ai-chat-ceremony'
import {
  AI_CHAT_STORAGE_KEYS,
  applyRuntimeEvent,
  baseUrlFromDetail,
  canSendMessage,
  createPkceVerifier,
  errorMessage,
  exchangeOpenRouterCode,
  fetchManagedModels,
  formatModelOption,
  groupModelsByFamily,
  KNOWN_BRIDGE_AGENTS,
  OPENROUTER_VERIFIER_KEY,
  openRouterAuthUrl,
  openRouterCallbackCode,
  parseBridgeHealth,
  pickUsableConnector,
  pkceChallengeS256,
  providerConfigForConnector,
  type AiChatSettings,
  type BridgeHealth,
  type ChatToolActivity,
  type CloudProvider,
  type ManagedModel
} from './ai-chat-connector'
import { createAiConversationLog, type AiConversationLog } from './ai-chat-persistence'
import { AI_TOOLS_PROMPT, readOnlyToolSpecs, toolsEnabledFor } from './ai-chat-tools'
import {
  AI_TOOLS_PROMPT_WRITABLE,
  AI_WRITE_TOOLS_PROMPT,
  writeToolSpecs
} from './ai-chat-write-tools'
import { AI_SYSTEM_PROMPT, formatContextMessages } from './ai-context'
import { createGraphContextRetriever, keywordEntrySearch } from './ai-graph-retriever'
import { schemaRegistryApi } from './ai-schemas'
import { createVectorEntrySearch } from './ai-vector-search'
import { createVectorBlobStore } from './ai-vector-storage'
import { buildWebLLMProvider, type WebLLMProgress } from './ai-webllm-engine'

/** Electron preload control channel for the local agent bridge (absent on web). */
interface AgentBridgeControl {
  start: (agent?: string) => Promise<unknown>
  /** Current daemon status, including the pairing token (IPC only, never HTTP). */
  status?: () => Promise<{ running?: boolean; token?: string } | undefined>
}

declare global {
  interface Window {
    xnetAgentBridge?: AgentBridgeControl
  }
}

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

const readSetting = (key: string): string =>
  (typeof window !== 'undefined' && window.localStorage.getItem(key)) || ''

const writeSetting = (key: string, value: string): void => {
  if (typeof window === 'undefined') return
  if (value) window.localStorage.setItem(key, value)
  else window.localStorage.removeItem(key)
}

export function AiChatPanel({ initialPrompt }: { initialPrompt?: string } = {}) {
  // The preload control channel is a capability, not a window sniff (0406):
  // the host declares agentBridge, and only then is the global consulted.
  const { capabilities } = usePlatform()
  const bridgeControl =
    capabilities.agentBridge && typeof window !== 'undefined' ? window.xnetAgentBridge : undefined
  const [detections, setDetections] = useState<ConnectorDetection[]>([])
  const [selectedTier, setSelectedTier] = useState<ConnectorTier | null>(
    () => (readSetting(AI_CHAT_STORAGE_KEYS.tier) as ConnectorTier) || null
  )
  const [apiKey, setApiKey] = useState(() => readSetting(AI_CHAT_STORAGE_KEYS.apiKey))
  const [cloudProvider, setCloudProvider] = useState<CloudProvider>(
    () => (readSetting(AI_CHAT_STORAGE_KEYS.cloudProvider) as CloudProvider) || 'anthropic'
  )
  const [messages, setMessages] = useState<ChatMessage[]>([])
  // Seeded by the dock hand-off (0388): the compact Assistant carries the
  // question the user already typed instead of discarding it.
  const [input, setInput] = useState(initialPrompt ?? '')
  const [streaming, setStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  const [bridgeHealth, setBridgeHealth] = useState<BridgeHealth | null>(null)
  const [bridgeRefresh, setBridgeRefresh] = useState(0)
  const [model, setModel] = useState(() => readSetting(AI_CHAT_STORAGE_KEYS.model))
  const [bridgeToken, setBridgeToken] = useState(() =>
    readSetting(AI_CHAT_STORAGE_KEYS.bridgeToken)
  )
  // Chrome 142+/145+ gates https→loopback behind a `loopback-network` permission
  // (null = not yet queried / browser has no such gate, e.g. Safari today).
  const [loopbackPermission, setLoopbackPermission] = useState<PermissionState | null>(null)
  const [budget, setBudget] = useState<ManagedBudgetSnapshot | null>(null)
  const [managedModels, setManagedModels] = useState<ManagedModel[]>([])
  // In-tab model activation (exploration 0252). Both in-tab tiers gate their
  // heavy first-run download behind an explicit gesture so picking the tier
  // doesn't surprise-download a model: `webllmArmed` is the WebLLM "load"
  // click; `nanoState`/`nanoProgress` drive the Gemini Nano download button.
  const [webllmArmed, setWebllmArmed] = useState(false)
  const [webllmProgress, setWebllmProgress] = useState<WebLLMProgress | null>(null)
  const [nanoState, setNanoState] = useState<PromptApiAvailability | null>(null)
  const [nanoProgress, setNanoProgress] = useState<number | null>(null)
  // Bumped after a successful in-tab download to re-run detection so the tier
  // flips from "downloadable" to "available".
  const [detectNonce, setDetectNonce] = useState(0)

  const runtimeRef = useRef<AiAgentRuntime | null>(null)
  const threadIdRef = useRef<string | null>(null)
  const cleanupRef = useRef<(() => void) | null>(null)

  const settings = useMemo<AiChatSettings>(
    () => ({
      apiKey: apiKey || undefined,
      cloudProvider,
      model: model || undefined,
      bridgeToken: bridgeToken || undefined
    }),
    [apiKey, cloudProvider, model, bridgeToken]
  )

  // Reset the budget gauge whenever the active model changes — the next managed
  // call repopulates it from the response.
  const onBudget = useCallback((snapshot: ManagedBudgetSnapshot) => setBudget(snapshot), [])

  // Read-only workspace grounding: the local NodeStore + schema registry already
  // satisfy the AiSurfaceService contract, so the assistant can search the
  // user's own pages/databases/nodes for context (exploration 0192, Phase 1).
  const { store } = useNodeStore()
  // Opt-in: on-device semantic (vector) entry search (exploration 0211). Off by
  // default — the heavy embedding model loads lazily, only on the first search
  // after opt-in, and falls back to keyword while warming / on failure.
  const [semanticSearch, setSemanticSearch] = useState(
    () => readSetting(AI_CHAT_STORAGE_KEYS.semanticSearch) === 'on'
  )
  // Opt-in writes behind the approval ceremony (0394 Phase 2). Default OFF: a
  // write surface is chosen, never a side effect of picking a model.
  const [writesEnabled, setWritesEnabled] = useState(
    () => readSetting(AI_CHAT_STORAGE_KEYS.writes) === 'on'
  )
  const { did: operatorDID } = useIdentity()
  const [pendingApprovals, setPendingApprovals] = useState<CeremonyPending[]>([])
  const ceremonyRef = useRef<ChatCeremony | null>(null)
  // The flag is read live (via a ref) inside the entry-search closure, so toggling
  // it does NOT change `surface`'s identity — which would otherwise rebuild the
  // runtime and reset the active thread mid-conversation.
  const semanticRef = useRef(semanticSearch)
  useEffect(() => {
    semanticRef.current = semanticSearch
  }, [semanticSearch])

  const surface = useMemo<AiSurfaceService | null>(() => {
    if (!store) return null
    // Graph-aware, budgeted context retrieval (exploration 0211): the context
    // pack walks typed relations instead of a flat keyword scan. Both entry
    // searches are built once (constructing the vector tier is cheap — the model
    // loads lazily only when a search actually routes to it); the live flag picks
    // which one each query uses, persisted across sessions via IndexedDB.
    const keyword = keywordEntrySearch(store)
    const vector = createVectorEntrySearch({ store, storage: createVectorBlobStore() })
    const entrySearch = (query: string, k: number) =>
      semanticRef.current ? vector.search(query, k) : keyword(query, k)
    const retrieveContext = createGraphContextRetriever(store, { entrySearch })
    return createAiSurfaceService({ store, schemas: schemaRegistryApi(), retrieveContext })
  }, [store])

  const toggleSemanticSearch = useCallback((next: boolean) => {
    setSemanticSearch(next)
    writeSetting(AI_CHAT_STORAGE_KEYS.semanticSearch, next ? 'on' : '')
  }, [])

  const toggleWrites = useCallback((next: boolean) => {
    setWritesEnabled(next)
    writeSetting(AI_CHAT_STORAGE_KEYS.writes, next ? 'on' : '')
  }, [])

  // Conversation persistence (0391 Phase 2): the thread and its turns land as
  // Channel/ChatMessage nodes so research survives the panel. The assistant
  // reply is buffered from deltas and logged once, when the turn settles.
  const dataBridge = useDataBridge()
  const conversationLogRef = useRef<AiConversationLog | null>(null)
  const assistantBufferRef = useRef('')
  const [activity, setActivity] = useState<ChatToolActivity | null>(null)
  // Framed bridge display (0392/0394): the agent's own tool use, cost, and
  // permission asks, previously flattened away by the OpenAI-compatible wire.
  const [bridgeCost, setBridgeCost] = useState<{ usd?: number; outputTokens?: number } | null>(null)
  const [bridgePermission, setBridgePermission] = useState<string | null>(null)
  const bridgeToolNamesRef = useRef(new Map<string, string>())

  const handlers = useMemo(
    () => ({
      onDelta: (text: string) => {
        assistantBufferRef.current += text
        setMessages((prev) => appendToAssistant(prev, text))
      },
      onSettled: () => {
        setStreaming(false)
        setActivity(null)
        setBridgePermission(null)
        void conversationLogRef.current?.logAssistantReply(assistantBufferRef.current)
        assistantBufferRef.current = ''
      },
      onError: (message: string) => setError(message),
      // Tool use is visible while it happens (0394): an assistant that goes
      // quiet for two seconds mid-answer has to be seen looking something up,
      // not appear stuck. Cleared when the turn settles.
      onActivity: (next: ChatToolActivity) => setActivity(next)
    }),
    []
  )

  // Structured frames from the bridge agent. Tool activity reuses the same
  // line as in-panel tools; a permission ask is surfaced honestly — the panel
  // has no response channel to the agent's own consent flow, so it points at
  // where the decision actually lives.
  const onAgentFrame = useCallback((frame: BridgeAgentFrame) => {
    if (frame.type === 'tool_call') {
      bridgeToolNamesRef.current.set(frame.id, frame.name)
      setActivity({ kind: 'call', tool: frame.name })
    } else if (frame.type === 'tool_result') {
      const tool = bridgeToolNamesRef.current.get(frame.id)
      if (tool) setActivity({ kind: 'result', tool })
    } else if (frame.type === 'cost') {
      setBridgeCost({
        ...(frame.usd !== undefined ? { usd: frame.usd } : {}),
        ...(frame.outputTokens !== undefined ? { outputTokens: frame.outputTokens } : {})
      })
    } else if (frame.type === 'permission_request') {
      setBridgePermission(frame.tool)
    }
  }, [])

  // Persist the selected tier so the choice survives a reload.
  const selectTier = useCallback((tier: ConnectorTier) => {
    setSelectedTier(tier)
    writeSetting(AI_CHAT_STORAGE_KEYS.tier, tier)
  }, [])

  // OpenRouter PKCE connect (0391 Phase 3): send the user to openrouter.ai to
  // authorize; the callback lands back here with ?code=.
  const connectOpenRouter = useCallback(async () => {
    const verifier = createPkceVerifier()
    writeSetting(OPENROUTER_VERIFIER_KEY, verifier)
    const challenge = await pkceChallengeS256(verifier)
    window.location.href = openRouterAuthUrl(
      `${window.location.origin}${window.location.pathname}`,
      challenge
    )
  }, [])

  // Complete an in-flight OpenRouter connect: exchange ?code= for a
  // user-scoped key, store it as the cloud-key tier, and clean the URL.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const verifier = readSetting(OPENROUTER_VERIFIER_KEY)
    const code = openRouterCallbackCode(window.location.search)
    if (!verifier || !code) return
    let cancelled = false
    void exchangeOpenRouterCode(code, verifier).then((key) => {
      writeSetting(OPENROUTER_VERIFIER_KEY, '')
      const url = new URL(window.location.href)
      url.searchParams.delete('code')
      window.history.replaceState(null, '', url.toString())
      if (cancelled) return
      if (!key) {
        setError('OpenRouter connect failed — try again or paste a key manually.')
        return
      }
      setApiKey(key)
      writeSetting(AI_CHAT_STORAGE_KEYS.apiKey, key)
      setCloudProvider('openrouter')
      writeSetting(AI_CHAT_STORAGE_KEYS.cloudProvider, 'openrouter')
      setSelectedTier('cloud-key')
      writeSetting(AI_CHAT_STORAGE_KEYS.tier, 'cloud-key')
    })
    return () => {
      cancelled = true
    }
  }, [])

  // Detect connectors (re-runs when the key changes so cloud-key flips available).
  // Auto-select only a tier we can actually instantiate (never the webllm trap);
  // a previously chosen tier is kept as-is.
  useEffect(() => {
    let cancelled = false
    // The web app *can* build an in-tab WebLLM engine (the lazy import in
    // ai-webllm-engine.ts), so advertise the tier as usable — without this the
    // `webllm` tier would (correctly) report unavailable, since detection no
    // longer trusts `navigator.gpu` alone.
    void detectConnectors({
      hasCloudKey: () => apiKey.length > 0,
      hasWebLLMEngine: () => true,
      ...(typeof location !== 'undefined' ? { appOrigin: location.origin } : {})
    }).then((result) => {
      if (cancelled) return
      setDetections(result)
      setSelectedTier((current) => current ?? pickUsableConnector(result)?.tier ?? null)
    })
    return () => {
      cancelled = true
    }
  }, [apiKey, detectNonce])

  const selected = detections.find((d) => d.tier === selectedTier) ?? null

  // Switching tiers disarms any pending in-tab load, so a stale "load" gesture
  // or progress bar doesn't bleed across a tier change.
  useEffect(() => {
    setWebllmArmed(false)
    setWebllmProgress(null)
  }, [selectedTier])

  // When Gemini Nano is selected but not yet "available", probe the raw state so
  // the panel can offer a *download* gesture for 'downloadable'/'downloading'
  // (rather than just claiming it's unavailable). 'available' flips via detection.
  useEffect(() => {
    if (selected?.tier !== 'prompt-api' || selected.available) {
      setNanoState(null)
      return
    }
    let cancelled = false
    void promptApiAvailability().then((state) => {
      if (!cancelled) setNanoState(state)
    })
    return () => {
      cancelled = true
    }
  }, [selected, detectNonce])

  // Surface which agent the local bridge is driving (from its /health), so the
  // user can see + (in Electron) switch the running agent (exploration 0194).
  const bridgeBaseUrl =
    selected?.tier === 'bridge' && selected.available
      ? baseUrlFromDetail(selected.detail)
      : undefined
  useEffect(() => {
    if (!bridgeBaseUrl || typeof fetch === 'undefined') {
      setBridgeHealth(null)
      return
    }
    let cancelled = false
    void fetch(`${bridgeBaseUrl}/health`)
      .then((response) => response.json())
      .then((data) => {
        if (!cancelled) setBridgeHealth(parseBridgeHealth(data))
      })
      .catch(() => {
        if (!cancelled) setBridgeHealth(null)
      })
    return () => {
      cancelled = true
    }
  }, [bridgeBaseUrl, bridgeRefresh])

  // Auto-pair under Electron: the main process hands the daemon's pairing token
  // to the renderer over IPC (never HTTP), so the xNet app can talk to its own
  // bridge without the user copying a code. A plain browser has no such channel
  // and falls back to the pairing-code field below.
  useEffect(() => {
    if (selected?.tier !== 'bridge') return
    const control = bridgeControl
    if (!control?.status) return
    let cancelled = false
    void control
      .status()
      .then((state) => {
        if (cancelled || !state?.token) return
        setBridgeToken(state.token)
        writeSetting(AI_CHAT_STORAGE_KEYS.bridgeToken, state.token)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [selected, bridgeRefresh, bridgeControl])

  // Loopback tiers reach `http://127.0.0.1:*` from an https page, which Chrome
  // 142+/145+ gates behind a `loopback-network` permission. Query it so we can
  // guide the user instead of failing silently (Safari/older browsers lack the
  // gate → the query rejects → null → no hint, which is correct there).
  useEffect(() => {
    const loopbackTier = selected?.tier === 'bridge' || selected?.tier === 'local-server'
    if (!loopbackTier || typeof navigator === 'undefined' || !navigator.permissions?.query) {
      setLoopbackPermission(null)
      return
    }
    let cancelled = false
    void navigator.permissions
      .query({ name: 'loopback-network' as PermissionName })
      .then((status) => {
        if (!cancelled) setLoopbackPermission(status.state)
      })
      .catch(() => {
        if (!cancelled) setLoopbackPermission(null)
      })
    return () => {
      cancelled = true
    }
  }, [selected])

  // Managed: load the plan-gated model catalog so the picker is data-driven, and
  // preselect the plan's default model when the user hasn't chosen one.
  const managedActive = selected?.tier === 'managed' && selected.available
  useEffect(() => {
    if (!managedActive) {
      setManagedModels([])
      return
    }
    let cancelled = false
    void fetchManagedModels(settings.hubBaseUrl ?? '').then(({ models, defaultModel }) => {
      if (cancelled) return
      setManagedModels(models)
      if (!readSetting(AI_CHAT_STORAGE_KEYS.model) && defaultModel) {
        setModel(defaultModel)
        writeSetting(AI_CHAT_STORAGE_KEYS.model, defaultModel)
      }
    })
    return () => {
      cancelled = true
    }
  }, [managedActive, settings.hubBaseUrl])

  // Switch the running agent — only possible where a control channel exists
  // (the Electron preload bridge); the web daemon is launched with a fixed agent.
  const switchBridgeAgent = useCallback(
    async (agent: string) => {
      if (!bridgeControl || !agent) return
      await bridgeControl.start(agent)
      setBridgeRefresh((count) => count + 1)
    },
    [bridgeControl]
  )

  // (Re)build the runtime when the active connector/settings change.
  useEffect(() => {
    runtimeRef.current = null
    threadIdRef.current = null
    setReady(false)
    setError(null)
    if (!selected?.available) return
    // In-tab WebLLM downloads weights on build, so wait for the explicit "load"
    // gesture before doing so — even when the tier is auto-selected.
    if (selected.tier === 'webllm' && !webllmArmed) return
    let cancelled = false
    void resolveProvider(selected, settings, onBudget, setWebllmProgress, onAgentFrame)
      .then((provider) => {
        if (cancelled || !provider) return
        // Read-only tools, on tiers that can actually call them (0394 Phase 1),
        // plus the opted-in write cluster behind the approval ceremony (Phase
        // 2). The context pack still runs on every turn — tools let the
        // assistant go looking for what the pack didn't happen to retrieve.
        const readTools = readOnlyToolSpecs(surface, selected.toolCalling)
        const writeTools = writeToolSpecs(surface, selected.toolCalling, writesEnabled)
        const tools = [...readTools, ...writeTools]
        // Writes route through the ceremony: medium parks on the approval
        // code, high parks on the deliberate in-app approval; reads pass
        // straight through so the audit log records actions, not searches.
        const ceremony =
          writeTools.length && surface && store
            ? createChatCeremony({
                surface,
                store,
                operatorDID: operatorDID ?? 'did:unknown:operator',
                sessionKey: `panel-${Date.now().toString(36)}`,
                onPending: (pending) => setPendingApprovals((prev) => [...prev, pending]),
                onResolved: (actionId) =>
                  setPendingApprovals((prev) => prev.filter((p) => p.actionId !== actionId))
              })
            : null
        ceremonyRef.current = ceremony
        const promptParts = writeTools.length
          ? [AI_SYSTEM_PROMPT, AI_TOOLS_PROMPT_WRITABLE, AI_WRITE_TOOLS_PROMPT]
          : [AI_SYSTEM_PROMPT, ...(tools.length ? [AI_TOOLS_PROMPT] : [])]
        const runtime = createAiAgentRuntime({
          provider,
          systemPrompt: promptParts.join('\n\n'),
          ...(surface
            ? {
                contextProvider: async ({ content }) => {
                  const pack = await surface.createContextPack({ query: content, limit: 6 })
                  return formatContextMessages(pack)
                }
              }
            : {}),
          ...(tools.length && surface
            ? {
                tools,
                allowedTools: tools.map((tool) => tool.name),
                executeTool: ceremony
                  ? ceremony.executeTool
                  : (call: AIToolCall) => surface.callTool(call.name, call.arguments ?? {})
              }
            : {})
        })
        cleanupRef.current = runtime.subscribe((event) =>
          applyRuntimeEvent(event, threadIdRef.current, handlers)
        )
        return runtime.load().then(() => {
          if (cancelled) return
          runtimeRef.current = runtime
          setReady(true)
        })
      })
      .catch((err) => {
        // A provider that fails to construct or load (a WebLLM weight-download
        // error, a Nano session that won't open, a runtime load that throws)
        // used to be swallowed here, leaving the composer permanently disabled
        // with no explanation. Surface it instead.
        if (!cancelled) setError(errorMessage(err))
      })
    return () => {
      cancelled = true
      cleanupRef.current?.()
      cleanupRef.current = null
      // Resolve any parked approvals so a torn-down runtime never hangs a turn.
      ceremonyRef.current?.dispose()
      ceremonyRef.current = null
      setPendingApprovals([])
    }
  }, [
    selected,
    settings,
    handlers,
    surface,
    store,
    operatorDID,
    writesEnabled,
    onBudget,
    onAgentFrame,
    webllmArmed
  ])

  // True while we're waiting for the user to kick off an in-tab model's
  // download — the activation block (button) explains itself, so the generic
  // "preparing"/"unavailable" reason should defer to it.
  const nanoNeedsDownload = nanoState === 'downloadable' || nanoState === 'downloading'
  const awaitingInTabGesture =
    (selected?.tier === 'webllm' && selected.available && !webllmArmed && !ready) ||
    (selected?.tier === 'prompt-api' && nanoNeedsDownload)

  // The offline-bridge block explains itself (exact start command + recheck),
  // so the generic setupHint line must not double up under it.
  const bridgeOffline = selected?.tier === 'bridge' && !selected.available

  // Why the composer is disabled right now, so a not-ready box is never silent
  // (the old failure mode: a selected-but-unbuildable tier showed nothing).
  const notReadyReason =
    ready || error || awaitingInTabGesture || bridgeOffline
      ? null
      : !selected
        ? null // the empty-state ChatBody already invites picking a model
        : !selected.available
          ? (selected.setupHint ?? 'This model isn’t available in this browser.')
          : 'Preparing this model…'

  // Never tell the user to "select a model" once one is selected.
  const composerPlaceholder = ready
    ? 'Message…'
    : !selected
      ? 'Select a model above'
      : awaitingInTabGesture
        ? 'Load the model above'
        : selected.available
          ? 'Preparing model…'
          : 'Configure the model above'

  // Kick off the in-tab WebLLM download (the build effect proceeds once armed).
  const runWebllm = useCallback(() => setWebllmArmed(true), [])

  // Trigger the Gemini Nano on-device download from this click (Chrome gates the
  // download behind a user gesture), then re-detect so the tier flips available.
  const downloadNano = useCallback(async () => {
    setError(null)
    setNanoProgress(0)
    try {
      await downloadPromptApiModel((fraction) => setNanoProgress(fraction))
      setNanoProgress(null)
      setDetectNonce((nonce) => nonce + 1)
    } catch (err) {
      setNanoProgress(null)
      setError(errorMessage(err))
    }
  }, [])

  const send = useCallback(async () => {
    const content = input.trim()
    // A typed `APPROVE <code>` is a ceremony reply, not a message: it releases
    // the parked medium-risk action and never reaches the model. Checked
    // before the streaming gate — the turn is still running while it waits.
    if (content && ceremonyRef.current && (await ceremonyRef.current.tryApproveFromChat(content))) {
      setInput('')
      return
    }
    const rt = runtimeRef.current
    if (!canSendMessage(content, streaming, !!rt)) return
    const runtime = rt as AiAgentRuntime
    setError(null)
    setInput('')
    setMessages((prev) => [...prev, { role: 'user', content }, { role: 'assistant', content: '' }])
    setStreaming(true)
    // Fire-and-forget: the turn must never wait on (or fail with) persistence.
    if (dataBridge) {
      conversationLogRef.current ??= createAiConversationLog(dataBridge)
      const connectorLabel = bridgeHealth?.agent ?? selected?.tier ?? 'model'
      assistantBufferRef.current = ''
      void conversationLogRef.current.logUserMessage(content, connectorLabel)
    }
    try {
      threadIdRef.current ??= (await runtime.createThread({ title: 'AI chat' })).id
      await runtime.runTurn({ threadId: threadIdRef.current, content })
    } catch (err) {
      setStreaming(false)
      setError(errorMessage(err))
    }
  }, [input, streaming, dataBridge, bridgeHealth, selected])

  return (
    <div className="flex h-full min-h-0 flex-col bg-surface-1">
      <ConnectorBar
        detections={detections}
        selectedTier={selectedTier}
        onSelect={selectTier}
        hasSelection={!!selected}
        searchesWorkspace={!!surface && toolsEnabledFor(selected?.toolCalling)}
        editsWithApproval={
          !!surface &&
          writesEnabled &&
          writeToolSpecs(surface, selected?.toolCalling, true).length > 0
        }
      />
      {selected?.tier === 'bridge' &&
        (selected.available ? (
          <>
            <BridgeStatus
              health={bridgeHealth}
              canSwitch={!!bridgeControl}
              onSwitchAgent={switchBridgeAgent}
            />
            <BridgePairing
              token={bridgeToken}
              onToken={(value) => {
                setBridgeToken(value)
                writeSetting(AI_CHAT_STORAGE_KEYS.bridgeToken, value)
              }}
            />
            {bridgeCost && (
              <p className="border-b border-hairline px-3 py-1 text-[10px] text-ink-3">
                Last turn
                {bridgeCost.usd !== undefined ? ` · $${bridgeCost.usd.toFixed(4)}` : ''}
                {bridgeCost.outputTokens !== undefined
                  ? ` · ${bridgeCost.outputTokens} output tokens`
                  : ''}
              </p>
            )}
            {bridgePermission && (
              <p className="border-b border-hairline px-3 py-1.5 text-[11px] text-amber-600">
                The agent is asking to use <code>{bridgePermission}</code>. This chat has no channel
                to approve it — decide in the agent&apos;s own session.
              </p>
            )}
          </>
        ) : (
          <BridgeOffline onRecheck={() => setDetectNonce((nonce) => nonce + 1)} />
        ))}
      {(selected?.tier === 'bridge' || selected?.tier === 'local-server') &&
        loopbackPermission === 'denied' && (
          <p className="border-b border-hairline px-3 py-2 text-[11px] text-amber-600">
            Local network access is blocked. Allow it for this site in your browser’s settings to
            reach a model on this machine.
          </p>
        )}
      {selected?.tier === 'cloud-key' && (
        <CloudKeyFields
          apiKey={apiKey}
          cloudProvider={cloudProvider}
          onApiKey={(value) => {
            setApiKey(value)
            writeSetting(AI_CHAT_STORAGE_KEYS.apiKey, value)
          }}
          onProvider={(value) => {
            setCloudProvider(value)
            writeSetting(AI_CHAT_STORAGE_KEYS.cloudProvider, value)
          }}
          onConnectOpenRouter={() => void connectOpenRouter()}
        />
      )}
      {selected?.tier === 'managed' && selected.available && (
        <ManagedControls
          model={model}
          models={managedModels}
          budget={budget}
          onModel={(value) => {
            setModel(value)
            writeSetting(AI_CHAT_STORAGE_KEYS.model, value)
            setBudget(null)
          }}
        />
      )}
      {selected?.tier === 'webllm' && selected.available && !ready && (
        <WebLLMActivation armed={webllmArmed} progress={webllmProgress} onRun={runWebllm} />
      )}
      {selected?.tier === 'prompt-api' && nanoNeedsDownload && (
        <NanoDownload progress={nanoProgress} onDownload={() => void downloadNano()} />
      )}
      {notReadyReason && (
        <p className="border-b border-hairline px-3 py-2 text-[11px] text-ink-3">
          {notReadyReason}
        </p>
      )}

      <ChatBody messages={messages} streaming={streaming} />
      {pendingApprovals.map((pending) => (
        <ApprovalCard
          key={pending.actionId}
          pending={pending}
          operatorDID={operatorDID}
          onApprove={() => {
            const ceremony = ceremonyRef.current
            if (!ceremony) return
            if (pending.surface === 'chat' && pending.code) {
              void ceremony.tryApproveFromChat(`APPROVE ${pending.code}`)
            } else {
              void ceremony.approveFromApp(pending.actionId)
            }
          }}
          onDeny={() => void ceremonyRef.current?.deny(pending.actionId)}
        />
      ))}
      {activity && <ToolActivityLine activity={activity} />}
      {error && <p className="px-3 py-1 text-[11px] text-rose-500">{error}</p>}
      <WritesToggle enabled={writesEnabled} onToggle={toggleWrites} />
      <SemanticSearchToggle enabled={semanticSearch} onToggle={toggleSemanticSearch} />
      <ChatComposer
        value={input}
        ready={ready}
        streaming={streaming}
        placeholder={composerPlaceholder}
        onChange={setInput}
        onSend={() => void send()}
      />
    </div>
  )
}

function SemanticSearchToggle({
  enabled,
  onToggle
}: {
  enabled: boolean
  onToggle: (next: boolean) => void
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 border-t border-hairline px-3 py-1.5 text-[11px] text-ink-3">
      <input
        type="checkbox"
        checked={enabled}
        onChange={(event) => onToggle(event.target.checked)}
        className="h-3 w-3 accent-current"
      />
      <span>
        Semantic search <span className="text-ink-4">(beta)</span> — find context by meaning, on
        device
      </span>
    </label>
  )
}

/** A thin determinate progress bar (0–1) for in-tab model downloads. */
function DownloadBar({ fraction, label }: { fraction: number; label: string }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
        <div
          className="h-full bg-emerald-500"
          style={{ width: `${Math.round(Math.min(1, Math.max(0, fraction)) * 100)}%` }}
          aria-hidden
        />
      </div>
      <p className="truncate text-[10px] text-ink-3">{label}</p>
    </div>
  )
}

/**
 * In-tab WebLLM activation: a "run" gesture that arms the heavy first-run model
 * download (so picking the tier doesn't surprise-download), then a progress bar
 * while it loads. Cached afterwards; nothing leaves the device.
 */
function WebLLMActivation({
  armed,
  progress,
  onRun
}: {
  armed: boolean
  progress: WebLLMProgress | null
  onRun: () => void
}) {
  return (
    <div className="flex flex-col gap-1.5 border-b border-hairline px-3 py-2">
      {armed ? (
        <DownloadBar
          fraction={progress?.fraction ?? 0}
          label={progress?.text ?? 'Loading model…'}
        />
      ) : (
        <>
          <button
            type="button"
            onClick={onRun}
            className="self-start rounded-md border border-hairline bg-surface-0 px-2 py-1 text-[11px] text-ink-1 hover:border-border-emphasis"
          >
            Run the in-browser model
          </button>
          <p className="text-[10px] text-ink-3">
            Downloads a small model to this browser on first run (cached afterwards). Runs entirely
            on your device — nothing leaves it.
          </p>
        </>
      )}
    </div>
  )
}

/**
 * Gemini Nano download gesture: when the on-device model is `downloadable` /
 * `downloading`, offer a button that triggers the Chrome download from a user
 * gesture (required) and shows progress; detection re-runs once it completes.
 */
function NanoDownload({
  progress,
  onDownload
}: {
  progress: number | null
  onDownload: () => void
}) {
  return (
    <div className="flex flex-col gap-1.5 border-b border-hairline px-3 py-2">
      {progress !== null ? (
        <DownloadBar fraction={progress} label="Downloading Gemini Nano…" />
      ) : (
        <>
          <button
            type="button"
            onClick={onDownload}
            className="self-start rounded-md border border-hairline bg-surface-0 px-2 py-1 text-[11px] text-ink-1 hover:border-border-emphasis"
          >
            Download Gemini Nano
          </button>
          <p className="text-[10px] text-ink-3">
            Chrome downloads the on-device model once, then it runs locally — no key, no server.
          </p>
        </>
      )}
    </div>
  )
}

function ChatBody({ messages, streaming }: { messages: ChatMessage[]; streaming: boolean }) {
  if (messages.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 px-3 text-center text-ink-3">
        <Bot size={22} strokeWidth={1.5} />
        <p className="text-xs">Ask about your workspace, using your own model or API key.</p>
        <p className="text-[11px]">
          The assistant reads your pages and data for context; your model runs locally or on your
          own key — never on our servers.
        </p>
      </div>
    )
  }
  const placeholder = streaming ? 'Thinking…' : ''
  return (
    <ul className="scroll-fade flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-3 py-2">
      {messages.map((message, index) => (
        <ChatMessageItem key={index} message={message} placeholder={placeholder} />
      ))}
    </ul>
  )
}

function ChatMessageItem({ message, placeholder }: { message: ChatMessage; placeholder: string }) {
  const isUser = message.role === 'user'
  return (
    <li className={isUser ? 'text-right' : ''}>
      <div className="text-[10px] font-medium uppercase tracking-wider text-ink-3">
        {isUser ? 'You' : 'Assistant'}
      </div>
      <p className="whitespace-pre-wrap break-words text-xs text-ink-1">
        {message.content || placeholder}
      </p>
    </li>
  )
}

function ChatComposer({
  value,
  ready,
  streaming,
  placeholder,
  onChange,
  onSend
}: {
  value: string
  ready: boolean
  streaming: boolean
  placeholder: string
  onChange: (value: string) => void
  onSend: () => void
}) {
  return (
    <div className="flex items-end gap-2 border-t border-hairline p-2">
      <textarea
        value={value}
        rows={2}
        placeholder={placeholder}
        disabled={!ready}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault()
            onSend()
          }
        }}
        className="min-h-0 flex-1 resize-none rounded-md border border-hairline bg-surface-0 px-2 py-1.5 text-xs text-ink-1 outline-none placeholder:text-ink-3 focus:border-border-emphasis disabled:opacity-50"
      />
      <button
        type="button"
        onClick={onSend}
        disabled={!value.trim() || streaming || !ready}
        aria-label="Send"
        className="flex h-7 w-7 items-center justify-center rounded-md border border-hairline bg-surface-0 text-ink-2 hover:text-ink-1 disabled:cursor-default disabled:opacity-50"
      >
        {streaming ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
      </button>
    </div>
  )
}

function BridgeStatus({
  health,
  canSwitch,
  onSwitchAgent
}: {
  health: BridgeHealth | null
  canSwitch: boolean
  onSwitchAgent: (agent: string) => void
}) {
  const running = health?.ok ?? false
  const agent = health?.agent
  const knownAgent = agent && KNOWN_BRIDGE_AGENTS.some((option) => option.id === agent) ? agent : ''
  return (
    <div className="flex items-center gap-2 border-b border-hairline px-3 py-2 text-[11px]">
      <span
        aria-hidden
        className={`h-2 w-2 shrink-0 rounded-full ${running ? 'bg-emerald-500' : 'bg-ink-3'}`}
      />
      <span className="text-ink-2">
        {running
          ? `Running ${agent ?? 'agent'}${health?.version ? ` · v${health.version}` : ''}`
          : 'Bridge detected'}
      </span>
      {canSwitch && (
        <select
          aria-label="Bridge agent"
          value={knownAgent}
          onChange={(event) => onSwitchAgent(event.target.value)}
          className="ml-auto rounded-md border border-hairline bg-surface-0 px-2 py-0.5 text-[11px] text-ink-1 outline-none"
        >
          {!knownAgent && <option value="">Choose agent…</option>}
          {KNOWN_BRIDGE_AGENTS.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
      )}
    </div>
  )
}

/**
 * The pairing code the bridge daemon requires. Under Electron it's auto-filled
 * over IPC (the field then just confirms it); in a plain browser the user pastes
 * the code `xnet bridge serve` prints. Stored locally, sent only to the loopback
 * daemon as a bearer token — never to our servers.
 */
function BridgePairing({ token, onToken }: { token: string; onToken: (value: string) => void }) {
  return (
    <div className="flex flex-col gap-1 border-b border-hairline px-3 py-2">
      <input
        type="password"
        value={token}
        placeholder="Bridge pairing code"
        onChange={(event) => onToken(event.target.value)}
        className="min-w-0 flex-1 rounded-md border border-hairline bg-surface-0 px-2 py-1 text-[11px] text-ink-1 outline-none placeholder:text-ink-3"
      />
      <p className="text-[10px] text-ink-3">
        Paste the code <code>xnet bridge serve</code> prints. Sent only to your local bridge — never
        to our servers.
      </p>
    </div>
  )
}

/**
 * The bridge tier is selected but no daemon answered at :31416 — show the ONE
 * command that fixes it (with this page's origin pre-filled), a login-item
 * hint, the heads-up about Chrome's local-network permission prompt, and a
 * recheck affordance (exploration 0391: an offline bridge must never be a
 * dead end).
 */
function BridgeOffline({ onRecheck }: { onRecheck: () => void }) {
  const [copied, setCopied] = useState(false)
  const origin = typeof location !== 'undefined' ? location.origin : ''
  const loopback = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|$)/.test(origin)
  // Loopback origins are always allowed by the daemon; a deployed origin must
  // be allowlisted explicitly.
  const command = loopback ? 'xnet bridge serve' : `xnet bridge serve --allow-origin ${origin}`
  const copy = () => {
    void navigator.clipboard?.writeText(command).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }
  return (
    <div className="flex flex-col gap-1.5 border-b border-hairline px-3 py-2">
      <div className="flex items-center gap-2 text-[11px]">
        <span aria-hidden className="h-2 w-2 shrink-0 rounded-full bg-ink-3" />
        <span className="text-ink-2">Bridge offline — start it in a terminal:</span>
        <button
          type="button"
          onClick={onRecheck}
          className="ml-auto rounded-md border border-hairline bg-surface-0 px-2 py-0.5 text-[11px] text-ink-1 hover:bg-surface-2"
        >
          Check again
        </button>
      </div>
      <div className="flex items-center gap-1.5">
        <code className="min-w-0 flex-1 truncate rounded-md border border-hairline bg-surface-0 px-2 py-1 text-[11px] text-ink-1">
          {command}
        </code>
        <button
          type="button"
          onClick={copy}
          className="shrink-0 rounded-md border border-hairline bg-surface-0 px-2 py-1 text-[11px] text-ink-1 hover:bg-surface-2"
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <p className="text-[10px] text-ink-3">
        Uses your own Claude Code / Codex subscription — nothing leaves this machine. Start it at
        login with <code>xnet bridge install</code>. Your browser may ask to allow local network
        access on first connect; allow it. Safari blocks local connections from https pages — use
        Chrome or the desktop app.
      </p>
    </div>
  )
}

function ConnectorBar({
  detections,
  selectedTier,
  onSelect,
  hasSelection,
  searchesWorkspace,
  editsWithApproval
}: {
  detections: ConnectorDetection[]
  selectedTier: ConnectorTier | null
  onSelect: (tier: ConnectorTier) => void
  hasSelection: boolean
  searchesWorkspace: boolean
  editsWithApproval: boolean
}) {
  return (
    <div className="flex items-center gap-2 border-b border-hairline px-3 py-2">
      <select
        value={selectedTier ?? ''}
        onChange={(event) => onSelect(event.target.value as ConnectorTier)}
        className="min-w-0 flex-1 rounded-md border border-hairline bg-surface-0 px-2 py-1 text-[11px] text-ink-1 outline-none"
      >
        {detections.length === 0 && <option value="">Detecting models…</option>}
        {detections.map((detection) => (
          <option key={detection.tier} value={detection.tier}>
            {detection.available ? detection.label : `${detection.label} — unavailable`}
          </option>
        ))}
      </select>
      {hasSelection && <CapabilityBadge searches={searchesWorkspace} edits={editsWithApproval} />}
    </div>
  )
}

// The badge never claims more than is true (0394): weak tiers read injected
// context, reliable tiers search on their own, and only an opted-in reliable
// tier may edit — with every edit parked on the operator's approval.
function CapabilityBadge({ searches, edits }: { searches: boolean; edits: boolean }) {
  const label = edits ? 'edits with approval' : searches ? 'searches workspace' : 'reads workspace'
  const title = edits
    ? 'This assistant can search your workspace and propose edits. Every edit pauses for your approval in this chat — nothing is applied without you.'
    : searches
      ? 'This assistant can search and read your workspace itself. It cannot make changes.'
      : 'This assistant is given workspace context to read. It cannot search on its own, or make changes.'
  return (
    <span
      title={title}
      className="shrink-0 rounded-full border border-hairline px-2 py-0.5 text-[10px] uppercase tracking-wider text-ink-3"
    >
      {label}
    </span>
  )
}

/** What the assistant is doing right now, in the user's words not the tool's. */
const TOOL_LABELS: Record<string, string> = {
  xnet_search: 'Searching your workspace',
  xnet_graph_expand: 'Following links between your notes',
  xnet_read_page_markdown: 'Reading a page',
  xnet_database_describe: 'Looking at a database',
  xnet_database_query: 'Querying a database',
  xnet_database_sample: 'Sampling a database',
  xnet_canvas_list: 'Listing your canvases',
  xnet_canvas_read_viewport: 'Reading a canvas',
  xnet_canvas_search: 'Searching a canvas',
  xnet_get_audit_log: 'Checking the audit log',
  xnet_validate_page_markdown: 'Checking a page edit',
  xnet_plan_page_patch: 'Planning a page edit',
  xnet_apply_page_markdown: 'Editing a page',
  xnet_compose_page: 'Creating a page'
}

/**
 * A parked write waiting on the operator (0394 Phase 2). Medium risk shows
 * the approval code (the reply `APPROVE <code>` — or the button, which
 * submits the same code through the same nonce machinery). High risk refuses
 * the chat path: approval is the deliberate in-app kind, stamped with the
 * operator's DID, and the button stays disabled until the change has been
 * reviewed — seeing what you release is the point, not a speed bump.
 */
function ApprovalCard({
  pending,
  operatorDID,
  onApprove,
  onDeny
}: {
  pending: CeremonyPending
  operatorDID: string | null
  onApprove: () => void
  onDeny: () => void
}) {
  const [reviewed, setReviewed] = useState(false)
  const needsReview = pending.surface === 'app'
  const canApprove = !needsReview || reviewed
  const riskTone =
    pending.surface === 'app'
      ? 'border-rose-400/60 bg-rose-500/5'
      : 'border-amber-400/60 bg-amber-500/5'
  return (
    <div
      className={`mx-3 my-1.5 rounded-lg border p-2.5 text-[12px] ${riskTone}`}
      data-approval-card={pending.surface}
    >
      <div className="flex items-center gap-2">
        <span className="rounded-full border border-hairline px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-ink-3">
          {pending.risk} risk
        </span>
        <span className="font-medium text-ink-1">{TOOL_LABELS[pending.tool] ?? pending.tool}</span>
      </div>
      <p className="mt-1 text-ink-2">
        {pending.surface === 'chat' && pending.code ? (
          <>
            Reply <code className="rounded bg-surface-2 px-1">APPROVE {pending.code}</code> to run
            this, or use the buttons.
          </>
        ) : (
          <>
            This is a {pending.risk}-risk change and needs your explicit in-app approval
            {operatorDID ? ` as ${operatorDID.slice(0, 24)}…` : ''}.
          </>
        )}
      </p>
      {needsReview ? (
        <details
          className="mt-1.5"
          onToggle={(event) => {
            if ((event.target as HTMLDetailsElement).open) setReviewed(true)
          }}
        >
          <summary className="cursor-pointer text-[11px] text-ink-3">
            Review the change before approving
          </summary>
          <pre className="mt-1 max-h-48 overflow-auto rounded bg-surface-2 p-2 text-[10px] leading-relaxed text-ink-2">
            {JSON.stringify(pending.args, null, 2)}
          </pre>
        </details>
      ) : (
        <pre className="mt-1.5 max-h-32 overflow-auto rounded bg-surface-2 p-2 text-[10px] leading-relaxed text-ink-3">
          {JSON.stringify(pending.args, null, 2)}
        </pre>
      )}
      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          disabled={!canApprove}
          onClick={onApprove}
          title={canApprove ? undefined : 'Open the review above first'}
          className={`rounded-md border px-2.5 py-1 text-[11px] font-medium transition-colors ${
            canApprove
              ? 'cursor-pointer border-hairline bg-surface-0 text-ink-1 hover:bg-surface-2'
              : 'cursor-not-allowed border-hairline bg-surface-2 text-ink-3'
          }`}
        >
          {pending.surface === 'app' ? 'Approve in app' : 'Approve'}
        </button>
        <button
          type="button"
          onClick={onDeny}
          className="cursor-pointer rounded-md border border-hairline bg-surface-0 px-2.5 py-1 text-[11px] text-ink-2 hover:bg-surface-2"
        >
          Deny
        </button>
        <span className="ml-auto text-[10px] text-ink-3">
          expires {new Date(pending.expiresAt).toLocaleTimeString()}
        </span>
      </div>
    </div>
  )
}

function WritesToggle({
  enabled,
  onToggle
}: {
  enabled: boolean
  onToggle: (next: boolean) => void
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 border-t border-hairline px-3 py-1.5 text-[11px] text-ink-3">
      <input
        type="checkbox"
        checked={enabled}
        onChange={(event) => onToggle(event.target.checked)}
        className="cursor-pointer"
      />
      <span>
        Allow edits (with approval) — the assistant may create and edit pages. Risky changes pause
        for your approval, and every action is audited.
      </span>
    </label>
  )
}

function ToolActivityLine({ activity }: { activity: ChatToolActivity }) {
  const label = TOOL_LABELS[activity.tool] ?? activity.tool
  if (activity.denied) {
    return (
      <p className="flex items-center gap-1.5 px-3 py-1 text-[11px] text-ink-3">
        Blocked: {label.toLowerCase()} is not allowed here.
      </p>
    )
  }
  return (
    <p className="flex items-center gap-1.5 px-3 py-1 text-[11px] text-ink-3">
      {activity.kind === 'call' && <Loader2 size={11} className="animate-spin" />}
      {activity.kind === 'call' ? `${label}…` : `${label} — done`}
    </p>
  )
}

function CloudKeyFields({
  apiKey,
  cloudProvider,
  onApiKey,
  onProvider,
  onConnectOpenRouter
}: {
  apiKey: string
  cloudProvider: CloudProvider
  onApiKey: (value: string) => void
  onProvider: (value: CloudProvider) => void
  onConnectOpenRouter?: () => void
}) {
  return (
    <div className="flex flex-col gap-1 border-b border-hairline px-3 py-2">
      <div className="flex gap-2">
        <select
          value={cloudProvider}
          onChange={(event) => onProvider(event.target.value as CloudProvider)}
          className="rounded-md border border-hairline bg-surface-0 px-2 py-1 text-[11px] text-ink-1 outline-none"
        >
          <option value="anthropic">Anthropic</option>
          <option value="openai">OpenAI</option>
          <option value="openrouter">OpenRouter</option>
        </select>
        <input
          type="password"
          value={apiKey}
          placeholder="API key"
          onChange={(event) => onApiKey(event.target.value)}
          className="min-w-0 flex-1 rounded-md border border-hairline bg-surface-0 px-2 py-1 text-[11px] text-ink-1 outline-none placeholder:text-ink-3"
        />
      </div>
      {cloudProvider === 'openrouter' && !apiKey && onConnectOpenRouter && (
        <button
          type="button"
          onClick={onConnectOpenRouter}
          className="self-start rounded-md border border-hairline bg-surface-0 px-2 py-1 text-[11px] text-ink-1 hover:bg-surface-2"
        >
          Connect OpenRouter account…
        </button>
      )}
      <p className="text-[10px] text-ink-3">
        Stored in this browser and sent only to {cloudProvider} — never to our servers.
        {cloudProvider === 'openrouter' &&
          ' Connecting issues a key scoped to your own OpenRouter account and balance.'}
      </p>
    </div>
  )
}

function ManagedControls({
  model,
  models,
  budget,
  onModel
}: {
  model: string
  models: ManagedModel[]
  budget: ManagedBudgetSnapshot | null
  onModel: (value: string) => void
}) {
  const groups = groupModelsByFamily(models)
  return (
    <div className="flex flex-col gap-1.5 border-b border-hairline px-3 py-2">
      {groups.length > 0 ? (
        <select
          value={model}
          aria-label="Managed AI model"
          onChange={(event) => onModel(event.target.value)}
          className="min-w-0 rounded-md border border-hairline bg-surface-0 px-2 py-1 text-[11px] text-ink-1 outline-none"
        >
          {!model && <option value="">Choose a model…</option>}
          {groups.map(([family, familyModels]) => (
            <optgroup key={family} label={family}>
              {familyModels.map((m) => (
                <option key={m.id} value={m.id}>
                  {formatModelOption(m)}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      ) : (
        // No catalog (e.g. an 'all' plan on a non-OpenRouter gateway) → free text.
        <input
          value={model}
          placeholder="Model (e.g. anthropic/claude-sonnet-4.6 · blank = auto)"
          aria-label="Managed AI model"
          onChange={(event) => onModel(event.target.value)}
          className="min-w-0 rounded-md border border-hairline bg-surface-0 px-2 py-1 text-[11px] text-ink-1 outline-none placeholder:text-ink-3"
        />
      )}
      {budget ? (
        <BudgetGauge budget={budget} />
      ) : (
        <p className="text-[10px] text-ink-3">
          Metered AI on your plan — no key needed. You’re billed only for what you use, up to your
          monthly cap.
        </p>
      )}
    </div>
  )
}

/** The "used / included / cap" gauge a managed call reports back. */
function BudgetGauge({ budget }: { budget: ManagedBudgetSnapshot }) {
  const pct =
    budget.budgetUsd > 0 ? Math.min(100, (budget.spendThisPeriodUsd / budget.budgetUsd) * 100) : 0
  const tone =
    budget.budgetState === 'over-cap' || budget.budgetState === 'near-cap'
      ? 'bg-amber-500'
      : budget.budgetState === 'overage'
        ? 'bg-sky-500'
        : 'bg-emerald-500'
  return (
    <div className="flex flex-col gap-1">
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
        <div className={`h-full ${tone}`} style={{ width: `${pct}%` }} aria-hidden />
      </div>
      <p className="text-[10px] text-ink-3">
        ${budget.spendThisPeriodUsd.toFixed(2)} used
        {budget.includedUsd > 0 ? ` · $${budget.includedUsd.toFixed(2)} included` : ''} · $
        {budget.budgetUsd.toFixed(2)} cap
      </p>
    </div>
  )
}

function appendToAssistant(messages: ChatMessage[], text: string): ChatMessage[] {
  const last = messages[messages.length - 1]
  if (last?.role !== 'assistant') return [...messages, { role: 'assistant', content: text }]
  return [...messages.slice(0, -1), { ...last, content: last.content + text }]
}

async function resolveProvider(
  detection: ConnectorDetection,
  settings: AiChatSettings,
  onBudget: (snapshot: ManagedBudgetSnapshot) => void,
  onWebllmProgress: (progress: WebLLMProgress | null) => void,
  onAgentFrame?: (frame: BridgeAgentFrame) => void
): Promise<AIProvider | null> {
  // The bridge speaks the framed endpoint (0392/0394): same transport, but
  // tool calls, cost, and permission asks arrive structured instead of
  // flattened into text. Other tiers keep their existing providers.
  if (detection.tier === 'bridge') {
    const baseUrl = baseUrlFromDetail(detection.detail)
    if (!baseUrl || !settings.bridgeToken) return null
    return createFramedBridgeProvider({
      baseUrl,
      token: settings.bridgeToken,
      ...(onAgentFrame ? { onFrame: onAgentFrame } : {})
    })
  }
  // In-tab WebLLM: build a real @mlc-ai/web-llm engine, downloading the model on
  // first run with a progress callback. Clear the gauge once it settles (success
  // or — after the caller's .catch — failure).
  if (detection.tier === 'webllm') {
    return buildWebLLMProvider({ onProgress: onWebllmProgress }).finally(() =>
      onWebllmProgress(null)
    )
  }
  if (detection.tier === 'prompt-api') return createPromptApiProvider()
  // Managed is built directly (like prompt-api) so we can attach the budget
  // callback the pure config mapper can't carry.
  if (detection.tier === 'managed') {
    return createManagedProvider({
      baseUrl: settings.hubBaseUrl ?? '',
      ...(settings.model ? { model: settings.model } : {}),
      onBudget
    })
  }
  const config = providerConfigForConnector(detection, settings)
  return config ? createAIProvider(config) : null
}
