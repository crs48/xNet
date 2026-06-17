# @xnetjs/dictation

Provider-agnostic, **on-device** speech-to-text for xNet — the pure-logic
foundation behind in-app dictation, system-wide push-to-talk, and searchable
transcription history.

This package contains **no platform or native code**. It defines the seam every
speech-to-text backend plugs into and the logic that surrounds it:

- **`DictationEngine`** — the port. whisper.cpp, NVIDIA Parakeet (via
  sherpa-onnx / FluidAudio), Apple `SpeechAnalyzer`, or a remote OpenAI-compatible
  server all implement this one interface, so engines swap without touching UI —
  the same pattern `@xnetjs/billing` uses for `PaymentProvider`.
- **Hold-to-talk state machine** (`dictationReducer` / `DictationMachine`) — the
  press-hold-release-insert workflow as a pure, timer-free reducer. A too-short
  hold is discarded as an accidental tap.
- **Retention** (`applyRetention`) — "keep last N / auto-prune after X days",
  with starred items pinned.
- **Transcript shaping** (`buildTranscriptionFields`, `normalizeTranscriptText`)
  — tidy recognizer output and assemble the field values for a `Transcription`
  node.
- **`EngineRegistry`** — register the engines available on this platform, pick a
  default, `resolve(id)` from Settings.
- **Zero-native engines** — `FakeDictationEngine` (tests/dev) and
  `ByoEndpointEngine` (point at any local OpenAI `/v1/audio/transcriptions`
  server, e.g. the achetronic/parakeet sidecar).

## Example

```ts
import {
  EngineRegistry,
  ByoEndpointEngine,
  DictationMachine,
  buildTranscriptionFields
} from '@xnetjs/dictation'

const registry = new EngineRegistry()
registry.register(new ByoEndpointEngine({ baseUrl: 'http://127.0.0.1:5092', model: 'parakeet' }))

const machine = new DictationMachine({ minHoldMs: 200 })
machine.dispatch({ type: 'keyDown', at: performance.now() })
// …user speaks; on key release we record the clip…
machine.dispatch({ type: 'keyUp', at: performance.now() })

const engine = registry.resolve()!
const result = await engine.transcribe({ kind: 'encoded', bytes, mimeType: 'audio/wav' })
machine.dispatch({ type: 'result', result })

const fields = buildTranscriptionFields(result, 'pushToTalk') // → store as a Transcription node
```

See `docs/explorations/0192_[_]_ON_DEVICE_SPEECH_TO_TEXT_DICTATION.md` for the
full architecture, the platform-engine plan, and the push-to-talk / OS-plumbing
design.

Zero runtime dependencies. MIT.
