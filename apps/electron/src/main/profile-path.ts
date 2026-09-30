import { dirname, join } from 'node:path'

/** Packaged data stays put; every source launch gets a separate namespace. */
export function resolveProfilePath(
  defaultUserData: string,
  packaged: boolean,
  requested = 'default'
) {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,100}$/.test(requested)) {
    throw new Error('Invalid xNet profile name. Use letters, numbers, underscores, or hyphens.')
  }
  if (packaged && requested.startsWith('dev-'))
    throw new Error('Profile names beginning with dev- are reserved for source builds.')
  const profile = packaged ? requested : `dev-${requested}`
  return {
    profile,
    userData:
      packaged && requested === 'default'
        ? defaultUserData
        : join(dirname(defaultUserData), `xnet-desktop-${profile}`)
  }
}
