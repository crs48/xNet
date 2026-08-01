/**
 * Recording capture IPC (exploration 0414).
 *
 * Restricted to first-party frames, like `meeting-capture-ipc.ts` — plugin
 * code can never reach this surface because the sandbox never endows
 * `window.xnetRecordings`. Screen capture is strictly more sensitive than
 * audio: it can see every window on the machine, including other apps'
 * credentials.
 *
 * Two responsibilities:
 *
 * 1. **Capability reporting.** Which rung of the 0414 ladder this machine
 *    resolves to, whether the helper shipped in a bundle TCC will list, and
 *    the pre-flight permission state — so the recorder explains the prompt
 *    before it fires rather than failing opaquely mid-start.
 * 2. **Helper lifecycle.** Start / stop / progress for `xnet-screencap`. One
 *    session at a time: a second concurrent recording would contend for the
 *    same encoder and produce two degraded files instead of one good one.
 */

import type { WebFrameMain } from 'electron'
import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { app, ipcMain, systemPreferences } from 'electron'
import {
  helperIsBundled,
  resolveVideoCapturePath,
  screencapAvailable,
  screencapHelperPath,
  startScreencap,
  type ScreencapReady,
  type ScreencapSession,
  type ScreencapStopped
} from './screen-capture'

const assertFirstPartyFrame = (frame: WebFrameMain | null): void => {
  const url = frame?.url ?? ''
  const firstParty =
    url.startsWith('file://') || /^https?:\/\/localhost(:\d+)?\//.test(url) || url === ''
  if (!firstParty) {
    throw new Error(`recording capture denied for non-app frame: ${url}`)
  }
}

export interface RecordingCaptureStatus {
  path: ReturnType<typeof resolveVideoCapturePath>
  platform: string
  helperAvailable: boolean
  /**
   * False when the helper shipped as a bare executable. On macOS 26 that
   * layout never appears in the Screen Recording pane, so the permission
   * cannot be granted at all — the UI must say so rather than let the user
   * wait for a prompt that will not come.
   */
  helperBundled: boolean
  recording: boolean
}

export function recordingCaptureStatus(): RecordingCaptureStatus {
  const available = screencapAvailable()
  return {
    path: resolveVideoCapturePath(),
    platform: process.platform,
    helperAvailable: available,
    helperBundled: available ? helperIsBundled(screencapHelperPath()) : false,
    recording: active !== null
  }
}

/** TCC state for the two prompts a recording can trigger. */
export function recordingPermissions(): { screen: string; camera: string } {
  if (process.platform !== 'darwin') {
    return { screen: 'not-required', camera: 'not-required' }
  }
  return {
    screen: systemPreferences.getMediaAccessStatus('screen'),
    camera: systemPreferences.getMediaAccessStatus('camera')
  }
}

interface ActiveSession {
  session: ScreencapSession
  ready: ScreencapReady
  outputDir: string
  startedAt: number
  /** Set when the helper reported a fatal error mid-session. */
  failure: string | null
}

let active: ActiveSession | null = null

export interface StartRecordingRequest {
  displayId?: number
  camera?: boolean
  fps?: number
}

export interface StartRecordingResult extends ScreencapReady {
  outputDir: string
  startedAt: number
}

/**
 * The stop result. `truncated` is the load-bearing field: a session that ended
 * because the helper died, the disk filled, or a permission was revoked is NOT
 * a completed recording, and the node it produces must say so (root AGENTS.md:
 * "a truncated run is not a completed one").
 */
export interface StopRecordingResult extends ScreencapStopped {
  screenPath: string
  cameraPath: string | null
  truncated: boolean
  truncationReason: string | null
}

export function setupRecordingCaptureIPC(): void {
  ipcMain.handle('xnet:recordings:capture-status', (event) => {
    assertFirstPartyFrame(event.senderFrame)
    return recordingCaptureStatus()
  })

  ipcMain.handle('xnet:recordings:permissions', (event) => {
    assertFirstPartyFrame(event.senderFrame)
    return recordingPermissions()
  })

  ipcMain.handle(
    'xnet:recordings:start',
    async (event, request: StartRecordingRequest = {}): Promise<StartRecordingResult> => {
      assertFirstPartyFrame(event.senderFrame)

      if (active) {
        throw new Error('a recording is already in progress')
      }
      if (!screencapAvailable()) {
        // Refuse rather than silently doing nothing — the renderer's fallback
        // to the Chromium path is a deliberate decision it makes on the
        // capability report, not something this handler should paper over.
        throw new Error('screencap helper is not available on this machine')
      }

      const outputDir = mkdtempSync(join(app?.getPath?.('temp') ?? tmpdir(), 'xnet-recording-'))
      const sender = event.sender

      const { session, ready } = await startScreencap(
        { outputDir, displayId: request.displayId, camera: request.camera, fps: request.fps },
        {
          onProgress: (progress) => {
            if (!sender.isDestroyed()) sender.send('xnet:recordings:progress', progress)
          },
          onError: (message, fatal) => {
            if (fatal && active) active.failure = message
            if (!sender.isDestroyed()) {
              sender.send('xnet:recordings:error', { message, fatal })
            }
          }
        }
      )

      const startedAt = Date.now()
      active = { session, ready, outputDir, startedAt, failure: null }
      return { ...ready, outputDir, startedAt }
    }
  )

  ipcMain.handle('xnet:recordings:stop', async (event): Promise<StopRecordingResult> => {
    assertFirstPartyFrame(event.senderFrame)

    const current = active
    if (!current) throw new Error('no recording in progress')
    active = null

    try {
      const stopped = await current.session.stop()
      return {
        ...stopped,
        screenPath: current.ready.screenPath,
        cameraPath: current.ready.cameraPath,
        truncated: current.failure !== null,
        truncationReason: current.failure
      }
    } catch (error) {
      // The helper died before finalizing. Whatever is on disk is a partial
      // file; report it as truncated with the real reason rather than as a
      // shorter-than-expected success.
      const message = error instanceof Error ? error.message : String(error)
      return {
        durationMs: 0,
        droppedFrames: 0,
        screenPath: current.ready.screenPath,
        cameraPath: current.ready.cameraPath,
        truncated: true,
        truncationReason: current.failure ?? message
      }
    }
  })
}

/** Stop any in-flight recording — called on app quit so files are finalized. */
export async function shutdownRecordingCapture(): Promise<void> {
  const current = active
  if (!current) return
  active = null
  try {
    await current.session.stop()
  } catch {
    // Quitting; the partial file is already on disk and the node, if one was
    // created, is marked truncated by the stop handler that will not run.
  }
}
