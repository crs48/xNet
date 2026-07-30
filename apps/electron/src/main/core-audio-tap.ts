/**
 * macOS Core Audio tap capture — the production system-audio path
 * (exploration 0279, phase 3).
 *
 * Spawns the bundled `xnet-audiotee` Swift helper (see
 * `apps/electron/native/audiotee/`), which taps system output via
 * `AudioHardwareCreateProcessTap` (macOS 14.2+/14.4 TCC) and streams mono
 * Float32 PCM over stdout with JSON status lines on stderr. This is the
 * clean-permission route: the helper triggers the **audio-capture** TCC
 * prompt (`NSAudioCaptureUsageDescription`), not Screen Recording.
 *
 * Fallback ladder (resolved by `resolveSystemAudioPath`):
 *   1. Core Audio tap helper — darwin ≥ 14.4 AND the helper binary shipped
 *   2. Chromium loopback flags — darwin/win32 via setDisplayMediaRequestHandler
 *   3. mic-only — the renderer degrades, loudly
 */

import { spawn, type ChildProcess } from 'child_process'
import { existsSync } from 'fs'
import { release } from 'os'
import { join } from 'path'
import { app } from 'electron'

export type SystemAudioPath = 'core-audio-tap' | 'chromium-loopback' | 'none'

/** Darwin major 23 = macOS 14; 14.4 ships darwin 23.4. */
const darwinSupportsTap = (osRelease: string): boolean => {
  const [major, minor] = osRelease.split('.').map((n) => Number.parseInt(n, 10))
  if (!Number.isFinite(major)) return false
  return major > 23 || (major === 23 && (minor ?? 0) >= 4)
}

/** Where the packaged helper lives; dev builds read the SPM output dir. */
export function tapHelperPath(): string {
  if (process.env.XNET_AUDIOTEE_PATH) return process.env.XNET_AUDIOTEE_PATH
  const packaged = join(process.resourcesPath ?? '', 'xnet-audiotee')
  if (app?.isPackaged) return packaged
  return join(app?.getAppPath?.() ?? process.cwd(), 'native/audiotee/.build/release/xnet-audiotee')
}

export function tapAvailable(
  platform: NodeJS.Platform = process.platform,
  osRelease: string = release()
): boolean {
  return platform === 'darwin' && darwinSupportsTap(osRelease) && existsSync(tapHelperPath())
}

/** Which system-audio route this machine gets (the 0279 fallback ladder). */
export function resolveSystemAudioPath(
  platform: NodeJS.Platform = process.platform,
  osRelease: string = release()
): SystemAudioPath {
  if (tapAvailable(platform, osRelease)) return 'core-audio-tap'
  if (platform === 'win32' || platform === 'darwin') return 'chromium-loopback'
  return 'none'
}

export interface TapSession {
  stop(): void
}

/**
 * Start the helper and stream mono Float32 PCM chunks to `onPcm`. `onReady`
 * reports the tap's sample rate; `onError` fires on helper failure (TCC
 * denial included) so the caller can fall down the ladder mid-session.
 */
export function startCoreAudioTap(handlers: {
  onPcm: (samples: Float32Array, sampleRate: number) => void
  onReady?: (sampleRate: number) => void
  onError?: (message: string) => void
}): TapSession {
  let sampleRate = 48_000
  let carry: Buffer = Buffer.alloc(0)
  let child: ChildProcess | null = spawn(tapHelperPath(), [], {
    stdio: ['ignore', 'pipe', 'pipe']
  })

  child.stdout?.on('data', (data: Buffer) => {
    // Float32 frames may split across chunk boundaries — carry the remainder.
    const buf = carry.length > 0 ? Buffer.concat([carry, data]) : data
    const usable = buf.length - (buf.length % 4)
    carry = buf.subarray(usable)
    if (usable === 0) return
    const samples = new Float32Array(usable / 4)
    for (let i = 0; i < samples.length; i++) samples[i] = buf.readFloatLE(i * 4)
    handlers.onPcm(samples, sampleRate)
  })

  child.stderr?.on('data', (data: Buffer) => {
    for (const line of data.toString('utf8').split('\n')) {
      if (!line.trim()) continue
      try {
        const status = JSON.parse(line) as { event: string; sampleRate?: number; message?: string }
        if (status.event === 'ready' && typeof status.sampleRate === 'number') {
          sampleRate = status.sampleRate
          handlers.onReady?.(sampleRate)
        } else if (status.event === 'error') {
          handlers.onError?.(status.message ?? 'audiotee helper error')
        }
      } catch {
        // Non-JSON stderr noise from the helper — ignore.
      }
    }
  })

  child.on('error', (error) => handlers.onError?.(error.message))
  child.on('exit', (code) => {
    if (code !== 0 && code !== null) handlers.onError?.(`audiotee exited with ${code}`)
    child = null
  })

  return {
    stop() {
      child?.kill('SIGTERM')
      child = null
    }
  }
}
