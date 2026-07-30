/**
 * xNet Cloud — compensating transactions for multi-step provisioning (0411 G1).
 *
 * Provisioning a tenant touches four systems in sequence (identity binding,
 * Cloud Run, the AI key manager, the tenant registry). Run as a plain sequence
 * of `await`s, a failure at step 3 leaves steps 1–2 applied with nothing
 * pointing at them — a running, billable Cloud Run service that no
 * `TenantRecord` references, and a retry that provisions a *second* one.
 *
 * {@link saga} makes each step register how to undo itself; a throw unwinds the
 * completed steps in reverse. This is the whole of what a durable-execution
 * engine would buy us here, minus the engine (ADR-28).
 *
 * Two deliberate properties:
 *
 *  - **Compensation failures are reported, never swallowed.** An undo that
 *    silently failed is exactly the orphan we set out to prevent, so
 *    {@link SagaFailure} carries them and callers can alert on them (AGENTS.md:
 *    "a catch that returns a value callers cannot distinguish from success is a
 *    bug, not a guard").
 *  - **Unwinding continues past a failed compensation.** One un-undoable step
 *    must not strand the steps beneath it.
 *
 * Not a workflow engine: there is no persistence and no resume. If the process
 * dies mid-saga nothing unwinds — that is the accepted limit, and crossing it
 * is tripwire T1/T4 in exploration 0411.
 */

/** Best-effort message for an unknown thrown value. */
function causeMessage(cause: unknown): string {
  if (cause instanceof Error) return cause.message
  return String(cause)
}

/** One reversible step. `compensate` receives exactly what `run` returned. */
export interface SagaStep<T> {
  /** Short identifier used in error messages and alerts (e.g. `provision-hub`). */
  name: string
  run: () => Promise<T>
  /** Undo `run`'s effect. Omit for steps that need no compensation. */
  compensate?: (result: T) => Promise<void>
}

/** A compensation that itself failed while unwinding — the alertable case. */
export interface CompensationFailure {
  step: string
  error: unknown
}

/**
 * Thrown when a saga step fails. Carries the original `cause` plus any
 * compensations that failed while unwinding, so an operator can tell
 * "cleanly rolled back" from "left something behind".
 */
export class SagaFailure extends Error {
  readonly name = 'SagaFailure'

  constructor(
    /** The step whose `run` threw. */
    readonly step: string,
    /** The original error from that step. */
    readonly cause: unknown,
    /** Steps whose `compensate` threw while unwinding (empty = clean rollback). */
    readonly compensationFailures: CompensationFailure[]
  ) {
    // The cause's message leads, because callers match on it and the HTTP
    // routes surface `err.message` straight to the client — wrapping must not
    // turn "DID challenge failed" into "saga failed at bind-identities".
    super(
      `${causeMessage(cause)} [saga step "${step}"` +
        (compensationFailures.length > 0
          ? `; ${compensationFailures.length} compensation(s) ALSO FAILED: ` +
            compensationFailures.map((f) => f.step).join(', ')
          : '; rolled back cleanly') +
        ']'
    )
  }

  /** True when something was left behind — page someone. */
  get leakedResources(): boolean {
    return this.compensationFailures.length > 0
  }
}

/**
 * Run `steps` in order. On the first throw, compensate the already-completed
 * steps in reverse and rethrow as {@link SagaFailure}.
 *
 * The type parameter is per-step, so a heterogeneous list needs
 * `sagaStep(...)` to keep each step's `run`/`compensate` pair type-checked
 * against each other.
 */
export async function saga(steps: readonly SagaStep<never>[]): Promise<void> {
  const completed: { name: string; undo: () => Promise<void> }[] = []

  for (const step of steps) {
    let result: never
    try {
      result = await step.run()
    } catch (cause) {
      throw new SagaFailure(step.name, cause, await unwind(completed))
    }
    const compensate = step.compensate
    if (compensate) {
      completed.push({ name: step.name, undo: () => compensate(result) })
    }
  }
}

/** Undo completed steps newest-first, collecting (never throwing on) failures. */
async function unwind(
  completed: { name: string; undo: () => Promise<void> }[]
): Promise<CompensationFailure[]> {
  const failures: CompensationFailure[] = []
  for (let i = completed.length - 1; i >= 0; i--) {
    const entry = completed[i]
    if (!entry) continue
    try {
      await entry.undo()
    } catch (error) {
      failures.push({ step: entry.name, error })
    }
  }
  return failures
}

/**
 * Build a step with its result type inferred, so `compensate` is checked against
 * what `run` returns. Needed because a `SagaStep<A> | SagaStep<B>` array would
 * otherwise widen and lose that link.
 */
export function sagaStep<T>(step: SagaStep<T>): SagaStep<never> {
  return step as unknown as SagaStep<never>
}
