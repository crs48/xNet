/**
 * Capture-tier detection (exploration 0279).
 *
 * The platforms dictate what a meeting recorder can hear; the UI must state
 * that scope up front so a user on Safari never wonders why the Zoom desktop
 * client is inaudible. Pure function over platform hints — the hints come from
 * the host app (Electron preload, `navigator` sniffing on web, Capacitor).
 */

export type CaptureTier =
  /** Mic + true system audio (Electron desktop with loopback/helper). */
  | 'system-audio'
  /** Mic + the audio of one shared browser tab (Chrome getDisplayMedia). */
  | 'tab-audio'
  /** Microphone only (Safari/Firefox web, mobile in-person mode). */
  | 'mic-only'

export interface CapturePlatformHints {
  /** Running inside the Electron shell (preload sets this). */
  isElectron?: boolean
  /** Electron: the main process reports loopback/helper capture is available. */
  electronSystemAudio?: boolean
  /** Web: `getDisplayMedia` exists and the browser honors `audio: true` (Chromium). */
  displayMediaAudio?: boolean
  /** Capacitor/mobile shell. */
  isMobile?: boolean
}

export interface CaptureCapability {
  tier: CaptureTier
  /** One sentence for the recorder UI describing what will be heard. */
  scopeMessage: string
}

export function detectCaptureCapability(hints: CapturePlatformHints): CaptureCapability {
  if (hints.isElectron && hints.electronSystemAudio) {
    return {
      tier: 'system-audio',
      scopeMessage:
        'Capturing your microphone and everything this computer plays — works with any meeting app.'
    }
  }
  if (hints.isMobile || hints.isElectron) {
    // Electron without system audio (permission denied / helper missing)
    // degrades to the same mic-only mode as mobile.
    return {
      tier: 'mic-only',
      scopeMessage: 'Capturing your microphone only — best for in-person meetings or speakerphone.'
    }
  }
  if (hints.displayMediaAudio) {
    return {
      tier: 'tab-audio',
      scopeMessage:
        'Capturing your microphone plus the audio of one shared browser tab. Desktop meeting apps (e.g. the Zoom app) are not audible — use the desktop app for that.'
    }
  }
  return {
    tier: 'mic-only',
    scopeMessage:
      'This browser can only capture your microphone. The other side of a call is not audible — use the desktop app for full capture.'
  }
}
