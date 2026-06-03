import { join } from 'path'
import { app } from 'electron'

// Profile support for running multiple instances with separate data.
// Usage: XNET_PROFILE=user2 pnpm dev:electron
export const profile = process.env.XNET_PROFILE || 'default'

// Set separate user data path for each profile before app readiness.
// This isolates local app storage, localStorage, cookies, etc. between profiles.
if (profile !== 'default') {
  const userDataPath = join(app.getPath('userData'), '..', `xnet-desktop-${profile}`)
  app.setPath('userData', userDataPath)
}

export const dataPath = join(app.getPath('userData'), 'xnet-data')
