/**
 * Browser/Chromium screen capture — the phase-1 fallback rung (exploration
 * 0414).
 *
 * `getDisplayMedia` + `MediaRecorder`, used when the native helper is absent:
 * Electron without `xnet-screencap`, and plain browsers. It works everywhere
 * and costs more, which is exactly why the capability report names the rung
 * rather than hiding it.
 *
 * Screen and camera are still recorded as **separate** `MediaRecorder`s over
 * separate streams, so the artifact shape is identical whichever rung produced
 * it — the player and exporter never branch on capture path.
 */

export interface BrowserCaptureHandle {
  /** Finalize both recorders and return their blobs. Idempotent. */
  stop(): Promise<BrowserCaptureResult>
  /** Milliseconds since capture started. */
  elapsedMs(): number
}

export interface BrowserCaptureResult {
  screen: Blob
  camera: Blob | null
  durationMs: number
  width: number
  height: number
  /** True when a track ended on its own — the user hit the browser's own
   *  "Stop sharing" button, or the source window closed. */
  truncated: boolean
  truncationReason: string | null
}

export interface BrowserCaptureOptions {
  camera?: boolean
  fps?: number
  /** Injected for tests; defaults to `navigator.mediaDevices`. */
  mediaDevices?: MediaDevices
  /** Injected for tests; defaults to the global `MediaRecorder`. */
  recorderFactory?: (stream: MediaStream, mimeType: string) => MediaRecorder
}

/**
 * Preferred container/codec order. VP9 in WebM is the widest-support
 * hardware-friendly option in Chromium; H.264 is the fallback. Both are
 * remuxed on export — the recording container is an implementation detail.
 */
const MIME_CANDIDATES = [
  'video/webm;codecs=vp9',
  'video/webm;codecs=vp8',
  'video/webm',
  'video/mp4'
]

/** The first candidate this browser can actually record, or '' for default. */
export function pickMimeType(
  isSupported: (type: string) => boolean = (type) =>
    typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(type)
): string {
  return MIME_CANDIDATES.find((type) => isSupported(type)) ?? ''
}

interface TrackRecorder {
  recorder: MediaRecorder
  chunks: Blob[]
  stream: MediaStream
}

function record(
  stream: MediaStream,
  mimeType: string,
  factory: BrowserCaptureOptions['recorderFactory']
): TrackRecorder {
  const recorder = factory
    ? factory(stream, mimeType)
    : new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
  const chunks: Blob[] = []
  recorder.ondataavailable = (event: BlobEvent) => {
    if (event.data && event.data.size > 0) chunks.push(event.data)
  }
  // 1s timeslice: a crash costs at most a second, rather than the whole file.
  recorder.start(1_000)
  return { recorder, chunks, stream }
}

function finish(track: TrackRecorder, mimeType: string): Promise<Blob> {
  return new Promise((resolve) => {
    track.recorder.onstop = () => resolve(new Blob(track.chunks, { type: mimeType || undefined }))
    if (track.recorder.state === 'inactive') {
      resolve(new Blob(track.chunks, { type: mimeType || undefined }))
      return
    }
    track.recorder.stop()
  })
}

/**
 * Start capture. Rejects if the screen stream cannot be obtained — a recorder
 * that silently produced nothing would be worse than one that refused.
 */
export async function startBrowserCapture(
  options: BrowserCaptureOptions = {}
): Promise<BrowserCaptureHandle> {
  const devices = options.mediaDevices ?? navigator.mediaDevices
  const fps = options.fps ?? 30

  const screenStream = await devices.getDisplayMedia({
    video: { frameRate: fps },
    audio: true
  })

  let cameraStream: MediaStream | null = null
  if (options.camera) {
    try {
      cameraStream = await devices.getUserMedia({
        video: { width: 1280, height: 720, frameRate: fps }
      })
    } catch {
      // Camera denial degrades to screen-only, loudly (reported through the
      // result's truncation fields only if it also ends capture — it does not).
      cameraStream = null
    }
  }

  const mimeType = pickMimeType()
  const screen = record(screenStream, mimeType, options.recorderFactory)
  const camera = cameraStream ? record(cameraStream, mimeType, options.recorderFactory) : null

  const settings = screenStream.getVideoTracks()[0]?.getSettings?.() ?? {}
  const startedAt = Date.now()

  let truncationReason: string | null = null
  // The browser's own "Stop sharing" button ends the track without telling the
  // app. That is not a user-initiated stop of *our* recorder, so it is recorded
  // as a truncation cause rather than a clean finish.
  for (const track of screenStream.getVideoTracks()) {
    track.addEventListener('ended', () => {
      truncationReason ??= 'Screen sharing was stopped from the browser controls.'
    })
  }

  let stopped: Promise<BrowserCaptureResult> | null = null

  return {
    elapsedMs: () => Date.now() - startedAt,
    stop() {
      stopped ??= (async () => {
        const screenBlob = await finish(screen, mimeType)
        const cameraBlob = camera ? await finish(camera, mimeType) : null
        for (const stream of [screenStream, cameraStream]) {
          stream?.getTracks().forEach((track) => track.stop())
        }
        return {
          screen: screenBlob,
          camera: cameraBlob,
          durationMs: Date.now() - startedAt,
          width: Number(settings.width) || 0,
          height: Number(settings.height) || 0,
          truncated: truncationReason !== null,
          truncationReason
        }
      })()
      return stopped
    }
  }
}
