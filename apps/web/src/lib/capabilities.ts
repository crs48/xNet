/**
 * The capability register (exploration 0428).
 *
 * Grown from the Labs registry (0282), which had the right shape for the wrong
 * scope: it declared `xnet:experiment:*` flags only, so any *other* kind of
 * user-facing choice could ship with no surface at all and nothing would
 * notice. The AI assist mode did exactly that — two modes in the runtime, a
 * Charter §Agency promise that `draft` was "opt-in only", and no opt-in.
 *
 * Charter §Agency, second half: a capability you cannot see is not a degree of
 * freedom you have. So every user-flippable capability is declared here with at
 * least one **surface** a person could find it through, or a written `hidden`
 * reason it is deliberately internal — the same bargain as the `humane-ok`
 * escape hatch. `scripts/check-capability-surface.mjs` fails the build on an
 * entry that has neither, on a flag in the source that is missing from this
 * list, and on an entry here whose key no longer appears in the source.
 *
 * That last rule exists because of what the first audit found: a doc comment in
 * `packages/workbench/src/state.ts` advertised an `xnet:experiment:layout-tree`
 * flag that had been deleted in July 2026 (`59973833c`) once the shell always
 * rendered the tree. Stale prose describing a control nobody can use is the
 * same failure as a control nobody can see, pointed the other way.
 *
 * Key constants stay where their features live (`@xnetjs/workbench`); this file
 * only aggregates them.
 */
import { AI_ASSIST_MODE_KEY, DESK_RADIAL_KEY, QUIET_DEFAULT_KEY } from '@xnetjs/workbench'

/**
 * Where a capability becomes visible to someone who has not read the source.
 * Not an exhaustive taxonomy of UI — the question a surface answers is only
 * "could a person find this without being told it exists?"
 */
export type Surface =
  /** A toggle in Settings › Labs, rendered from this register. */
  | { kind: 'labs' }
  /** A named control in a Settings section. */
  | { kind: 'settings'; section: string }
  /** A first-run coachmark on a view (see apps/web/src/coachmarks). */
  | { kind: 'coachmark'; view: string }

export interface Capability {
  /** Stable id — for flags, the `xnet:experiment:*` localStorage key. */
  key: string
  label: string
  description: string
  /**
   * Honest staging. `experimental` may change or vanish; `preview` is
   * stabilising; `stable` is a standing choice, not a trial.
   */
  stage: 'experimental' | 'preview' | 'stable'
  /** Whether flipping it needs a reload to take effect. */
  appliesOn: 'reload' | 'immediate'
  /**
   * At least one surface, or `null` with a `hidden` reason. An empty array is
   * rejected by the gate — say `null` and give the reason.
   */
  surface: Surface[] | null
  /** Required when `surface` is null: why this is deliberately internal. */
  hidden?: string
}

export const CAPABILITIES: Capability[] = [
  {
    key: QUIET_DEFAULT_KEY,
    label: 'Quiet surface by default',
    description:
      'New identities start on the bare quiet surface (Desk + corner chrome) instead of the calm shell. Existing identities are never moved.',
    stage: 'preview',
    appliesOn: 'reload',
    surface: [{ kind: 'labs' }]
  },
  {
    key: DESK_RADIAL_KEY,
    label: 'Desk radial menu',
    description: 'Long-press a Desk card for a radial quick-action menu while the gesture settles.',
    stage: 'experimental',
    appliesOn: 'immediate',
    surface: [{ kind: 'labs' }]
  },
  {
    key: AI_ASSIST_MODE_KEY,
    label: 'AI assist mode',
    description:
      'Whether the assistant scaffolds your thinking or drafts finished prose. Scaffold is the default; draft is the explicit opt-in Charter §Agency describes.',
    stage: 'stable',
    appliesOn: 'immediate',
    surface: [{ kind: 'settings', section: 'ai' }]
  }
]

/**
 * The Labs subset, in registration order — what Settings › Labs renders.
 * Labs is a *surface*, not the register: a capability with a settings control
 * or a coachmark is no less declared for being absent here.
 */
export const LABS_CAPABILITIES = CAPABILITIES.filter((capability) =>
  capability.surface?.some((surface) => surface.kind === 'labs')
)

export function isLabEnabled(key: string): boolean {
  try {
    return localStorage.getItem(key) === '1'
  } catch {
    return false
  }
}

export function setLabEnabled(key: string, on: boolean): void {
  try {
    if (on) localStorage.setItem(key, '1')
    else localStorage.removeItem(key)
  } catch {
    /* storage unavailable (private mode) — the toggle just won't stick */
  }
}
