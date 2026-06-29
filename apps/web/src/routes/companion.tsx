/**
 * /companion (exploration 0250) — the calm shell's agent surface.
 *
 * A router-addressable home for the Companion mode so deep links, back/forward
 * and the ModeSwitch all work. The view itself is the promoted AI chat
 * ({@link CompanionView}); in the workbench layout this route simply renders in
 * the editor area like any other surface.
 */
import { createFileRoute } from '@tanstack/react-router'
import { CompanionView } from '../workbench/calm/CompanionView'

export const Route = createFileRoute('/companion')({
  component: CompanionView
})
