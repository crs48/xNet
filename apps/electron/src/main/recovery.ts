import { open, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { app, dialog, ipcMain, shell } from 'electron'
import {
  createCheckpoint,
  listCheckpoints,
  retainCheckpoints,
  type CheckpointManifest
} from '../storage/checkpoints'
import { restoreCheckpoint } from '../storage/restore'
import { dataPath, profile } from './profile'
import { flushRenderers, resumeRenderers } from './renderer-flush'
import { hasActiveSocialImports } from './social-import-ipc'

export const recoveryPath = join(app.getPath('userData'), 'xnet-recovery')
let inFlight: Promise<CheckpointManifest> | null = null
let lastFailure: string | null = null
let busy = false
export const recoveryIsBusy = () => busy || inFlight !== null

export async function checkpointWorkspace(
  options: {
    writersStopped?: boolean
    resume?: boolean
  } = {}
): Promise<CheckpointManifest> {
  // A quit checkpoint must be newer than a manual copy that was already running.
  if (inFlight) await inFlight
  inFlight = (async () => {
    if (hasActiveSocialImports())
      throw new Error('Finish or cancel the current import before making a recovery copy.')
    if (!options.writersStopped) await flushRenderers()
    const point = await createCheckpoint({
      dataPath,
      recoveryPath,
      profile,
      appVersion: app.getVersion(),
      testIdentity: process.env.XNET_TEST_BYPASS === 'true'
    })
    await retainCheckpoints(recoveryPath, point.id, {
      allowTestIdentity: process.env.XNET_TEST_BYPASS === 'true'
    })
    return point
  })()
  try {
    const point = await inFlight
    lastFailure = null
    return point
  } catch (error) {
    lastFailure = error instanceof Error ? error.message : String(error)
    throw error
  } finally {
    inFlight = null
    if (options.resume !== false) resumeRenderers()
  }
}

export function setupRecovery(options: {
  stopWriters: () => Promise<void>
  restartWriters: () => Promise<void>
}): void {
  ipcMain.handle('xnet:recovery:status', async () => ({
    checkpoints: await listCheckpoints(recoveryPath),
    busy: busy || inFlight !== null,
    error: lastFailure,
    protection: 'local-only',
    networkPaused: process.env.XNET_RECOVERY_OFFLINE === 'true',
    coverage:
      'Native workspace databases, files, and desktop identity. Browser settings and sign-in sessions are not included.'
  }))
  ipcMain.handle('xnet:recovery:resume-network', async () => {
    if (busy) throw new Error('A recovery operation is already running.')
    if (process.env.XNET_RECOVERY_OFFLINE !== 'true') return
    const { response } = await dialog.showMessageBox({
      type: 'question',
      title: 'Reconnect this restored workspace?',
      message: 'Have you finished reviewing the restored workspace?',
      detail:
        'Sync may bring newer work back from your other devices. xNet will restart and reconnect. The preserved workspace stays in the recovery folder.',
      buttons: ['Stay offline', 'Reconnect and restart'],
      defaultId: 0,
      cancelId: 0
    })
    if (response !== 1) return
    busy = true
    try {
      await flushRenderers()
      await options.stopWriters()
      await checkpointWorkspace({ writersStopped: true, resume: false })
      await rm(join(recoveryPath, 'review-required.json'))
      const directory = await open(recoveryPath, 'r')
      try {
        await directory.sync()
      } finally {
        await directory.close()
      }
      app.relaunch()
      app.exit(0)
    } catch (error) {
      await options.restartWriters()
      throw error
    } finally {
      busy = false
      resumeRenderers()
    }
  })
  ipcMain.handle('xnet:recovery:create', async () => {
    if (busy) throw new Error('A recovery operation is already running.')
    busy = true
    try {
      return await checkpointWorkspace()
    } finally {
      busy = false
    }
  })
  ipcMain.handle('xnet:recovery:show', async () => {
    const error = await shell.openPath(recoveryPath)
    if (error) throw new Error(error)
  })
  ipcMain.handle('xnet:recovery:restore', async (_event, id: string) => {
    if (busy) throw new Error('A recovery operation is already running.')
    busy = true
    let stopped = false
    try {
      const points = await listCheckpoints(recoveryPath)
      const point = points.find((point) => point.id === id && point.profile === profile)
      if (!point) throw new Error('Recovery point was not found in this workspace.')
      const { response } = await dialog.showMessageBox({
        type: 'warning',
        title: 'Restore this workspace?',
        message: `Restore the local copy from ${new Date(point.createdAt).toLocaleString()}?`,
        detail:
          'xNet will restart. Your current workspace, including newer edits, will be kept in a separate recovery folder. This copy does not include browser settings or sign-in sessions.',
        buttons: ['Cancel', 'Restore and restart'],
        defaultId: 0,
        cancelId: 0
      })
      if (response !== 1) return { restored: false }
      await flushRenderers()
      await options.stopWriters()
      stopped = true
      await checkpointWorkspace({ writersStopped: true, resume: false })
      await restoreCheckpoint({
        id,
        dataPath,
        recoveryPath,
        profile,
        allowTestIdentity: process.env.XNET_TEST_BYPASS === 'true'
      })
      app.relaunch()
      app.exit(0)
      return { restored: true }
    } catch (error) {
      lastFailure = error instanceof Error ? error.message : String(error)
      if (stopped) await options.restartWriters()
      throw error
    } finally {
      busy = false
      resumeRenderers()
    }
  })
}
