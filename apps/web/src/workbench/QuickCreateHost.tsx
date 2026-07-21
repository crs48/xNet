/**
 * QuickCreateHost — makes the non-document "New …" verbs reachable from
 * anywhere (exploration 0387).
 *
 * The canonical New menu now offers Channel / Space / Task / Meeting alongside
 * the document types, but the panels that used to own those creators
 * (ChatsPanel, ExplorerSpacesSection, TasksView) are only mounted on their own
 * surface — under the unified nav (0353) none of them may be alive when the
 * menu is used. So the naming step is hosted at the shell and opened by
 * command, exactly like `share.addShared` / {@link AddSharedHost}:
 *
 * - `chats.newChannel` / `spaces.new` — prompt for a name here, create, and
 *   navigate to the result.
 * - `tasks.new` — the Tasks surface owns the quick-add input, so this only
 *   routes there and then re-dispatches `tasks.quickCreate` once that view has
 *   mounted and registered it.
 *
 * The in-panel creators stay exactly where they are; this is the global road,
 * not a replacement for the local ones.
 */
import { useNavigate } from '@tanstack/react-router'
import { createChannel } from '@xnetjs/comms'
import { getCommandRegistry } from '@xnetjs/plugins'
import { useDataBridge } from '@xnetjs/react/internal'
import { Hash, Layers } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useSpaces } from '../hooks/useSpaces'

/** What the host is currently asking a name for (null = closed). */
type Prompt = 'channel' | 'space'

const PROMPT_COPY: Record<Prompt, { title: string; placeholder: string; submit: string }> = {
  channel: { title: 'New channel', placeholder: 'channel name…', submit: 'Create channel' },
  space: { title: 'New space', placeholder: 'space name…', submit: 'Create space' }
}

/**
 * Re-dispatch a command that a route's view registers on mount. The registry
 * returns false for an unknown id, so poll briefly rather than guessing a
 * single delay — the view may be lazy-loaded on a cold route.
 */
async function runWhenRegistered(id: string, attempts = 20, stepMs = 50): Promise<boolean> {
  for (let i = 0; i < attempts; i++) {
    if (await getCommandRegistry().runCommand(id)) return true
    await new Promise((resolve) => setTimeout(resolve, stepMs))
  }
  return false
}

export function QuickCreateHost() {
  const navigate = useNavigate()
  const bridge = useDataBridge()
  const { createSpace } = useSpaces()
  const [prompt, setPrompt] = useState<Prompt | null>(null)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)

  // The commands are registered once, so their handlers must not close over
  // `bridge`/`createSpace` — keep the live values in a ref instead.
  const deps = useRef({ bridge, createSpace, navigate })
  deps.current = { bridge, createSpace, navigate }

  useEffect(() => {
    const registry = getCommandRegistry()
    const disposables = [
      registry.register({
        id: 'chats.newChannel',
        title: 'New channel',
        run: () => setPrompt('channel')
      }),
      registry.register({
        id: 'spaces.new',
        title: 'New space',
        run: () => setPrompt('space')
      }),
      registry.register({
        id: 'tasks.new',
        title: 'New task',
        run: async () => {
          deps.current.navigate({ to: '/tasks' })
          await runWhenRegistered('tasks.quickCreate')
        }
      }),
      registry.register({
        id: 'meetings.record',
        title: 'New meeting',
        run: () => deps.current.navigate({ to: '/meetings', search: { record: 1 } })
      })
    ]
    return () => disposables.forEach((disposable) => disposable.dispose())
  }, [])

  const close = useCallback(() => {
    setPrompt(null)
    setName('')
    setBusy(false)
  }, [])

  const submit = useCallback(async () => {
    const trimmed = name.trim()
    if (!trimmed || !prompt || busy) return
    setBusy(true)
    try {
      if (prompt === 'channel') {
        const store = deps.current.bridge
        if (!store) return
        const channel = (await createChannel(store, { name: trimmed })) as { id?: string } | null
        if (channel?.id) {
          deps.current.navigate({ to: '/channel/$channelId', params: { channelId: channel.id } })
        }
      } else {
        await deps.current.createSpace({ name: trimmed })
      }
      close()
    } finally {
      setBusy(false)
    }
  }, [busy, close, name, prompt])

  if (!prompt) return null
  const copy = PROMPT_COPY[prompt]
  const Icon = prompt === 'channel' ? Hash : Layers

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/50" onClick={close} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={copy.title}
        className="fixed left-1/2 top-1/2 z-50 w-[360px] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border bg-background shadow-xl"
      >
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <Icon size={16} className="text-primary" />
          <h2 className="text-sm font-medium">{copy.title}</h2>
        </div>
        <form
          className="p-4"
          onSubmit={(event) => {
            event.preventDefault()
            void submit()
          }}
        >
          <input
            autoFocus
            type="text"
            value={name}
            aria-label={copy.title}
            placeholder={copy.placeholder}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') close()
            }}
            className="w-full rounded-md border border-border bg-secondary px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground/50 focus:border-primary"
          />
          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={close}
              className="cursor-pointer rounded-md border-none bg-transparent px-4 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy || !name.trim()}
              className="cursor-pointer rounded-md border-none bg-primary px-4 py-2 text-sm text-primary-foreground transition-colors hover:bg-primary-hover disabled:opacity-50"
            >
              {busy ? 'Creating…' : copy.submit}
            </button>
          </div>
        </form>
      </div>
    </>
  )
}
