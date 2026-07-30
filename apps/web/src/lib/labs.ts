/**
 * Labs — the registry behind Settings › Labs (exploration 0282).
 *
 * Every `xnet:experiment:*` localStorage flag gets one declarative entry
 * here, and the Labs settings section renders them as honest toggles —
 * the Obsidian-core-plugins pattern, not the chrome://flags incantation.
 * Flag KEY constants stay where their features live (desk.ts,
 * workbench/experiments.ts); this file only aggregates them.
 *
 * Named "Labs" and not "Experiments" — the habit tracker owns that word
 * (`/experiments`, ExperimentsView).
 */
import { DESK_RADIAL_KEY, QUIET_DEFAULT_KEY } from './desk'

export interface LabsFlag {
  /** The localStorage key (an existing `xnet:experiment:*` constant). */
  key: string
  label: string
  description: string
  /** Honest staging: experimental = may change/vanish; preview = stabilizing. */
  stage: 'experimental' | 'preview'
  /** Whether flipping it needs a reload to take effect. */
  appliesOn: 'reload' | 'immediate'
}

export const LABS_FLAGS: LabsFlag[] = [
  {
    key: QUIET_DEFAULT_KEY,
    label: 'Quiet surface by default',
    description:
      'New identities start on the bare quiet surface (Desk + corner chrome) instead of the calm shell. Existing identities are never moved.',
    stage: 'preview',
    appliesOn: 'reload'
  },
  {
    key: DESK_RADIAL_KEY,
    label: 'Desk radial menu',
    description: 'Long-press a Desk card for a radial quick-action menu while the gesture settles.',
    stage: 'experimental',
    appliesOn: 'immediate'
  }
]

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
