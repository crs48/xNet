import { join } from 'path'
import { app } from 'electron'
import { devScope } from './dev-scope'

// Profile support for running multiple instances with separate data.
//
// A linked git worktree scopes itself automatically — the dev launcher resolves
// `wt-<worktree>` and exports it as XNET_PROFILE (0413). Set XNET_PROFILE by
// hand to override, as `dev:user2` does.
export const profile = devScope.profile || process.env.XNET_PROFILE || 'default'

// Set separate user data path for each profile before app readiness.
// This isolates local app storage, localStorage, cookies, etc. between profiles.
//
// ORDER IS LOAD-BEARING: Chromium keys the single-instance lock on the userData
// directory, so this must run before `app.requestSingleInstanceLock()` in
// index.ts — that is what gives each profile its own lock, and therefore what
// lets two worktrees run at once. It works because this file is imported for
// its side effect at module scope. `profile-lock-order.test.ts` pins it; do not
// move either half into a function.
if (profile !== 'default') {
  const userDataPath = join(app.getPath('userData'), '..', `xnet-desktop-${profile}`)
  app.setPath('userData', userDataPath)
}

export const dataPath = join(app.getPath('userData'), 'xnet-data')
