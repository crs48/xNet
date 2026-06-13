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
 * Live tool execution (the agent calling xnet_* against the workspace) reuses
 * the same runtime + MCP tool surface and is the next integration step; this
 * panel delivers connector selection + streaming chat + the approval scaffold.
 */

import {
  createAIProvider,
  createAiAgentRuntime,
  createPromptApiProvider,
  detectConnectors,
  pickBestConnector,
  writeModeFor,
  type AiAgentRuntime,
  type AIProvider,
  type ConnectorDetection,
  type ConnectorTier
} from '@xnetjs/plugins'
import { Bot, Loader2, Send } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AI_CHAT_STORAGE_KEYS,
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
  const [selectedTier, setSelectedTier] = useState<ConnectorTier | null>(null)
  const [apiKey, setApiKey] = useState(() => readSetting(AI_CHAT_STORAGE_KEYS.apiKey))
  const [cloudProvider, setCloudProvider] = useState<CloudProvider>(
    () => (readSetting(AI_CHAT_STORAGE_KEYS.cloudProvider) as CloudProvider) || 'anthropic'
  )
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const runtimeRef = useRef<AiAgentRuntime | null>(null)
  const threadIdRef = useRef<string | null>(null)
  const cleanupRef = useRef<(() => void) | null>(null)

  const settings = useMemo<AiChatSettings>(
    () => ({ apiKey: apiKey || undefined, cloudProvider }),
    [apiKey, cloudProvider]
  )

  // Detect connectors (re-runs when the key changes so cloud-key flips available).
  useEffect(() => {
    let cancelled = false
    void detectConnectors({ hasCloudKey: () => apiKey.length > 0 }).then((result) => {
      if (cancelled) return
      setDetections(result)
      setSelectedTier((current) => current ?? pickBestConnector(result)?.tier ?? null)
    })
    return () => {
      cancelled = true
    }
  }, [apiKey])

  const selected = detections.find((d) => d.tier === selectedTier) ?? null
  const writeMode = selected ? writeModeFor(selected.toolCalling) : null

  // (Re)build the runtime when the active connector/settings change.
  useEffect(() => {
    runtimeRef.current = null
    threadIdRef.current = null
    if (!selected || !selected.available) return

    let cancelled = false
    void resolveProvider(selected, settings).then((provider) => {
      if (cancelled || !provider) return
      const runtime = createAiAgentRuntime({ provider })
      void runtime.load().then(() => {
        if (!cancelled) runtimeRef.current = runtime
      })
      const unsubscribe = runtime.subscribe((event) => {
        if (event.threadId && event.threadId !== threadIdRef.current) return
        if (event.type === 'model.delta') {
          const text = (event.payload as { text?: string }).text ?? ''
          setMessages((prev) => appendToAssistant(prev, text))
        } else if (event.type === 'run.completed' || event.type === 'model.completed') {
          setStreaming(false)
        } else if (event.type === 'run.failed') {
          setStreaming(false)
          setError(String((event.payload as { error?: string }).error ?? 'run failed'))
        }
      })
      cleanupRef.current = unsubscribe
    })
    return () => {
      cancelled = true
      cleanupRef.current?.()
      cleanupRef.current = null
    }
  }, [selected, settings])

  const send = useCallback(async () => {
    const content = input.trim()
    const runtime = runtimeRef.current
    if (!content || streaming || !runtime) return
    setError(null)
    setInput('')
    setMessages((prev) => [...prev, { role: 'user', content }, { role: 'assistant', content: '' }])
    setStreaming(true)
    try {
      if (!threadIdRef.current) {
        const thread = await runtime.createThread({ title: 'AI chat' })
        threadIdRef.current = thread.id
      }
      await runtime.runTurn({ threadId: threadIdRef.current, content })
    } catch (err) {
      setStreaming(false)
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [input, streaming])

  return (
    <div className="flex h-full min-h-0 flex-col bg-surface-1">
      <ConnectorBar
        detections={detections}
        selectedTier={selectedTier}
        onSelect={setSelectedTier}
        writeMode={writeMode}
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

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-ink-3">
            <Bot size={22} strokeWidth={1.5} />
            <p className="text-xs">Chat with an AI that can help manage your workspace.</p>
            <p className="text-[11px]">
              Your model runs locally or on your own key — never on our servers.
            </p>
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {messages.map((message, index) => (
              <li key={index} className={message.role === 'user' ? 'text-right' : ''}>
                <div className="text-[10px] font-medium uppercase tracking-wider text-ink-3">
                  {message.role === 'user' ? 'You' : 'Assistant'}
                </div>
                <p className="whitespace-pre-wrap break-words text-xs text-ink-1">
                  {message.content || (streaming ? '…' : '')}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>

      {error && <p className="px-3 py-1 text-[11px] text-rose-500">{error}</p>}

      <div className="flex items-end gap-2 border-t border-hairline p-2">
        <textarea
          value={input}
          rows={2}
          placeholder={runtimeRef.current ? 'Message…' : 'Select and configure a model above'}
          disabled={!runtimeRef.current}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault()
              void send()
            }
          }}
          className="min-h-0 flex-1 resize-none rounded-md border border-hairline bg-surface-0 px-2 py-1.5 text-xs text-ink-1 outline-none placeholder:text-ink-3 focus:border-border-emphasis disabled:opacity-50"
        />
        <button
          type="button"
          onClick={() => void send()}
          disabled={!input.trim() || streaming || !runtimeRef.current}
          aria-label="Send"
          className="flex h-7 w-7 items-center justify-center rounded-md border border-hairline bg-surface-0 text-ink-2 hover:text-ink-1 disabled:cursor-default disabled:opacity-50"
        >
          {streaming ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
        </button>
      </div>
    </div>
  )
}

function ConnectorBar({
  detections,
  selectedTier,
  onSelect,
  writeMode
}: {
  detections: ConnectorDetection[]
  selectedTier: ConnectorTier | null
  onSelect: (tier: ConnectorTier) => void
  writeMode: 'agentic' | 'propose-only' | null
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
      {writeMode && (
        <span
          title={
            writeMode === 'agentic'
              ? 'This model can call tools, so it can apply changes (with approval).'
              : 'This model proposes changes for you to apply.'
          }
          className="shrink-0 rounded-full border border-hairline px-2 py-0.5 text-[10px] uppercase tracking-wider text-ink-3"
        >
          {writeMode}
        </span>
      )}
    </div>
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
    <div className="flex gap-2 border-b border-hairline px-3 py-2">
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
        placeholder="API key (stored locally)"
        onChange={(event) => onApiKey(event.target.value)}
        className="min-w-0 flex-1 rounded-md border border-hairline bg-surface-0 px-2 py-1 text-[11px] text-ink-1 outline-none placeholder:text-ink-3"
      />
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
  if (!config) return null
  return createAIProvider(config)
}
