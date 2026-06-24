/**
 * Pure logic for the Reset panel — extracted so the two-step-confirm state
 * machine and the clear orchestration are unit-testable without rendering
 * React (the devtools package has no DOM test harness).
 */

export type ActionState = 'idle' | 'armed' | 'running' | 'done' | 'error'

export type ClickAction = 'fire' | 'disarm' | 'none'

/**
 * Two-step confirm reducer. The first click arms (and schedules a disarm); the
 * second click (while armed) fires. Disabled or already-running clicks are
 * no-ops. Pure so the whole state machine is unit-tested without React.
 */
export function reduceClick(
  state: ActionState,
  disabled: boolean
): { next: ActionState; action: ClickAction } {
  if (disabled || state === 'running') return { next: state, action: 'none' }
  if (state !== 'armed') return { next: 'armed', action: 'disarm' }
  return { next: 'running', action: 'fire' }
}

/** Auto-disarm reducer: drop back to idle only if still armed. */
export function disarmState(state: ActionState): ActionState {
  return state === 'armed' ? 'idle' : state
}

/** The description line, swapped for a hint when the action is disabled. */
export function disabledText(
  disabled: boolean,
  hint: string | undefined,
  description: string
): string {
  return disabled ? (hint ?? description) : description
}

export function actionLabel(state: ActionState, danger: boolean): string {
  if (state === 'running') return 'Working…'
  if (state === 'armed') return 'Confirm?'
  return danger ? 'Clear all' : 'Clear'
}

export function formatError(label: string, err: unknown): string {
  return `${label} failed: ${err instanceof Error ? err.message : String(err)}`
}

export function clearedMessage(cleared: number): string {
  return `Cleared ${cleared} change${cleared === 1 ? '' : 's'} from the hub.`
}

export interface ResetCallbacks {
  onResetLocalData: (() => void | Promise<void>) | null
  onResetHub: (() => Promise<number>) | null
}

export interface ResetActions {
  /** Ask the hub to wipe this client's data; returns a human-readable result. */
  runHub: () => Promise<string>
  /** Wipe local storage (typically reloads the page). */
  runLocal: () => Promise<string>
  /** Clear the hub, then clear local (which reloads). */
  runEverything: (onMessage: (msg: string) => void) => Promise<string>
}

export function createResetActions({ onResetLocalData, onResetHub }: ResetCallbacks): ResetActions {
  const runHub = async (): Promise<string> => {
    if (!onResetHub) return 'No sync manager — nothing to clear on the hub.'
    return clearedMessage(await onResetHub())
  }

  const runLocal = async (): Promise<string> => {
    if (!onResetLocalData) throw new Error('Local reset is not wired by the host app.')
    await onResetLocalData() // typically reloads the page; may not return
    return 'Reloading…'
  }

  const runEverything = async (onMessage: (msg: string) => void): Promise<string> => {
    // Clear the hub first, surfacing its result, then wipe local (reloads).
    const hubMsg = await runHub().catch((err) => formatError('Hub clear', err))
    onMessage(hubMsg)
    return runLocal()
  }

  return { runHub, runLocal, runEverything }
}
