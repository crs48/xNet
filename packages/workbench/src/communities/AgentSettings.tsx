import type { CommunityAgents } from './use-community-agents'
import type { CommunityData, Conversation } from './use-community-data'
import { ChannelSchema } from '@xnetjs/data'
import { Bot, RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Modal, primaryButton, secondaryButton } from './primitives'
export function AgentSettings({
  agents,
  data,
  channel,
  onOpen,
  onClose
}: {
  agents: CommunityAgents
  data: CommunityData
  channel?: Conversation
  onOpen: (id: string) => void
  onClose: () => void
}) {
  const binding = agents.snapshot.bindings.find((entry) => entry.channelId === channel?.id)
  const [selected, setSelected] = useState(binding?.runtimeId ?? '')
  const [context, setContext] = useState<'question' | 'recent'>(binding?.context ?? 'question')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const refresh = agents.refresh
  const perform = useCallback(
    async (fn: () => Promise<unknown>) => {
      setBusy(true)
      setError('')
      try {
        await fn()
        await refresh()
      } catch (cause) {
        setError(String(cause))
      } finally {
        setBusy(false)
      }
    },
    [refresh]
  )
  const didDiscover = useRef(false)
  useEffect(() => {
    if (didDiscover.current) return
    didDiscover.current = true
    if (agents.port && !agents.snapshot.runtimes.length) void perform(() => agents.port!.discover())
  }, [agents.port, agents.snapshot.runtimes.length, perform])
  const runtime = agents.snapshot.runtimes.find((entry) => entry.id === selected)
  return (
    <Modal
      title={channel ? `Agent in ${channel.name}` : 'Your agents'}
      onClose={onClose}
      footer={
        agents.port ? (
          <button
            disabled={busy || runtime?.state !== 'ready'}
            className={`${primaryButton} w-full`}
            onClick={() =>
              void perform(async () => {
                if (!runtime || !data.bridge || !data.did)
                  throw new Error('The local store is still loading.')
                const target =
                  channel ??
                  (await data.bridge.create(ChannelSchema, {
                    name: runtime.provider === 'codex' ? 'Codex' : 'Claude',
                    kind: 'dm',
                    members: [data.did],
                    visibility: 'private',
                    topic: 'Your agent, running on this device.'
                  }))
                await agents.port!.bind({
                  channelId: target.id,
                  runtimeId: runtime.id,
                  provider: runtime.provider,
                  context,
                  mode: channel ? (binding?.mode ?? 'mentions') : 'direct',
                  enabled: true
                })
                onOpen(target.id)
                onClose()
              })
            }
          >
            {channel ? 'Enable agent in this conversation' : 'Start an agent conversation'}
          </button>
        ) : undefined
      }
    >
      <div className="space-y-4">
        <p className="text-sm leading-6 text-muted-foreground">
          Chat with Codex or Claude using the account already on your computer. Choose what text to
          share with its provider.
        </p>
        {!agents.port ? (
          <p>Open the desktop app to connect Codex or Claude.</p>
        ) : (
          <>
            <button
              className={secondaryButton}
              disabled={busy}
              onClick={() => void perform(() => agents.port!.discover())}
            >
              <RefreshCw size={14} />
              {busy ? 'Checking…' : 'Find installed agents'}
            </button>
            <div className="space-y-2">
              {agents.snapshot.runtimes
                .filter((entry) => entry.state !== 'unsupported')
                .map((entry) => (
                  <button
                    key={entry.id}
                    disabled={busy || entry.state === 'unsupported'}
                    onClick={() => setSelected(entry.id)}
                    aria-pressed={selected === entry.id}
                    className={`w-full rounded-xl border p-3 text-left transition-colors ${selected === entry.id ? 'border-foreground/30 bg-muted shadow-sm' : 'border-border hover:bg-muted/50'} disabled:opacity-50`}
                  >
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <Bot size={16} />
                      {entry.provider === 'codex' ? 'Codex' : 'Claude'}
                      <span className="ml-auto text-xs font-normal">
                        {entry.state.replaceAll('-', ' ')}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {entry.state === 'ready'
                        ? 'Connected on this device.'
                        : entry.state === 'available'
                          ? 'Use the login already on this device.'
                          : entry.detail}
                    </p>
                  </button>
                ))}
              {!busy &&
                !agents.snapshot.runtimes.some((entry) => entry.state !== 'unsupported') && (
                  <p className="text-sm">
                    No supported agents found. Install and sign in to Codex or Claude Code, then
                    check again.
                  </p>
                )}
            </div>
            {runtime && runtime.state !== 'ready' && (
              <button
                className={primaryButton}
                disabled={busy}
                onClick={() =>
                  void perform(async () => {
                    const result = await agents.port!.connect(runtime.id)
                    if (result.state !== 'ready') throw new Error(result.detail)
                  })
                }
              >
                Connect {runtime.provider === 'codex' ? 'Codex' : 'Claude'}
              </button>
            )}
            <fieldset className="space-y-2">
              <legend className="mb-2 text-sm font-medium">What can the agent read?</legend>
              {(
                [
                  ['question', 'Just this message', 'Start fresh with each request.'],
                  [
                    'recent',
                    'Recent conversation',
                    'Include recent text and remember this agent conversation.'
                  ]
                ] as const
              ).map(([value, title, detail]) => (
                <label
                  key={value}
                  className="flex cursor-pointer items-start gap-3 rounded-lg border border-border p-3 hover:bg-muted/50"
                >
                  <input
                    type="radio"
                    name="agent-context"
                    value={value}
                    checked={context === value}
                    onChange={() => setContext(value)}
                    className="mt-0.5 accent-black"
                  />
                  <span className="text-sm">
                    {title}
                    <span className="mt-1 block text-xs text-muted-foreground">{detail}</span>
                  </span>
                </label>
              ))}
            </fieldset>
            <p className="text-xs leading-5 text-muted-foreground">
              Selected text and extension drafts are sent to the provider. Extensions are tested
              with screenshots in a disposable copy without personal data. Chat attachments are
              excluded. Only you can invoke your agent here; collaborating on an extension requires
              a separate grant.
            </p>
            <details className="rounded-lg border border-border text-xs text-muted-foreground">
              <summary className="cursor-pointer px-3 py-2">
                Connection &amp; privacy details
              </summary>
              <div className="space-y-3 border-t border-border p-3 leading-5">
                <p>
                  Recent context includes up to 30 loaded messages and 24,000 characters. Connecting
                  locally does not run the model on this device. This is a security preview.
                </p>
                {agents.snapshot.runtimes.map((entry) => (
                  <div key={entry.id}>
                    <p className="font-medium text-foreground">
                      {entry.provider === 'codex' ? 'Codex' : 'Claude'} ·{' '}
                      {entry.state.replaceAll('-', ' ')} · {entry.version}
                    </p>
                    <p className="break-all">{entry.path}</p>
                    <p>{entry.detail}</p>
                  </div>
                ))}
              </div>
            </details>
            {binding?.enabled && (
              <button
                className={secondaryButton}
                disabled={busy}
                onClick={() =>
                  void perform(async () => {
                    await agents.port!.bind({ ...binding, enabled: false })
                    onClose()
                  })
                }
              >
                Disconnect from this conversation
              </button>
            )}
          </>
        )}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </div>
    </Modal>
  )
}
