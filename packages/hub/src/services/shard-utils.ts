/**
 * @xnetjs/hub - Shared helpers for shard ingestion/query.
 */

const STOP_WORDS = new Set([
  'the',
  'is',
  'at',
  'which',
  'on',
  'a',
  'an',
  'and',
  'or',
  'but',
  'in',
  'with',
  'to',
  'for',
  'of',
  'not',
  'no',
  'be',
  'was',
  'were',
  'been',
  'being',
  'have',
  'has',
  'had',
  'do',
  'does',
  'did',
  'will',
  'would',
  'could',
  'should',
  'may',
  'might',
  'shall',
  'can',
  'this',
  'that',
  'these',
  'those',
  'am',
  'are',
  'it',
  'its',
  'he',
  'she',
  'they',
  'them',
  'we',
  'you',
  'my',
  'your',
  'his',
  'her',
  'our'
])

export const tokenizeText = (text: string): string[] =>
  text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .map((term) => term.trim())
    .filter((term) => term.length >= 2 && term.length <= 50)
    .filter((term) => !STOP_WORDS.has(term))

export const computeTermFreqs = (terms: string[]): Map<string, number> => {
  const freqs = new Map<string, number>()
  for (const term of terms) {
    freqs.set(term, (freqs.get(term) ?? 0) + 1)
  }
  return freqs
}

export const STOP_WORDS_SET = STOP_WORDS
