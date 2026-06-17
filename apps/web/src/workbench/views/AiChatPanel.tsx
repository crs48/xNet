/**
 * AI Chat panel (exploration 0174).
 *
 * A Bring-Your-Own-Model chat surface: detects the available model connectors,
 * lets the user pick/configure one (cloud key, local Ollama/LM Studio, bridge,
 * or in-tab Gemini Nano), and streams an assistant reply through the shared
 * AiAgentRuntime. The header shows the active tier's write mode — `agentic`
 * when the model can reliably call tools, else `propose-only` — surfacing the
 * 0174 decision rule to the user.
 *
 * Event handling, send-eligibility, and connector→provider mapping live in
 * `ai-chat-connector.ts` (pure + tested); this file is mostly composition.
 * Live tool execution (the agent calling xnet_* against the workspace) reuses
 * the same runtime + MCP tool surface and is the next integration step.
 */

import {
  createAIProvider,
  createAiAgentRuntime,
  createPromptApiProvider,
  detectConnectors,
  type AiAgentRuntime,
  type AIProvider,
  type ConnectorDetection,
  type ConnectorTier
} from '@xnetjs/plugins'
import { Bot, Loader2, Send } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AI_CHAT_STORAGE_KEYS,
  applyRuntimeEvent,
  canSendMessage,
  errorMessage,
  pickUsableConnector,
  providerConfigForConnector,
  type AiChatSettings,
  type CloudProvider
} from './ai-chat-connector'

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

  const runtimeRef = useRef<AiAgentRuntime | null>(null)
  const threadIdRef = useRef<string | null>(null)
  const cleanupRef = useRef<(() => void) | null>(null)

  const settings = useMemo<AiChatSettings>(
    () => ({ apiKey: apiKey || undefined, cloudProvider }),
    [apiKey, cloudProvider]
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

  // (Re)build the runtime when the active connector/settings change.
  useEffect(() => {
    runtimeRef.current = null
    threadIdRef.current = null
    setReady(false)
    if (!selected?.available) return
    let cancelled = false
    void resolveProvider(selected, settings).then((provider) => {
      if (cancelled || !provider) return
      const runtime = createAiAgentRuntime({ provider })
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
  }, [selected, settings, handlers])

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
        <p className="text-xs">Chat with an AI using your own model or API key.</p>
        <p className="text-[11px]">
          Your model runs locally or on your own key — never on our servers.
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
      title="This assistant replies in chat. Acting on your workspace is coming soon."
      className="shrink-0 rounded-full border border-hairline px-2 py-0.5 text-[10px] uppercase tracking-wider text-ink-3"
    >
      chat
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

function appendToAssistant(messages: ChatMessage[], text: string): ChatMessage[] {
  const last = messages[messages.length - 1]
  if (last?.role !== 'assistant') return [...messages, { role: 'assistant', content: text }]
  return [...messages.slice(0, -1), { ...last, content: last.content + text }]
}

async function resolveProvider(
  detection: ConnectorDetection,
  settings: AiChatSettings
): Promise<AIProvider | null> {
  if (detection.tier === 'prompt-api') return createPromptApiProvider()
  const config = providerConfigForConnector(detection, settings)
  return config ? createAIProvider(config) : null
}
