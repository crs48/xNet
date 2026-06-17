import type { DID } from '../node'
import { describe, expect, it } from 'vitest'
import { TRANSCRIPTION_SCHEMA_IRI, TranscriptionSchema } from './transcription'

describe('TranscriptionSchema', () => {
  const testDID = 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK' as DID

  it('has the expected schema identity', () => {
    expect(TranscriptionSchema.schema['@id']).toBe(TRANSCRIPTION_SCHEMA_IRI)
    expect(TranscriptionSchema.schema['@id']).toBe('xnet://xnet.fyi/Transcription@1.0.0')
    expect(TranscriptionSchema.schema.name).toBe('Transcription')
    expect(TranscriptionSchema.schema.version).toBe('1.0.0')
  })

  it('defines the dictation properties', () => {
    const propIds = TranscriptionSchema.schema.properties.map((prop) => prop['@id'])
    for (const field of [
      'text',
      'language',
      'engineId',
      'modelId',
      'durationMs',
      'source',
      'audio'
    ]) {
      expect(propIds).toContain(`xnet://xnet.fyi/Transcription@1.0.0#${field}`)
    }
  })

  it('defaults visibility to private (transcripts are sensitive)', () => {
    const node = TranscriptionSchema.create(
      {
        text: 'remember to call the dentist',
        engineId: 'parakeet',
        modelId: 'parakeet-tdt-0.6b-v2',
        durationMs: 1800
      },
      { createdBy: testDID }
    )

    expect(node.text).toBe('remember to call the dentist')
    expect(node.visibility).toBe('private')
    expect(node.source).toBe('inApp')
    expect(node.starred).toBe('no')
  })

  it('records an audio blob reference when retained', () => {
    const node = TranscriptionSchema.create(
      {
        text: 'with audio kept',
        engineId: 'whisper',
        modelId: 'large-v3-turbo',
        durationMs: 3200,
        source: 'pushToTalk',
        audio: {
          cid: 'cid:blake3:test-audio',
          name: 'dictation.wav',
          mimeType: 'audio/wav',
          size: 64000
        }
      },
      { createdBy: testDID }
    )

    expect(node.source).toBe('pushToTalk')
    expect(node.audio?.mimeType).toBe('audio/wav')
  })
})
