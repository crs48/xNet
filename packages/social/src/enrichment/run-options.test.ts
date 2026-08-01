/**
 * Per-run transcript consent (exploration 0419).
 *
 * Lives beside the enrichment tests rather than under `import/` because that
 * directory's suites need package subpath resolution the shared pool does not
 * provide; these are pure functions over a JSON string.
 */

import { describe, expect, it } from 'vitest'
import {
  parseSocialImportRunOptions,
  runWantsTranscripts,
  serializeSocialImportRunOptions,
  DEFAULT_SOCIAL_IMPORT_RUN_OPTIONS
} from '../import/run-options'

describe('social import run options', () => {
  it('defaults to not fetching transcripts', () => {
    expect(DEFAULT_SOCIAL_IMPORT_RUN_OPTIONS.fetchTranscripts).toBe(false)
    expect(parseSocialImportRunOptions(undefined).fetchTranscripts).toBe(false)
    expect(parseSocialImportRunOptions(null).fetchTranscripts).toBe(false)
    expect(parseSocialImportRunOptions('').fetchTranscripts).toBe(false)
  })

  it('round-trips an explicit opt-in', () => {
    const json = serializeSocialImportRunOptions({ fetchTranscripts: true })
    expect(parseSocialImportRunOptions(json).fetchTranscripts).toBe(true)
  })

  it('never reads corrupted or coerced values as consent', () => {
    expect(parseSocialImportRunOptions('not json').fetchTranscripts).toBe(false)
    expect(parseSocialImportRunOptions('{"fetchTranscripts":"yes"}').fetchTranscripts).toBe(false)
    expect(parseSocialImportRunOptions('{"fetchTranscripts":1}').fetchTranscripts).toBe(false)
    expect(parseSocialImportRunOptions('{}').fetchTranscripts).toBe(false)
  })

  it('reads consent off a stored run', () => {
    expect(runWantsTranscripts({ optionsJson: '{"fetchTranscripts":true}' })).toBe(true)
    expect(runWantsTranscripts({ optionsJson: '{"fetchTranscripts":false}' })).toBe(false)
    // A run imported before this field existed has not consented.
    expect(runWantsTranscripts({})).toBe(false)
    expect(runWantsTranscripts(null)).toBe(false)
  })
})
