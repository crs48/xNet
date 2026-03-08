/**
 * Debug logging helpers for the Electron coding workspace.
 */

function shouldLogWorkspaceDebug(): boolean {
  if (typeof localStorage === 'undefined') {
    return false
  }

  return (
    localStorage.getItem('xnet:workspace:debug') === 'true' ||
    localStorage.getItem('xnet:sync:debug') === 'true'
  )
}

export function logWorkspaceDebug(scope: string, ...args: unknown[]): void {
  if (!shouldLogWorkspaceDebug()) {
    return
  }

  console.log(`[Workspace:${scope}]`, ...args)
}
