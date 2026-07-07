/**
 * Meeting capture IPC (exploration 0279).
 *
 * Two responsibilities, both gated by the `systemAudio` module capability
 * (the 0270 guardFs pattern — the grant is asserted at the IPC boundary, the
 * one choke point renderer code cannot route around):
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
import { meetingsFeatureModule } from '@xnetjs/meetings'
import { assertSystemAudio } from '@xnetjs/plugins'
import { app, ipcMain, session } from 'electron'
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
 * Assert the caller may use system audio. First-party surfaces run under the
 * meetings module's own grant; the frame origin is recorded in the error for
 * diagnostics when a non-granted caller probes the channel.
 */
const assertCapability = (frame: WebFrameMain | null): void => {
  assertSystemAudio(meetingsFeatureModule.capabilities, frame?.url ?? meetingsFeatureModule.id)
}

export function setupMeetingCaptureIPC(): void {
  ipcMain.handle('xnet:meetings:capture-status', () => ({
    systemAudioAvailable: systemAudioAvailable(),
    platform: process.platform,
    loopbackArmed
  }))

  // Arm loopback for the next getDisplayMedia call from the renderer.
  ipcMain.handle('xnet:meetings:arm-loopback', (event) => {
    assertCapability(event.senderFrame)
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
    assertCapability(event.senderFrame)
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
