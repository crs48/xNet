/**
 * Built-in panel views (exploration 0166; slot registry since 0280).
 *
 * Registration moved to the shell-wide slot registry — one registry for
 * panel views, dock residents and frame views alike. Plugin contributions
 * register through the same path (`registerSlotView` / the `slots`
 * manifest key).
 */
import { registerBuiltinSlotViews } from '../slot-registry'

export function registerBuiltinPanelViews(): void {
  registerBuiltinSlotViews()
}
