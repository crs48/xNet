/**
 * macOS ScreenCaptureKit capture path — the production video route
 * (exploration 0414, phase 2).
 *
 * Spawns the bundled `xnet-screencap` Swift helper (see
 * `apps/electron/native/screencap/`), which captures the display with
 * ScreenCaptureKit, optionally the camera with AVCaptureDevice, encodes both
 * with VideoToolbox and writes one MP4 per track. Frames never cross into
 * Node or the renderer — the helper hands back file paths, which is what makes
 * the Electron shell irrelevant to capture cost (0414 §Options, option B).
 *
 * Fallback ladder (resolved by `resolveVideoCapturePath`):
 *   1. ScreenCaptureKit helper — darwin ≥ 12.3 AND the helper binary shipped
 *   2. Chromium `desktopCapturer` + `MediaRecorder` in the renderer
 *   3. `getDisplayMedia` in a plain browser — not this process's problem
 *
 * > [!WARNING]
 * > macOS 26 (Tahoe) evaluates Screen Recording TCC against the *responsible
 * > process* and no longer lists plain non-bundled executables in the Screen
 * > Recording pane at all. A bare Mach-O in `Resources/` is exactly that shape.
 * > `helperIsBundled()` reports which layout shipped so the pre-flight can warn
 * > instead of hanging on a permission dialog that will never appear.
 */

import type { ChildProcess } from 'child_process'
import { spawn } from 'child_process'
import { existsSync } from 'fs'
import { release } from 'os'
import { join } from 'path'
import { app } from 'electron'

export type VideoCapturePath =
  | 'screencapturekit-helper'
  | 'chromium-desktop-capturer'
  | 'display-media'
  | 'unknown'

/** Darwin major 21.4 = macOS 12.3, the ScreenCaptureKit floor. */
export function darwinSupportsScreenCaptureKit(osRelease: string): boolean {
  const [major, minor] = osRelease.split('.').map((n) => Number.parseInt(n, 10))
  if (!Number.isFinite(major)) return false
  return major > 21 || (major === 21 && (minor ?? 0) >= 4)
}

/**
 * Where the packaged helper lives. Two layouts are supported: a bundled
 * `.app` (required for a TCC entry on macOS 26) and the bare binary the dev
 * build produces from the SPM output directory.
 */
export function screencapHelperPath(): string {
  if (process.env.XNET_SCREENCAP_PATH) return process.env.XNET_SCREENCAP_PATH

  if (app?.isPackaged) {
    const resources = process.resourcesPath ?? ''
    const bundled = join(resources, 'xnet-screencap.app', 'Contents', 'MacOS', 'xnet-screencap')
    return existsSync(bundled) ? bundled : join(resources, 'xnet-screencap')
  }

  return join(
    app?.getAppPath?.() ?? process.cwd(),
    'native/screencap/.build/release/xnet-screencap'
  )
}

/**
 * Whether the helper shipped inside an `.app` bundle. On macOS 26 a bare
 * executable never appears in the Screen Recording pane, so the user cannot
 * grant the permission the helper needs — the pre-flight has to say so rather
 * than let them wait for a prompt that is not coming.
 */
export function helperIsBundled(path: string = screencapHelperPath()): boolean {
  return path.includes('.app/Contents/MacOS/')
}

export function screencapAvailable(
  platform: NodeJS.Platform = process.platform,
  osRelease: string = release()
): boolean {
  return (
    platform === 'darwin' &&
    darwinSupportsScreenCaptureKit(osRelease) &&
    existsSync(screencapHelperPath())
  )
}

/** Which video-capture route this machine gets (the 0414 fallback ladder). */
export function resolveVideoCapturePath(
  platform: NodeJS.Platform = process.platform,
  osRelease: string = release()
): VideoCapturePath {
  if (screencapAvailable(platform, osRelease)) return 'screencapturekit-helper'
  if (platform === 'darwin' || platform === 'win32' || platform === 'linux') {
    return 'chromium-desktop-capturer'
  }
  return 'unknown'
}

export interface ScreencapReady {
  width: number
  height: number
  fps: number
  screenPath: string
  /** Null when no camera track was recorded (declined, denied or absent). */
  cameraPath: string | null
}

export interface ScreencapStopped {
  durationMs: number
  droppedFrames: number
}

export interface ScreencapSession {
  /** Ask the helper to finalize its files. Resolves once they are closed. */
  stop(): Promise<ScreencapStopped>
}

export interface ScreencapHandlers {
  onReady?: (info: ScreencapReady) => void
  onProgress?: (progress: ScreencapStopped) => void
  /**
   * `fatal` means the recording ended. A non-fatal error is a degradation
   * worth telling the user about (camera unavailable, frames dropping) that
   * did not stop capture.
   */
  onError?: (message: string, fatal: boolean) => void
}

export interface ScreencapOptions {
  /** Directory the helper writes `screen.mp4` / `camera.mp4` into. */
  outputDir: string
  displayId?: number
  camera?: boolean
  fps?: number
}

/**
 * Start the helper. Rejects if it dies before reporting `ready`, so a caller
 * never receives a session handle for a recording that is not running.
 */
export function startScreencap(
  options: ScreencapOptions,
  handlers: ScreencapHandlers = {}
): Promise<{ session: ScreencapSession; ready: ScreencapReady }> {
  const args = ['--out', options.outputDir]
  if (options.displayId !== undefined) args.push('--display', String(options.displayId))
  if (options.camera) args.push('--camera')
  if (options.fps) args.push('--fps', String(options.fps))

  return new Promise((resolve, reject) => {
    let child: ChildProcess | null = spawn(screencapHelperPath(), args, {
      stdio: ['ignore', 'ignore', 'pipe']
    })

    let settled = false
    let lastProgress: ScreencapStopped = { durationMs: 0, droppedFrames: 0 }
    let stopResolve: ((value: ScreencapStopped) => void) | null = null
    let stopReject: ((error: Error) => void) | null = null
    let carry = ''

    const session: ScreencapSession = {
      stop() {
        if (!child) return Promise.resolve(lastProgress)
        return new Promise<ScreencapStopped>((resolveStop, rejectStop) => {
          stopResolve = resolveStop
          stopReject = rejectStop
          child?.kill('SIGTERM')
        })
      }
    }

    const handleStatus = (status: Record<string, unknown>): void => {
      switch (status.event) {
        case 'ready': {
          const ready: ScreencapReady = {
            width: Number(status.width),
            height: Number(status.height),
            fps: Number(status.fps),
            screenPath: String(status.screenPath),
            cameraPath: typeof status.cameraPath === 'string' ? status.cameraPath : null
          }
          handlers.onReady?.(ready)
          if (!settled) {
            settled = true
            resolve({ session, ready })
          }
          break
        }
        case 'progress': {
          lastProgress = {
            durationMs: Number(status.durationMs) || 0,
            droppedFrames: Number(status.droppedFrames) || 0
          }
          handlers.onProgress?.(lastProgress)
          break
        }
        case 'stopped': {
          lastProgress = {
            durationMs: Number(status.durationMs) || 0,
            droppedFrames: Number(status.droppedFrames) || 0
          }
          stopResolve?.(lastProgress)
          stopResolve = null
          stopReject = null
          break
        }
        case 'error': {
          const message = String(status.message ?? 'screencap helper error')
          const fatal = status.fatal !== false
          handlers.onError?.(message, fatal)
          if (fatal && !settled) {
            settled = true
            reject(new Error(message))
          }
          break
        }
      }
    }

    child.stderr?.on('data', (data: Buffer) => {
      // Status lines can split across chunk boundaries — carry the remainder.
      carry += data.toString('utf8')
      const lines = carry.split('\n')
      carry = lines.pop() ?? ''
      for (const line of lines) {
        if (!line.trim()) continue
        try {
          handleStatus(JSON.parse(line) as Record<string, unknown>)
        } catch {
          // Non-JSON stderr noise from the helper — ignore.
        }
      }
    })

    child.on('error', (error) => {
      handlers.onError?.(error.message, true)
      if (!settled) {
        settled = true
        reject(error)
      }
    })

    child.on('exit', (code) => {
      child = null
      if (code !== 0 && code !== null) {
        const message = `screencap exited with ${code}`
        handlers.onError?.(message, true)
        if (!settled) {
          settled = true
          reject(new Error(message))
        }
      }
      // An exit without a `stopped` line means the files were never finalized.
      // Resolving with the last progress would report a truncated recording as
      // a complete one, so `stop()` rejects instead.
      if (stopResolve) {
        stopResolve = null
        stopReject?.(new Error(`screencap exited before finalizing (code ${code})`))
        stopReject = null
      }
    })
  })
}
