/**
 * Recorder pre-flight (exploration 0414, phase 1).
 *
 * The recorder must state what it will capture, and which prompts are about to
 * fire, *before* the red button — not discover it in the file afterwards. This
 * module is the pure decision: given the bridge's capability report and the
 * TCC state, what can this machine do, what should the user be told, and is
 * starting even possible.
 *
 * Every blocking condition carries a `remedy` naming the exact place to fix
 * it. "Permission denied" with no path forward is the failure mode this
 * replaces.
 */

import type { CapturePathId } from '@xnetjs/data'
import type { RecordingCaptureStatus, RecordingPermissions } from './bridge'

export type PreflightSeverity = 'info' | 'warning' | 'blocker'

export interface PreflightNotice {
  severity: PreflightSeverity
  message: string
  /** Where the user goes to resolve it, when there is somewhere to go. */
  remedy?: string
}

export interface Preflight {
  path: CapturePathId
  /** Whether recording can start at all. */
  canRecord: boolean
  /** Whether a camera track can be included. */
  cameraAvailable: boolean
  notices: PreflightNotice[]
}

export interface PreflightInput {
  /** Null on web — the browser path is then the only option. */
  status: RecordingCaptureStatus | null
  permissions: RecordingPermissions | null
  /** Whether `navigator.mediaDevices.getDisplayMedia` exists. */
  displayMedia: boolean
  /** Whether the user asked to include their camera. */
  wantsCamera: boolean
  /** Free disk space in bytes, when the host can report it. */
  freeDiskBytes?: number
}

/**
 * Roughly 10 minutes of 1080p30 screen capture. Below this, a recording is
 * likely to hit the disk before the user is finished — better to say so up
 * front than to truncate mid-sentence.
 */
export const LOW_DISK_BYTES = 500 * 1024 * 1024

export function evaluatePreflight(input: PreflightInput): Preflight {
  const notices: PreflightNotice[] = []
  const { status, permissions } = input

  const path: CapturePathId = status
    ? status.path
    : input.displayMedia
      ? 'display-media'
      : 'unknown'

  let canRecord = path !== 'unknown'
  let cameraAvailable = path !== 'display-media' && path !== 'unknown'

  if (path === 'unknown') {
    notices.push({
      severity: 'blocker',
      message: 'This device cannot record the screen.',
      remedy: 'Use the xNet desktop app on macOS or Windows.'
    })
  }

  if (path === 'display-media') {
    notices.push({
      severity: 'info',
      message:
        'Recording in the browser: you pick one screen or window, and no camera track is captured.',
      remedy: 'Use the desktop app to record your camera alongside your screen.'
    })
  }

  if (path === 'chromium-desktop-capturer') {
    notices.push({
      severity: 'warning',
      message:
        'Recording through the built-in capture path. This uses more CPU than the native helper, ' +
        'and macOS will not show its own recording indicator.',
      remedy: 'Reinstall xNet to restore the native recording helper.'
    })
  }

  // The macOS 26 trap: a helper that exists but is not bundled can never be
  // granted Screen Recording, so the prompt the user is waiting for will never
  // appear. Say that, rather than letting them wait.
  if (status?.helperAvailable && !status.helperBundled && status.platform === 'darwin') {
    notices.push({
      severity: 'warning',
      message:
        'The recording helper is installed but not registered with macOS privacy settings, ' +
        'so it cannot be granted Screen Recording permission.',
      remedy: 'Reinstall xNet — this build shipped the helper in an unsupported layout.'
    })
  }

  if (permissions) {
    if (permissions.screen === 'denied' || permissions.screen === 'restricted') {
      canRecord = false
      notices.push({
        severity: 'blocker',
        message: 'Screen Recording permission is denied, so nothing can be captured.',
        remedy: 'System Settings → Privacy & Security → Screen & System Audio Recording → xNet.'
      })
    } else if (permissions.screen === 'not-determined') {
      notices.push({
        severity: 'info',
        message: 'macOS will ask for Screen Recording permission when you start.'
      })
    }

    if (input.wantsCamera) {
      if (permissions.camera === 'denied' || permissions.camera === 'restricted') {
        cameraAvailable = false
        notices.push({
          severity: 'warning',
          message: 'Camera permission is denied — this will record your screen only.',
          remedy: 'System Settings → Privacy & Security → Camera → xNet.'
        })
      } else if (permissions.camera === 'not-determined') {
        notices.push({
          severity: 'info',
          message: 'macOS will ask for Camera permission when you start.'
        })
      }
    }
  }

  if (status?.recording) {
    canRecord = false
    notices.push({
      severity: 'blocker',
      message: 'A recording is already in progress.',
      remedy: 'Stop the current recording before starting another.'
    })
  }

  if (input.freeDiskBytes !== undefined && input.freeDiskBytes < LOW_DISK_BYTES) {
    notices.push({
      severity: 'warning',
      message: `Only ${Math.round(input.freeDiskBytes / (1024 * 1024))} MB of disk space is free — a long recording will stop early.`,
      remedy: 'Free up space before recording anything long.'
    })
  }

  if (input.wantsCamera && !cameraAvailable && path === 'display-media') {
    // Already explained by the browser notice above; do not stack a second one.
  }

  return { path, canRecord, cameraAvailable: cameraAvailable && input.wantsCamera, notices }
}

/** The one sentence shown next to the record button. */
export function scopeSentence(preflight: Preflight): string {
  switch (preflight.path) {
    case 'screencapturekit-helper':
      return preflight.cameraAvailable
        ? 'Recording your screen and camera as separate tracks. macOS shows its own recording indicator.'
        : 'Recording your screen. macOS shows its own recording indicator.'
    case 'chromium-desktop-capturer':
      return preflight.cameraAvailable
        ? 'Recording your screen and camera. No system recording indicator is shown.'
        : 'Recording your screen. No system recording indicator is shown.'
    case 'display-media':
      return 'Recording the one screen or window you pick next. No camera track.'
    default:
      return 'Screen recording is not available on this device.'
  }
}
