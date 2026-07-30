/**
 * Meeting capture IPC (exploration 0279).
 *
 * Two responsibilities, both restricted to first-party frames (see
 * `assertFirstPartyFrame`). The `systemAudio` ModuleCapability — the 0270
 * guardFs pattern — is declared on the meetings feature module and enforced
 * with its consent flow in `@xnetjs/plugins`; plugin code cannot reach this
 * IPC because the sandbox never endows `window.xnetMeetings`.
 *
 * 1. **System-audio loopback.** While a capture session is armed, Electron's
 *    `setDisplayMediaRequestHandler` answers the renderer's
 *    `getDisplayMedia({ audio: true })` with `audio: 'loopback'` — WASAPI
 *    loopback on Windows (first-class), Chromium's flag-gated loopback on
 *    macOS 13+ (see the feature flags appended in `index.ts`; the production
 *    macOS path is the phase-3 Core Audio tap helper).
 *
 * 2. **Native engine hosting.** The Parakeet/whisper.cpp engines run here in
 *    the main process (optional native addons + big models never touch the
 *    renderer); the renderer's registry reaches them through
 *    `xnet:meetings:transcribe`, keeping the `DictationEngine` port intact
 *    across the process boundary.
 */

import type { EngineDescriptor, ModelDownloadProgress } from '@xnetjs/dictation'
import type { WebFrameMain } from 'electron'
import { join } from 'path'
import { EngineRegistry } from '@xnetjs/dictation'
import { app, ipcMain, session, systemPreferences } from 'electron'
import { resolveSystemAudioPath, startCoreAudioTap, type TapSession } from './core-audio-tap'
import { ParakeetSherpaEngine } from './engines/parakeet-sherpa'
import { WhisperCppEngine } from './engines/whisper-cpp'

/** Loopback works out of the box on Windows; macOS 13+ behind Chromium flags. */
export function systemAudioAvailable(platform: NodeJS.Platform = process.platform): boolean {
  return platform === 'win32' || platform === 'darwin'
}

let loopbackArmed = false
let registry: EngineRegistry | null = null

const engineRegistry = (): EngineRegistry => {
  if (!registry) {
    const baseDir = join(app.getPath('userData'), 'dictation')
    registry = new EngineRegistry()
    // Parakeet v2 first → registry default; English sessions land here.
    registry.register(new ParakeetSherpaEngine({ modelDir: join(baseDir, 'parakeet-v2') }))
    registry.register(new WhisperCppEngine({ modelDir: join(baseDir, 'whisper') }))
  }
  return registry
}

export type MeetingEngineStatus = EngineDescriptor & { ready: boolean }

/**
 * Only the app's own renderer may reach the capture surface. Plugin code never
 * gets here at all: the sandbox does not endow `window.xnetMeetings`, and a
 * plugin requesting capture goes through the `systemAudio` ModuleCapability
 * consent flow in `@xnetjs/plugins` (guards + danger consent line live there —
 * deliberately NOT imported into the main bundle, which stays dependency-light).
 * This frame check is the main-process backstop for anything else that might
 * end up in the session (e.g. a webview).
 */
const assertFirstPartyFrame = (frame: WebFrameMain | null): void => {
  const url = frame?.url ?? ''
  const firstParty =
    url.startsWith('file://') || /^https?:\/\/localhost(:\d+)?\//.test(url) || url === ''
  if (!firstParty) {
    throw new Error(`meeting capture denied for non-app frame: ${url}`)
  }
}

export function setupMeetingCaptureIPC(): void {
  ipcMain.handle('xnet:meetings:capture-status', () => ({
    systemAudioAvailable: systemAudioAvailable(),
    platform: process.platform,
    loopbackArmed,
    // The 0279 fallback ladder position this machine resolves to.
    systemAudioPath: resolveSystemAudioPath()
  }))

  // Pre-flight permission state, so the recorder can explain the exact TCC
  // prompt the user is about to see (and detect a prior denial) instead of
  // failing opaquely mid-start (0279 permissions UX).
  ipcMain.handle('xnet:meetings:permissions', () => {
    if (process.platform !== 'darwin') {
      return { microphone: 'granted', systemAudio: 'not-required' }
    }
    return {
      microphone: systemPreferences.getMediaAccessStatus('microphone'),
      // Chromium-loopback needs Screen Recording; the CATap helper triggers
      // the (unqueryable pre-prompt) audio-capture category instead.
      systemAudio:
        resolveSystemAudioPath() === 'core-audio-tap'
          ? 'audio-capture-tcc'
          : systemPreferences.getMediaAccessStatus('screen')
    }
  })

  // --- Core Audio tap streaming (macOS 14.4+, production path) -------------

  let tap: TapSession | null = null
  ipcMain.handle('xnet:meetings:start-tap', (event) => {
    assertFirstPartyFrame(event.senderFrame)
    if (resolveSystemAudioPath() !== 'core-audio-tap') return { started: false }
    const sender = event.sender
    tap?.stop()
    tap = startCoreAudioTap({
      onPcm: (samples, sampleRate) => {
        if (!sender.isDestroyed()) sender.send('xnet:meetings:tap-pcm', { samples, sampleRate })
      },
      onError: (message) => {
        // Degrade mid-session: the renderer drops to the next ladder rung.
        if (!sender.isDestroyed()) sender.send('xnet:meetings:tap-error', { message })
      }
    })
    return { started: true }
  })

  ipcMain.handle('xnet:meetings:stop-tap', () => {
    tap?.stop()
    tap = null
    return { started: false }
  })

  // Arm loopback for the next getDisplayMedia call from the renderer.
  ipcMain.handle('xnet:meetings:arm-loopback', (event) => {
    assertFirstPartyFrame(event.senderFrame)
    if (!systemAudioAvailable()) return { armed: false }

    loopbackArmed = true
    session.defaultSession.setDisplayMediaRequestHandler(
      (_request, callback) => {
        if (!loopbackArmed) {
          callback({})
          return
        }
        // Audio-only capture: no video track leaves the handler. Chromium
        // requires the video key in the request, but we grant none.
        callback({ audio: 'loopback' })
      },
      { useSystemPicker: false }
    )
    return { armed: true }
  })

  ipcMain.handle('xnet:meetings:disarm-loopback', (event) => {
    assertFirstPartyFrame(event.senderFrame)
    loopbackArmed = false
    session.defaultSession.setDisplayMediaRequestHandler(null)
    return { armed: false }
  })

  // --- Native engine hosting (Parakeet / whisper.cpp) ----------------------

  ipcMain.handle('xnet:meetings:engines', async (): Promise<MeetingEngineStatus[]> => {
    const reg = engineRegistry()
    return Promise.all(
      reg.list().map(async (descriptor) => ({
        ...descriptor,
        ready: (await reg.get(descriptor.id)?.isReady()) ?? false
      }))
    )
  })

  ipcMain.handle('xnet:meetings:ensure-engine', async (event, engineId: string) => {
    const engine = engineRegistry().get(engineId)
    if (!engine) throw new Error(`Unknown dictation engine '${engineId}'`)
    let last: ModelDownloadProgress = { fraction: 0 }
    await engine.ensureModel((progress) => {
      last = progress
      // Progress events stream back on a dedicated channel per engine.
      event.sender.send(`xnet:meetings:engine-progress:${engineId}`, progress)
    })
    return last
  })

  ipcMain.handle(
    'xnet:meetings:transcribe',
    async (
      _event,
      request: {
        engineId: string
        samples: Float32Array
        sampleRate: number
        language?: string
      }
    ) => {
      const engine = engineRegistry().get(request.engineId)
      if (!engine) throw new Error(`Unknown dictation engine '${request.engineId}'`)
      // Structured clone delivers a real Float32Array; guard anyway because a
      // copy through JSON (tests, older bridges) degrades to a plain array.
      const samples =
        request.samples instanceof Float32Array
          ? request.samples
          : Float32Array.from(request.samples as unknown as number[])
      return engine.transcribe(
        { kind: 'pcm', samples, sampleRate: request.sampleRate },
        { language: request.language }
      )
    }
  )
}

/** Test seam: reset module state between specs. */
export function __resetMeetingCaptureForTests(): void {
  loopbackArmed = false
  registry = null
}
