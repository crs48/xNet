import { dirname } from 'node:path'
import { app, dialog, shell } from 'electron'
import { WorkspaceRecoveryRequired } from '../storage/compatibility'

/** Available before renderer, identity, sync, or normal workspace startup. */
export async function showStartupRecovery(
  error: unknown,
  dataPath: string,
  restore?: () => Promise<void>
): Promise<void> {
  const detail = error instanceof Error ? error.message : String(error)
  console.error('[Recovery] Workspace startup stopped:', error)
  const result = await dialog.showMessageBox({
    type: 'error',
    title: 'Your workspace was preserved',
    message: 'xNet could not safely open this workspace.',
    detail: `${detail}\n\nNo database has been reset. Keep this folder when reinstalling a compatible version of xNet.\n\n${dataPath}`,
    buttons: [
      'Quit',
      'Show workspace folder',
      ...(restore ? ['Restore latest recovery copy'] : [])
    ],
    defaultId: 1,
    cancelId: 0,
    noLink: true
  })
  if (result.response === 1) {
    const path = error instanceof WorkspaceRecoveryRequired ? dirname(error.path) : dataPath
    const failure = await shell.openPath(path)
    if (failure) dialog.showErrorBox('Could not open workspace folder', `${failure}\n${path}`)
  }
  if (result.response === 2 && restore) {
    try {
      await restore()
      app.relaunch()
      app.exit(0)
      return
    } catch (restoreError) {
      dialog.showErrorBox('Could not restore this workspace', String(restoreError))
    }
  }
  app.quit()
}
