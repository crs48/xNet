/**
 * Manager customisation: a "Back to app" button in the Storybook toolbar.
 *
 * The return half of the bottom-bar Storybook island in the web app
 * (`apps/web/src/workbench/StorybookIsland.tsx`). Storybook takes over the whole
 * tab, so without this the way back is browser history or a bookmark.
 *
 * The app's dev port varies — 5173 normally, but worktrees run on 5199/5201/…
 * (see `.claude/launch.json`). So the target is resolved in this order:
 *
 *   1. `STORYBOOK_APP_URL` at build time, for a pinned setup
 *   2. `localStorage['xnet:app-url']`, so a worktree can point it once, at runtime
 *   3. `http://localhost:5173`, the default `pnpm dev` port
 *
 * The button opens a new tab rather than navigating this one: Storybook state
 * (selected story, controls, viewport) is worth keeping when you bounce back and
 * forth, and a same-tab navigation throws it away.
 */
import React from 'react'
import { addons, types } from 'storybook/manager-api'

const ADDON_ID = 'xnet/back-to-app'
const DEFAULT_APP_URL = 'http://localhost:5173'
const APP_URL_KEY = 'xnet:app-url'

function appUrl(): string {
  const fromEnv = (import.meta as { env?: Record<string, string> }).env?.STORYBOOK_APP_URL
  if (fromEnv) return fromEnv
  try {
    const stored = window.localStorage.getItem(APP_URL_KEY)
    if (stored) return stored
  } catch {
    // localStorage can throw in a partitioned/blocked context — fall through.
  }

  return DEFAULT_APP_URL
}

addons.register(ADDON_ID, () => {
  addons.add(`${ADDON_ID}/toolbar`, {
    type: types.TOOL,
    title: 'Back to app',
    // Show everywhere: the story canvas, docs pages, and the visual-exploration
    // companions (0403) — the return trip is wanted from all of them.
    match: () => true,
    render: () => (
      <a
        href={appUrl()}
        target="_blank"
        rel="noreferrer"
        title={`Back to the xNet app (${appUrl()}) — set localStorage['${APP_URL_KEY}'] to change`}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          height: 28,
          padding: '0 10px',
          borderRadius: 6,
          color: 'inherit',
          textDecoration: 'none',
          fontSize: 12
        }}
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M3 12l9-9 9 9" />
          <path d="M9 21V12h6v9" />
        </svg>
        Back to app
      </a>
    )
  })
})
