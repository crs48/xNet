/**
 * Permissions pre-flight (exploration 0279 permissions UX).
 *
 * Botless capture on macOS involves TCC prompts the OS fires mid-start; the
 * recorder must say up front which prompt(s) the user is about to see, and —
 * worse — that a *previously denied* Screen Recording permission cannot be
 * re-prompted: the user must enable it in System Settings and macOS only
 * applies the grant after an app restart (restart-after-grant).
 *
 * Pure mapping from the bridge's `permissions()` + `captureStatus()` payloads
 * to renderable notices, plus the small async fetch that feeds it.
 */

import type { MeetingsBridge, MeetingsCaptureStatus, MeetingsPermissions } from './bridge.js'

export interface CapturePreflight {
  /** Permission prompts the user should expect when they hit Start. */
  prompts: string[]
  /**
   * A hard blocker (previously denied permission): what is blocked and how to
   * fix it. Recording can still start — it degrades to mic-only — so this is
   * a warning, not a gate.
   */
  blocker: string | null
}

/** Map pre-flight state to notices. Pure — unit-tested against fake bridges. */
export function describeCapturePreflight(
  permissions: MeetingsPermissions,
  status: Pick<MeetingsCaptureStatus, 'systemAudioPath'>
): CapturePreflight {
  const prompts: string[] = []
  let blocker: string | null = null

  if (permissions.microphone === 'denied' || permissions.microphone === 'restricted') {
    blocker =
      'Microphone access was previously denied. Enable it under System Settings → Privacy & Security → Microphone, then restart the app.'
  } else if (permissions.microphone !== 'granted') {
    prompts.push('macOS will ask for Microphone access (your side of the call).')
  }

  if (status.systemAudioPath === 'chromium-loopback') {
    // Loopback rides getDisplayMedia, which needs Screen Recording TCC.
    if (permissions.systemAudio === 'denied' || permissions.systemAudio === 'restricted') {
      const screenBlocker =
        'Screen Recording access was previously denied, so the other side of the call cannot be captured. Enable it under System Settings → Privacy & Security → Screen & System Audio Recording — macOS applies the change only after the app restarts. Until then, recording runs mic-only.'
      blocker = blocker ? `${blocker} ${screenBlocker}` : screenBlocker
    } else if (permissions.systemAudio !== 'granted') {
      prompts.push(
        'macOS will ask for Screen Recording access — that grant is what lets the app hear the other side of the call (no video is captured, and macOS requires an app restart after granting).'
      )
    }
  } else if (status.systemAudioPath === 'core-audio-tap') {
    // The CATap helper prompts under the (unqueryable) audio-capture TCC
    // category on first capture; nothing to check, just set expectations.
    if (permissions.systemAudio === 'audio-capture-tcc') {
      prompts.push(
        'macOS will ask for System Audio Recording the first time — that grant lets the app hear the other side of the call.'
      )
    }
  }

  return { prompts, blocker }
}

/** Fetch + map the pre-flight state; null when the bridge is unavailable/broken. */
export async function getCapturePreflight(
  bridge: MeetingsBridge | null
): Promise<CapturePreflight | null> {
  if (!bridge?.permissions) return null
  try {
    const [permissions, status] = await Promise.all([bridge.permissions(), bridge.captureStatus()])
    return describeCapturePreflight(permissions, status)
  } catch {
    return null
  }
}
