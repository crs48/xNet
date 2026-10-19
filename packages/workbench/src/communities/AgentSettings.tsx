import type { CommunityAgents } from './use-community-agents'
import type { CommunityData, Conversation } from './use-community-data'
import { ChannelSchema } from '@xnetjs/data'
import { Bot, RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Modal, primaryButton, secondaryButton, inputClass } from './primitives'
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
    <Modal title={channel ? `Agent in ${channel.name}` : 'Your agents'} onClose={onClose}>
      <div className="space-y-5">
        <p className="text-sm leading-6 text-muted-foreground">
          Connect an agent installed on this computer. It uses your existing provider login and a
          dedicated conversation. Your selected text goes to the provider; running the bridge
          locally does not make the model local.
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
              {agents.snapshot.runtimes.map((entry) => (
                <button
                  key={entry.id}
                  disabled={busy || entry.state === 'unsupported'}
                  onClick={() => setSelected(entry.id)}
                  aria-pressed={selected === entry.id}
                  className={`w-full rounded-xl border p-3 text-left ${selected === entry.id ? 'border-foreground' : 'border-border'} disabled:opacity-50`}
                >
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Bot size={16} />
                    {entry.provider === 'codex' ? 'Codex' : 'Claude'}
                    <span className="ml-auto text-xs font-normal">
                      {entry.state.replaceAll('-', ' ')}
                    </span>
                  </div>
                  <p className="mt-1 text-xs">{entry.version}</p>
                  <p className="mt-1 break-all text-[10px] text-muted-foreground">{entry.path}</p>
                  <p className="mt-2 text-xs text-muted-foreground">{entry.detail}</p>
                </button>
              ))}
              {!busy && !agents.snapshot.runtimes.length && (
                <p className="text-sm">
                  No installed agents found. Install and sign in to Codex, then check again.
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
            <label className="block text-sm">
              Context sent to the provider
              <select
                aria-label="Agent context"
                className={`${inputClass} mt-2`}
                value={context}
                onChange={(event) => setContext(event.target.value as 'question' | 'recent')}
              >
                <option value="question">This message only · fresh context each time</option>
                <option value="recent">Recent chat + remembered agent conversation</option>
              </select>
            </label>
            <p className="text-xs leading-5 text-muted-foreground">
              Recent context includes up to 30 loaded messages, capped at 24,000 characters.
              Attachments are excluded. Only you can invoke this runtime; other members’ messages
              never start it. This remains a community security preview.
            </p>
            <button
              disabled={busy || runtime?.state !== 'ready'}
              className={primaryButton}
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
