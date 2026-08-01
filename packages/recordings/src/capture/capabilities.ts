/**
 * Video capture-tier detection (exploration 0414).
 *
 * The audio equivalent lives in `@xnetjs/meetings/capture/capabilities` and
 * this deliberately mirrors its shape: a pure function over platform hints
 * that returns a tier *plus the sentence the UI shows*. A recorder that
 * silently records at a worse tier than the user expects is the same class of
 * bug as a transcript that quietly drops a speaker — the scope must be stated
 * before the red button, not discovered in the file afterwards.
 *
 * Rungs, best to worst:
 *
 * 1. `screencapturekit-helper` — the bundled Swift helper. Hardware encode,
 *    the system recording indicator, camera as a separate track.
 * 2. `chromium-desktop-capturer` — Electron without the helper. Works
 *    everywhere Electron does; costs more CPU and shows no menu-bar indicator.
 * 3. `display-media` — a plain browser tab. Screen only, no camera track.
 * 4. `none` — no capture path at all.
 */

import type { CapturePathId } from '@xnetjs/data'

export type VideoCapturePath = CapturePathId

export interface VideoCaptureHints {
  /** Running inside the Electron shell (the preload sets this). */
  isElectron?: boolean
  /** Electron main reports the bundled screen-capture helper is present. */
  electronScreenHelper?: boolean
  /** `navigator.mediaDevices.getDisplayMedia` exists. */
  displayMedia?: boolean
  /** A camera device is present and permitted. */
  camera?: boolean
  /** Capacitor/mobile shell — no screen capture surface at all today. */
  isMobile?: boolean
}

export interface VideoCaptureCapability {
  path: VideoCapturePath
  /** Whether a separate camera track can be recorded alongside the screen. */
  cameraTrack: boolean
  /** Whether the OS shows its own recording indicator during capture. */
  systemIndicator: boolean
  /** One sentence for the pre-flight UI describing exactly what is recorded. */
  scopeMessage: string
}

export function detectVideoCapability(hints: VideoCaptureHints): VideoCaptureCapability {
  if (hints.isElectron && hints.electronScreenHelper) {
    return {
      path: 'screencapturekit-helper',
      cameraTrack: hints.camera === true,
      systemIndicator: true,
      scopeMessage:
        'Recording your screen with hardware encoding, plus your camera as a separate track. ' +
        'macOS shows its own recording indicator while this runs.'
    }
  }

  if (hints.isElectron) {
    return {
      path: 'chromium-desktop-capturer',
      cameraTrack: hints.camera === true,
      systemIndicator: false,
      scopeMessage:
        'Recording your screen through the built-in capture path — this uses more CPU than the ' +
        'native helper and the system does not show its own recording indicator.'
    }
  }

  if (hints.isMobile) {
    return {
      path: 'none',
      cameraTrack: false,
      systemIndicator: false,
      scopeMessage: 'Screen recording is not available on mobile — use the desktop app.'
    }
  }

  if (hints.displayMedia) {
    return {
      path: 'display-media',
      cameraTrack: false,
      systemIndicator: false,
      scopeMessage:
        'Recording one screen or window you pick in the browser prompt. No camera track — ' +
        'use the desktop app to record your camera alongside your screen.'
    }
  }

  return {
    path: 'none',
    cameraTrack: false,
    systemIndicator: false,
    scopeMessage: 'This browser cannot record the screen. Use the desktop app.'
  }
}

/** Ordered best-to-worst, so a caller can explain what an upgrade would buy. */
export const CAPTURE_PATH_RANK: readonly VideoCapturePath[] = [
  'screencapturekit-helper',
  'chromium-desktop-capturer',
  'display-media',
  'unknown'
]

/** True when `a` is a strictly better capture rung than `b`. */
export function isBetterPath(a: VideoCapturePath, b: VideoCapturePath): boolean {
  return CAPTURE_PATH_RANK.indexOf(a) < CAPTURE_PATH_RANK.indexOf(b)
}
