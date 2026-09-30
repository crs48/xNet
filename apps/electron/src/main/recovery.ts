import { randomUUID } from 'node:crypto'
import { mkdir, open, realpath, rm } from 'node:fs/promises'
import { join, sep } from 'node:path'
import { app, BrowserWindow, dialog, ipcMain, safeStorage, shell } from 'electron'
import { createCheckpointSchedule } from '../storage/checkpoint-policy'
import {
  createCheckpoint,
  listCheckpoints,
  retainCheckpoints,
  workspaceFingerprint,
  type CheckpointManifest
} from '../storage/checkpoints'
import { inspectDatabase, WorkspaceRecoveryRequired } from '../storage/compatibility'
import { exportPortableCheckpoint, unpackPortableCheckpoint } from '../storage/portable'
import { restoreCheckpoint } from '../storage/restore'
import { dataPath, profile } from './profile'
import { flushRenderers, resumeRenderers } from './renderer-flush'
import { hasActiveSocialImports } from './social-import-ipc'

export const recoveryPath = join(app.getPath('userData'), 'xnet-recovery')
let inFlight: Promise<CheckpointManifest> | null = null
let lastFailure: string | null = null
let busy = false
export const recoveryIsBusy = () => busy || inFlight !== null

function reportFailure(message: string | null): void {
  lastFailure = message
  for (const window of BrowserWindow.getAllWindows())
    if (!window.isDestroyed()) window.webContents.send('xnet:recovery:error', message)
}

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
    reportFailure(null)
    return point
  } catch (error) {
    reportFailure(error instanceof Error ? error.message : String(error))
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
  const tick = createCheckpointSchedule({
    now: Date.now,
    busy: () => recoveryIsBusy() || hasActiveSocialImports(),
    latest: async () => (await listCheckpoints(recoveryPath))[0] ?? null,
    fingerprint: () => workspaceFingerprint(dataPath),
    create: () => checkpointWorkspace(),
    failed: (error) => reportFailure(error instanceof Error ? error.message : String(error))
  })
  // The first tick also catches an overdue copy after launch. Recheck once a minute after failures.
  const timer = setInterval(() => void tick(), 60_000)
  timer.unref()
  app.once('will-quit', () => clearInterval(timer))
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
  ipcMain.handle('xnet:recovery:export', async (_event, password: string) => {
    if (recoveryIsBusy() || hasActiveSocialImports())
      throw new Error('Finish the current import or recovery operation first.')
    busy = true
    try {
      const picked = await dialog.showOpenDialog({
        title: 'Choose a folder for the encrypted backup',
        buttonLabel: 'Save encrypted backup here',
        properties: ['openDirectory', 'createDirectory']
      })
      if (picked.canceled || !picked.filePaths[0]) return null
      const destination = await realpath(picked.filePaths[0])
      await mkdir(recoveryPath, { recursive: true, mode: 0o700 })
      for (const source of [dataPath, recoveryPath]) {
        const root = await realpath(source)
        if (destination === root || destination.startsWith(root + sep))
          throw new Error(
            'Choose a backup folder outside this workspace and its local recovery folder.'
          )
      }
      const point = await checkpointWorkspace()
      return await exportPortableCheckpoint({
        checkpointPath: join(recoveryPath, point.id),
        destination,
        password,
        safeStorage,
        allowTestIdentity: process.env.XNET_TEST_BYPASS === 'true'
      })
    } catch (error) {
      reportFailure(error instanceof Error ? error.message : String(error))
      throw error
    } finally {
      busy = false
    }
  })
  ipcMain.handle('xnet:recovery:import', async (_event, password: string) => {
    if (recoveryIsBusy() || hasActiveSocialImports())
      throw new Error('Finish the current import or recovery operation first.')
    busy = true
    let stopped = false
    const incoming = join(recoveryPath, 'incoming', randomUUID())
    try {
      const picked = await dialog.showOpenDialog({
        title: 'Choose the encrypted .xnetbackup folder',
        properties: ['openDirectory']
      })
      if (picked.canceled || !picked.filePaths[0]) return { restored: false }
      await mkdir(join(recoveryPath, 'incoming'), { recursive: true, mode: 0o700 })
      const recovered = await unpackPortableCheckpoint({
        path: picked.filePaths[0],
        output: incoming,
        password,
        safeStorage,
        allowTestIdentity: process.env.XNET_TEST_BYPASS === 'true'
      })
      for (const [name, kind] of [
        ['data.db', 'workspace'],
        ['xnet.db', 'blobs']
      ] as const) {
        const path = join(recovered.workspace, name)
        const compatibility = inspectDatabase(path, kind)
        if (compatibility.status !== 'supported')
          throw new WorkspaceRecoveryRequired(path, compatibility)
      }
      const { response } = await dialog.showMessageBox({
        type: 'warning',
        title: 'Restore this encrypted backup?',
        message: `Restore the backup from ${new Date(recovered.source.createdAt).toLocaleString()}?`,
        detail:
          'The password, files, and databases have been verified. xNet will keep your current workspace, then restart offline with the recovered identity and data. Browser settings and sign-in sessions are not included.',
        buttons: ['Cancel', 'Restore and restart'],
        defaultId: 0,
        cancelId: 0
      })
      if (response !== 1) return { restored: false }
      const point = await createCheckpoint({
        dataPath: recovered.workspace,
        recoveryPath,
        profile,
        appVersion: app.getVersion(),
        testIdentity: recovered.source.identity === 'test',
        pinned: true
      })
      await flushRenderers()
      await options.stopWriters()
      stopped = true
      await checkpointWorkspace({ writersStopped: true, resume: false })
      await restoreCheckpoint({
        id: point.id,
        dataPath,
        recoveryPath,
        profile,
        allowTestIdentity: process.env.XNET_TEST_BYPASS === 'true'
      })
      await rm(incoming, { recursive: true, force: true })
      app.relaunch()
      app.exit(0)
      return { restored: true }
    } catch (error) {
      reportFailure(error instanceof Error ? error.message : String(error))
      if (stopped) await options.restartWriters()
      throw error
    } finally {
      await rm(incoming, { recursive: true, force: true })
      busy = false
      resumeRenderers()
    }
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
      reportFailure(error instanceof Error ? error.message : String(error))
      if (stopped) await options.restartWriters()
      throw error
    } finally {
      busy = false
      resumeRenderers()
    }
  })
}
