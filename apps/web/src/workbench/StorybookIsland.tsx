/**
 * StorybookIsland — the Storybook link docked beside the dev-tools island.
 *
 * A 32×32 island to the right of `DevToolsIsland`, matching its shape and
 * grammar (0287). Clicking it opens the component catalog in a new tab.
 *
 * It renders only when Storybook is actually reachable, because it usually
 * isn't: `pnpm dev:stories` is a separate process from `pnpm dev`, so a button
 * that is always visible would be dead most of the time. The probe is cheap and
 * runs once on mount; `connect-src http://127.0.0.1:*` is already in the app's
 * CSP (see apps/web/index.html), so it costs nothing to ask.
 *
 * New tab rather than an iframe on purpose — the app's `frame-src` does not
 * include localhost, and Storybook wants the whole viewport anyway.
 */
import { BookOpen } from 'lucide-react'
import { useEffect, useState } from 'react'

/** Matches `dev:stories` in the root package.json. */
const STORYBOOK_URL = 'http://127.0.0.1:6006'

/** Probe once; a Storybook started later needs a reload, which is fine for dev chrome. */
async function storybookIsUp(signal: AbortSignal): Promise<boolean> {
  try {
    // A plain CORS request, deliberately NOT `mode: 'no-cors'`. Storybook serves
    // permissive CORS headers on `index.json`, so this succeeds — whereas the
    // no-cors variant fails outright from a `localhost:5199` page (measured).
    // no-cors reads as "more permissive" and is the opposite here.
    const response = await fetch(`${STORYBOOK_URL}/index.json`, { signal })

    return response.ok
  } catch {
    return false
  }
}

export function StorybookIsland() {
  const [available, setAvailable] = useState(false)

  useEffect(() => {
    if (!import.meta.env.DEV) return
    const controller = new AbortController()
    void storybookIsUp(controller.signal).then((up) => {
      if (!controller.signal.aborted) setAvailable(up)
    })

    return () => controller.abort()
  }, [])

  if (!available) return null

  return (
    <a
      href={STORYBOOK_URL}
      target="_blank"
      rel="noreferrer"
      title="Open Storybook — component catalog and visual explorations"
      aria-label="Open Storybook"
      className="flex h-8 w-8 flex-none cursor-pointer items-center justify-center rounded-[14px] border border-hairline bg-island-b text-ink-2 transition-colors hover:text-ink-1"
    >
      <BookOpen size={16} strokeWidth={1.75} />
    </a>
  )
}
