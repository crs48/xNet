/**
 * InspectPrompt — the Lane 1 change affordance (exploration 0399, W2).
 *
 * Opened by <kbd>⌥</kbd>-click on an element the overlay resolved. It shows the
 * blast-radius sentence FIRST, every time, then the smallest control that can
 * make the change: a token's value, or the slot's own registered commands.
 *
 * Deliberately not a chat box. Lane 1 changes are direct manipulation — the
 * token is right there, and the layout verbs already exist as commands. An
 * agent is only needed to translate a vague wish ("cosier") into which token,
 * which is a later increment; a prompt that pretends to accept prose it cannot
 * act on would be worse than a control that does one thing.
 *
 * Lane 2 and Lane 3 are shown as an explanation and no control at all: their
 * machinery is not wired to this surface yet, and offering a button that
 * silently does nothing is the failure this whole exploration argues against.
 */
import type { Resolution } from '@xnetjs/devkit/blast-radius'
import { RotateCcw, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { applySlotCommand, applyToken, readToken, slotCommands, type Undo } from './lane1'

export interface InspectPromptProps {
  /** The frozen resolution the user clicked, plus where to pin the panel. */
  resolution: Resolution
  anchor: { left: number; top: number }
  onClose: () => void
}

export function InspectPrompt({
  resolution,
  anchor,
  onClose
}: InspectPromptProps): React.JSX.Element {
  const tokenName = resolution.lane === 1 ? resolution.tokenRef : undefined
  const slotId = resolution.lane === 1 ? resolution.slotId : undefined
  const [value, setValue] = useState(() => (tokenName ? readToken(tokenName) : ''))
  const [undo, setUndo] = useState<Undo | null>(null)
  const [undoFailed, setUndoFailed] = useState(false)
  const commands = useMemo(() => (slotId ? slotCommands(slotId) : []), [slotId])

  return (
    <div
      role="dialog"
      aria-label="Change this element"
      data-testid="inspect-prompt"
      className="fixed z-[71] w-80 rounded-lg border border-hairline bg-island-b p-3 shadow-lg"
      style={{ left: anchor.left, top: anchor.top }}
      onClick={(event) => event.stopPropagation()}
    >
      <div className="mb-2 flex items-start gap-2">
        {/* The blast radius leads. Nothing below it can be applied without
            having read it. */}
        <p className="flex-1 text-[11px] leading-snug text-ink-2" data-testid="blast-radius">
          {resolution.explain}
        </p>
        <button
          type="button"
          aria-label="Close"
          className="rounded p-0.5 text-ink-3 hover:text-ink-1"
          onClick={onClose}
        >
          <X size={13} strokeWidth={1.5} />
        </button>
      </div>

      {tokenName && (
        <div className="flex items-center gap-1.5">
          <label className="sr-only" htmlFor="inspect-token-value">
            {tokenName} value
          </label>
          <input
            id="inspect-token-value"
            className="min-w-0 flex-1 rounded border border-hairline bg-surface-1 px-1.5 py-1 font-mono text-[11px] text-ink-1"
            value={value}
            onChange={(event) => setValue(event.target.value)}
          />
          <button
            type="button"
            className="rounded bg-accent px-2 py-1 text-[11px] text-accent-foreground"
            onClick={() => {
              // Compute the reversal FIRST, then store it wrapped: React
              // treats a bare function passed to a setter as an updater and
              // CALLS it, which would run the undo instead of storing it.
              const reversal = applyToken(tokenName, value)
              setUndoFailed(false)
              setUndo(() => reversal)
            }}
          >
            Apply
          </button>
        </div>
      )}

      {!tokenName && commands.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {commands.map((command) => (
            <button
              key={command.id}
              type="button"
              className="rounded border border-hairline bg-surface-1 px-1.5 py-1 text-[11px] text-ink-1 hover:bg-surface-2"
              onClick={() => {
                void applySlotCommand(slotId as string, command.id).then((reversal) => {
                  setUndoFailed(false)
                  // Wrapped for the same reason as above — `setUndo(reversal)`
                  // would invoke the reversal immediately.
                  setUndo(() => reversal ?? null)
                })
              }}
            >
              {command.title}
            </button>
          ))}
        </div>
      )}

      {!tokenName && commands.length === 0 && (
        <p className="text-[11px] text-ink-3" data-testid="no-control">
          {resolution.lane === 1
            ? 'Nothing about this element is adjustable from here yet.'
            : 'Not changeable from here yet — this needs the lane above.'}
        </p>
      )}

      {undo && (
        <button
          type="button"
          data-testid="inspect-undo"
          className="mt-2 flex items-center gap-1 text-[11px] text-ink-2 hover:text-ink-1"
          onClick={() => {
            void undo().then((reversed) => {
              // A reversal that could not run must not clear the button and
              // imply it worked.
              if (reversed) setUndo(null)
              setUndoFailed(!reversed)
            })
          }}
        >
          <RotateCcw size={11} strokeWidth={1.5} /> Undo
        </button>
      )}

      {undoFailed && (
        <p className="mt-1 text-[11px] text-destructive" data-testid="undo-failed">
          Could not undo that automatically — the panel has moved on since.
        </p>
      )}
    </div>
  )
}
