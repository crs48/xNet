/**
 * The Meetings feature module (exploration 0279).
 *
 * Declares the pack's capability surface: writes to the two meeting schemas
 * and — the new one — `systemAudio`, which gates the desktop loopback-capture
 * IPC. First-party, client-only (no hub half: capture, transcription, and
 * enhancement all run on-device or through the user's own AI provider).
 */

import { MEETING_SCHEMA_IRI, MEETING_TRANSCRIPT_SCHEMA_IRI } from '@xnetjs/data'
import { defineFeatureModule } from '@xnetjs/plugins'

export const MEETINGS_MODULE_ID = 'fyi.xnet.meetings'

export const meetingsFeatureModule = defineFeatureModule({
  id: MEETINGS_MODULE_ID,
  name: 'Meetings',
  version: '0.1.0',
  description:
    'Botless meeting transcription and AI-enhanced notes. Captures your mic and (on desktop) system audio, transcribes on-device by default, and merges your rough notes with the transcript.',
  author: 'xNet',
  capabilities: {
    schemaWrite: [MEETING_SCHEMA_IRI, MEETING_TRANSCRIPT_SCHEMA_IRI],
    systemAudio: true
  }
})
