/**
 * Reset panel — "wipe the database" tooling for pre-release dev work.
 *
 * Three destructive, two-step-confirm actions:
 *  - Clear Hub: ask the hub to delete this client's stored changes (the user's
 *    own author room) via SyncManager.clearHubData().
 *  - Clear Local: wipe the local OPFS SQLite + IndexedDB + localStorage and
 *    reload (host-provided `onResetLocalData`).
 *  - Clear Everything: clear the hub, then clear local (which reloads).
 *
 * The local clear is host-injected because the OPFS-aware reset lives in the
 * web app (the devtools package can't reach it). When it isn't wired, the local
 * buttons are disabled with an explanation rather than silently no-op'ing.
 *
 * The state-machine + orchestration logic lives in `reset-actions.ts` so it can
 * be unit-tested without rendering React.
 */
import { useCallback, useState } from 'react'
import { useDevTools } from '../../provider/useDevTools'
import {
  actionLabel,
  createResetActions,
  disabledText,
  disarmState,
  formatError,
  reduceClick,
  type ActionState
} from './reset-actions'

export function Reset() {
  const { onResetLocalData, onResetHub } = useDevTools()
  const [message, setMessage] = useState<string | null>(null)
  const actions = createResetActions({ onResetLocalData, onResetHub })

  return (
    <div className="h-full overflow-auto p-3 text-xs text-ink-2">
      <p className="mb-3 text-ink-3">
        Destructive. Pre-release only — no migration is performed. Each action asks for a second
        click to confirm.
      </p>

      <div className="flex flex-col gap-2 max-w-md">
        <ResetAction
          label="Clear hub (my data)"
          description="Delete this client's changes stored on the hub (your author room)."
          disabled={!onResetHub}
          disabledHint="No sync manager is connected."
          run={actions.runHub}
          onMessage={setMessage}
        />
        <ResetAction
          label="Clear local database"
          description="Wipe local SQLite (OPFS), IndexedDB and localStorage, then reload."
          disabled={!onResetLocalData}
          disabledHint="The host app did not wire a local reset."
          run={actions.runLocal}
          onMessage={setMessage}
        />
        <ResetAction
          label="Clear everything (hub + local)"
          description="Clear the hub, then wipe local data and reload. Full fresh start."
          danger
          disabled={!onResetLocalData}
          disabledHint="The host app did not wire a local reset."
          run={() => actions.runEverything(setMessage)}
          onMessage={setMessage}
        />
      </div>

      {message && (
        <div className="mt-3 rounded border border-hairline bg-surface-2 px-2 py-1 text-ink-2">
          {message}
        </div>
      )}
    </div>
  )
}

function ResetAction({
  label,
  description,
  danger = false,
  disabled = false,
  disabledHint,
  run,
  onMessage
}: {
  label: string
  description: string
  danger?: boolean
  disabled?: boolean
  disabledHint?: string
  run: () => Promise<string>
  onMessage: (msg: string) => void
}) {
  const [state, setState] = useState<ActionState>('idle')

  const fire = useCallback(async () => {
    try {
      onMessage(await run())
      setState('done')
    } catch (err) {
      onMessage(formatError(label, err))
      setState('error')
    }
  }, [run, onMessage, label])

  const handleClick = useCallback(() => {
    const { next, action } = reduceClick(state, disabled)
    setState(next)
    if (action === 'fire') void fire()
    if (action === 'disarm') setTimeout(() => setState(disarmState), 4000)
  }, [disabled, state, fire])

  return (
    <div className="rounded border border-hairline bg-surface-1 p-2">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="font-medium text-ink-1">{label}</div>
          <div className="text-ink-3">{disabledText(disabled, disabledHint, description)}</div>
        </div>
        <button
          type="button"
          onClick={handleClick}
          disabled={disabled || state === 'running'}
          className={buttonClass(disabled, state === 'armed' || danger)}
        >
          {actionLabel(state, danger)}
        </button>
      </div>
    </div>
  )
}

function buttonClass(disabled: boolean, emphasize: boolean): string {
  const base = 'shrink-0 rounded px-2 py-1 text-xs font-medium transition-colors'
  if (disabled) return `${base} cursor-not-allowed bg-surface-2 text-ink-3`
  if (emphasize) return `${base} bg-destructive/15 text-destructive hover:bg-destructive/25`
  return `${base} bg-surface-2 text-ink-1 hover:bg-surface-3`
}
