/**
 * Per-run import options (exploration 0419).
 *
 * Transcript fetching is a decision about *this archive*, not a global
 * preference: consenting to fetch captions for a public YouTube library says
 * nothing about whether the same should happen for an archive of private
 * uploads. So the answer rides on the import run, and a run that never
 * answered reads as "no" rather than as "not set".
 */

export type SocialImportRunOptions = {
  /** Fetch video transcripts for content this run imported. */
  fetchTranscripts: boolean
}

export const DEFAULT_SOCIAL_IMPORT_RUN_OPTIONS: SocialImportRunOptions = {
  fetchTranscripts: false
}

export function serializeSocialImportRunOptions(options: SocialImportRunOptions): string {
  return JSON.stringify(options)
}

/**
 * Read the options off a stored run.
 *
 * Anything missing or unparseable falls back to the defaults, which are the
 * conservative answers — a corrupted field must never read as consent.
 */
export function parseSocialImportRunOptions(
  optionsJson: string | null | undefined
): SocialImportRunOptions {
  if (!optionsJson) return DEFAULT_SOCIAL_IMPORT_RUN_OPTIONS

  try {
    const parsed = JSON.parse(optionsJson) as Partial<SocialImportRunOptions>
    return {
      fetchTranscripts: parsed?.fetchTranscripts === true
    }
  } catch {
    return DEFAULT_SOCIAL_IMPORT_RUN_OPTIONS
  }
}

/** Whether a stored run opted into transcript fetching. */
export function runWantsTranscripts(
  run: { optionsJson?: string | null } | null | undefined
): boolean {
  return parseSocialImportRunOptions(run?.optionsJson).fetchTranscripts
}
