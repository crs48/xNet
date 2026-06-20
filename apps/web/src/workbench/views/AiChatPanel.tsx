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
  type AiAgentRuntime,
  type AiSurfaceService,
  type AIProvider,
  type ConnectorDetection,
  type ConnectorTier,
  type ManagedBudgetSnapshot
} from '@xnetjs/plugins'
import { useNodeStore } from '@xnetjs/react/internal'
import { Bot, Loader2, Send } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AI_CHAT_STORAGE_KEYS,
  applyRuntimeEvent,
  baseUrlFromDetail,
  canSendMessage,
  errorMessage,
  KNOWN_BRIDGE_AGENTS,
  parseBridgeHealth,
  pickUsableConnector,
  providerConfigForConnector,
  type AiChatSettings,
  type BridgeHealth,
  type CloudProvider
} from './ai-chat-connector'
import { AI_SYSTEM_PROMPT, formatContextMessages } from './ai-context'
import { schemaRegistryApi } from './ai-schemas'

/** Electron preload control channel for the local agent bridge (absent on web). */
interface AgentBridgeControl {
  start: (agent?: string) => Promise<unknown>
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

export function AiChatPanel() {
  const [detections, setDetections] = useState<ConnectorDetection[]>([])
  const [selectedTier, setSelectedTier] = useState<ConnectorTier | null>(
    () => (readSetting(AI_CHAT_STORAGE_KEYS.tier) as ConnectorTier) || null
  )
  const [apiKey, setApiKey] = useState(() => readSetting(AI_CHAT_STORAGE_KEYS.apiKey))
  const [cloudProvider, setCloudProvider] = useState<CloudProvider>(
    () => (readSetting(AI_CHAT_STORAGE_KEYS.cloudProvider) as CloudProvider) || 'anthropic'
  )
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  const [bridgeHealth, setBridgeHealth] = useState<BridgeHealth | null>(null)
  const [bridgeRefresh, setBridgeRefresh] = useState(0)
  const [model, setModel] = useState(() => readSetting(AI_CHAT_STORAGE_KEYS.model))
  const [budget, setBudget] = useState<ManagedBudgetSnapshot | null>(null)

  const runtimeRef = useRef<AiAgentRuntime | null>(null)
  const threadIdRef = useRef<string | null>(null)
  const cleanupRef = useRef<(() => void) | null>(null)

  const settings = useMemo<AiChatSettings>(
    () => ({ apiKey: apiKey || undefined, cloudProvider, model: model || undefined }),
    [apiKey, cloudProvider, model]
  )

  // Reset the budget gauge whenever the active model changes — the next managed
  // call repopulates it from the response.
  const onBudget = useCallback((snapshot: ManagedBudgetSnapshot) => setBudget(snapshot), [])

  // Read-only workspace grounding: the local NodeStore + schema registry already
  // satisfy the AiSurfaceService contract, so the assistant can search the
  // user's own pages/databases/nodes for context (exploration 0192, Phase 1).
  const { store } = useNodeStore()
  const surface = useMemo<AiSurfaceService | null>(
    () => (store ? createAiSurfaceService({ store, schemas: schemaRegistryApi() }) : null),
    [store]
  )

  const handlers = useMemo(
    () => ({
      onDelta: (text: string) => setMessages((prev) => appendToAssistant(prev, text)),
      onSettled: () => setStreaming(false),
      onError: (message: string) => setError(message)
    }),
    []
  )

  // Persist the selected tier so the choice survives a reload.
  const selectTier = useCallback((tier: ConnectorTier) => {
    setSelectedTier(tier)
    writeSetting(AI_CHAT_STORAGE_KEYS.tier, tier)
  }, [])

  // Detect connectors (re-runs when the key changes so cloud-key flips available).
  // Auto-select only a tier we can actually instantiate (never the webllm trap);
  // a previously chosen tier is kept as-is.
  useEffect(() => {
    let cancelled = false
    void detectConnectors({ hasCloudKey: () => apiKey.length > 0 }).then((result) => {
      if (cancelled) return
      setDetections(result)
      setSelectedTier((current) => current ?? pickUsableConnector(result)?.tier ?? null)
    })
    return () => {
      cancelled = true
    }
  }, [apiKey])

  const selected = detections.find((d) => d.tier === selectedTier) ?? null

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

  // Switch the running agent — only possible where a control channel exists
  // (the Electron preload bridge); the web daemon is launched with a fixed agent.
  const switchBridgeAgent = useCallback(async (agent: string) => {
    if (typeof window === 'undefined' || !window.xnetAgentBridge || !agent) return
    await window.xnetAgentBridge.start(agent)
    setBridgeRefresh((count) => count + 1)
  }, [])

  // (Re)build the runtime when the active connector/settings change.
  useEffect(() => {
    runtimeRef.current = null
    threadIdRef.current = null
    setReady(false)
    if (!selected?.available) return
    let cancelled = false
    void resolveProvider(selected, settings, onBudget).then((provider) => {
      if (cancelled || !provider) return
      const runtime = createAiAgentRuntime({
        provider,
        systemPrompt: AI_SYSTEM_PROMPT,
        ...(surface
          ? {
              contextProvider: async ({ content }) => {
                const pack = await surface.createContextPack({ query: content, limit: 6 })
                return formatContextMessages(pack)
              }
            }
          : {})
      })
      void runtime.load().then(() => {
        if (cancelled) return
        runtimeRef.current = runtime
        setReady(true)
      })
      cleanupRef.current = runtime.subscribe((event) =>
        applyRuntimeEvent(event, threadIdRef.current, handlers)
      )
    })
    return () => {
      cancelled = true
      cleanupRef.current?.()
      cleanupRef.current = null
    }
  }, [selected, settings, handlers, surface, onBudget])

  const send = useCallback(async () => {
    const content = input.trim()
    const rt = runtimeRef.current
    if (!canSendMessage(content, streaming, !!rt)) return
    const runtime = rt as AiAgentRuntime
    setError(null)
    setInput('')
    setMessages((prev) => [...prev, { role: 'user', content }, { role: 'assistant', content: '' }])
    setStreaming(true)
    try {
      threadIdRef.current ??= (await runtime.createThread({ title: 'AI chat' })).id
      await runtime.runTurn({ threadId: threadIdRef.current, content })
    } catch (err) {
      setStreaming(false)
      setError(errorMessage(err))
    }
  }, [input, streaming])

  return (
    <div className="flex h-full min-h-0 flex-col bg-surface-1">
      <ConnectorBar
        detections={detections}
        selectedTier={selectedTier}
        onSelect={selectTier}
        hasSelection={!!selected}
      />
      {selected?.tier === 'bridge' && (
        <BridgeStatus
          health={bridgeHealth}
          canSwitch={typeof window !== 'undefined' && !!window.xnetAgentBridge}
          onSwitchAgent={switchBridgeAgent}
        />
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
        />
      )}
      {selected?.tier === 'managed' && selected.available && (
        <ManagedControls
          model={model}
          budget={budget}
          onModel={(value) => {
            setModel(value)
            writeSetting(AI_CHAT_STORAGE_KEYS.model, value)
            setBudget(null)
          }}
        />
      )}
      {selected && !selected.available && (
        <p className="border-b border-hairline px-3 py-2 text-[11px] text-ink-3">
          {selected.setupHint}
        </p>
      )}

      <ChatBody messages={messages} streaming={streaming} />
      {error && <p className="px-3 py-1 text-[11px] text-rose-500">{error}</p>}
      <ChatComposer
        value={input}
        ready={ready}
        streaming={streaming}
        onChange={setInput}
        onSend={() => void send()}
      />
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
  const placeholder = streaming ? '…' : ''
  return (
    <ul className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-3 py-2">
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
  onChange,
  onSend
}: {
  value: string
  ready: boolean
  streaming: boolean
  onChange: (value: string) => void
  onSend: () => void
}) {
  return (
    <div className="flex items-end gap-2 border-t border-hairline p-2">
      <textarea
        value={value}
        rows={2}
        placeholder={ready ? 'Message…' : 'Select and configure a model above'}
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

function ConnectorBar({
  detections,
  selectedTier,
  onSelect,
  hasSelection
}: {
  detections: ConnectorDetection[]
  selectedTier: ConnectorTier | null
  onSelect: (tier: ConnectorTier) => void
  hasSelection: boolean
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
      {hasSelection && <CapabilityBadge />}
    </div>
  )
}

// Phase 0: the in-app chat is reply-only on every tier because the workspace
// tool surface (AiSurfaceService) is not yet wired into the runtime. Until then
// we don't advertise "agentic" — that would over-promise. Reintroduce a
// tool-calling badge once tools are passed to the runtime (Phase 1).
function CapabilityBadge() {
  return (
    <span
      title="This assistant can read your workspace for context. Making changes is coming soon."
      className="shrink-0 rounded-full border border-hairline px-2 py-0.5 text-[10px] uppercase tracking-wider text-ink-3"
    >
      reads workspace
    </span>
  )
}

function CloudKeyFields({
  apiKey,
  cloudProvider,
  onApiKey,
  onProvider
}: {
  apiKey: string
  cloudProvider: CloudProvider
  onApiKey: (value: string) => void
  onProvider: (value: CloudProvider) => void
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
      <p className="text-[10px] text-ink-3">
        Stored in this browser and sent only to {cloudProvider} — never to our servers.
      </p>
    </div>
  )
}

function ManagedControls({
  model,
  budget,
  onModel
}: {
  model: string
  budget: ManagedBudgetSnapshot | null
  onModel: (value: string) => void
}) {
  return (
    <div className="flex flex-col gap-1.5 border-b border-hairline px-3 py-2">
      <input
        value={model}
        placeholder="Model (e.g. anthropic/claude-sonnet-4-6 · blank = auto)"
        aria-label="Managed AI model"
        onChange={(event) => onModel(event.target.value)}
        className="min-w-0 rounded-md border border-hairline bg-surface-0 px-2 py-1 text-[11px] text-ink-1 outline-none placeholder:text-ink-3"
      />
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
  const pct = budget.budgetUsd > 0 ? Math.min(100, (budget.spendThisPeriodUsd / budget.budgetUsd) * 100) : 0
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
  onBudget: (snapshot: ManagedBudgetSnapshot) => void
): Promise<AIProvider | null> {
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
