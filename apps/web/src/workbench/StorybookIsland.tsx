/**
 * StorybookIsland — the Storybook link docked beside the dev-tools island.
 *
 * A 32×32 island to the right of `DevToolsIsland`, matching its shape and
 * grammar (0287). Clicking it opens the component catalog in a new tab.
 *
 * Dev builds only, and deliberately WITHOUT a reachability probe. The first
 * version fetched `:6006/index.json` to hide the button when Storybook was not
 * running; that request logs `ERR_CONNECTION_REFUSED` whenever it is not, which
 * is console noise for anyone with devtools open and broke the zero-console-error
 * assertion in `tests/e2e/src/editor-ux.spec.ts`. There is no way to ask "is this
 * port open?" from a page without that side effect, so the button is simply
 * always present in dev and its tooltip says what to run if the tab fails to
 * load. `DevToolsIsland` next door is gated the same way — on a capability flag,
 * not on a network round-trip.
 *
 * New tab rather than an iframe on purpose — the app's `frame-src` does not
 * include localhost, and Storybook wants the whole viewport anyway.
 */
import { BookOpen } from 'lucide-react'

/** Matches `dev:stories` in the root package.json. */
const STORYBOOK_URL = 'http://127.0.0.1:6006'

export function StorybookIsland() {
  if (!import.meta.env.DEV) return null

  return (
    <a
      href={STORYBOOK_URL}
      target="_blank"
      rel="noreferrer"
      title="Open Storybook — component catalog and visual explorations (run `pnpm dev:stories` if it doesn't load)"
      aria-label="Open Storybook"
      className="flex h-8 w-8 flex-none cursor-pointer items-center justify-center rounded-[14px] border border-hairline bg-island-b text-ink-2 transition-colors hover:text-ink-1"
    >
      <BookOpen size={16} strokeWidth={1.75} />
    </a>
  )
}
