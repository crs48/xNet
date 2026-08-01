---
'@xnetjs/data': minor
---

Add the `Recording` and `RecordingTranscript` schemas for local-first screen
recording (exploration 0414).

A `Recording` holds immutable screen and camera track references plus the
_edit_ — a `cuts` list, `chapters`, and a `cameraLayout` — so trimming a
recording is a field write rather than a re-encode, and every cut stays
reversible. `RecordingTranscript` carries timed segments with optional
word-level timings, and a `verbatim` flag that gates filler-word editing on
engines which actually preserve disfluencies.

New exports: `RecordingSchema`, `RecordingTranscriptSchema`,
`RECORDING_SCHEMA_IRI`, `RECORDING_TRANSCRIPT_SCHEMA_IRI`, `CUT_REASONS`,
`CAMERA_CORNERS`, `CAMERA_SHAPES`, `CAPTURE_PATHS`, `DEFAULT_CAMERA_LAYOUT`,
and the `Recording`, `RecordingTranscript`, `RecordingSegment`, `Cut`,
`CutReason`, `Chapter`, `CameraLayout`, `CameraCorner`, `CameraShape` and
`CapturePathId` types. Purely additive — no existing export changed.
