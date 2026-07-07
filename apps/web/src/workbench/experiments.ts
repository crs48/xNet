/**
 * Workbench experiment flags (0280).
 *
 * Same staged-rollout pattern as the Desk flags in `lib/desk.ts`: opt-in
 * via localStorage while dogfooding; flipping the default later is
 * inverting the check, never a migration.
 */

/**
 * Render the shell from the layout tree via ShellFrame (0280 phase 1)
 * instead of the legacy CalmShell / workbench-grid fork. The tree state is
 * always maintained; this flag only chooses the renderer.
 */
export const LAYOUT_TREE_KEY = 'xnet:experiment:layout-tree'

export function isLayoutTreeEnabled(): boolean {
  try {
    return localStorage.getItem(LAYOUT_TREE_KEY) === '1'
  } catch {
    return false
  }
}
