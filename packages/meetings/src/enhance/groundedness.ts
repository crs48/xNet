/**
 * Groundedness screen for enhanced meeting notes (exploration 0394).
 *
 * Rule 2 of the shared enhancement contract is "never invent facts, numbers,
 * names, or commitments" — the single failure that makes AI notes worse than
 * no notes, because a fabricated commitment is indistinguishable from a real
 * one once it is written down. Nothing checked it.
 *
 * This screens output for **specifics that appear nowhere in the sources**:
 * numbers, and words positioned like proper nouns. Those are the invented
 * details that do damage; a fabricated adjective mostly does not.
 *
 * > This is a screen, not a proof. It cannot catch a plausible-sounding claim
 * > built only from words the transcript already contains ("Ana agreed to
 * > ship Friday" when she refused), and it will occasionally flag a correctly
 * > reworded name. Use it to fail loudly on the obvious class of invention and
 * > to spot-check fixtures in CI — never as evidence that output is true.
 */

/** Words that are capitalized for grammar, not because they name anything. */
const COMMON_WORDS = new Set([
  'a',
  'an',
  'and',
  'action',
  'items',
  'as',
  'at',
  'but',
  'by',
  'decisions',
  'for',
  'from',
  'he',
  'i',
  'if',
  'in',
  'is',
  'it',
  'next',
  'no',
  'none',
  'not',
  'notes',
  'of',
  'on',
  'or',
  'owner',
  'risks',
  'she',
  'so',
  'summary',
  'steps',
  'task',
  'the',
  'they',
  'this',
  'to',
  'topics',
  'we',
  'with',
  'yes'
])

export interface GroundednessReport {
  /** True when nothing unsupported was found. */
  grounded: boolean
  /** Numbers in the output that appear in neither source. */
  unsupportedNumbers: string[]
  /** Proper nouns in the output that appear in neither source. */
  unsupportedNames: string[]
  /** Fraction of checked specifics that were supported (1 when none found). */
  score: number
}

/** Strip markdown so headings and list markers aren't read as content. */
function stripMarkdown(text: string): string {
  return text
    .replace(/^#{1,6}\s+.*$/gm, ' ')
    .replace(/^\s*[-*+]\s+/gm, ' ')
    .replace(/^\s*\d+\.\s+/gm, ' ')
    .replace(/[*_`>[\]()]/g, ' ')
}

function normalize(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9%.,:/-]+/g, ' ')
}

/** Digits, percentages, times and money — the specifics that carry weight. */
function extractNumbers(text: string): string[] {
  const found = text.match(/\d+(?:[.,:]\d+)*\s?%?/g) ?? []
  return found.map((token) => token.trim()).filter((token) => token.length > 0)
}

const LIST_MARKER = /^\s*(?:[-*+]|\d+\.)\s+/
const HEADING = /^\s*#{1,6}\s+/

function candidateName(raw: string): string | null {
  const word = raw.replace(/^[^A-Za-z]+|[^A-Za-z]+$/g, '')
  if (word.length < 2) return null
  if (!/^[A-Z][a-z]+$/.test(word)) return null
  if (COMMON_WORDS.has(word.toLowerCase())) return null
  return word
}

/**
 * Capitalized words that plausibly name someone or something.
 *
 * Position matters, and differently per line kind. In prose, a leading capital
 * is grammar and says nothing ("Shipping moves to Wednesday"), so it is
 * skipped. In a list item the leading word is usually the *owner* of an action
 * — "- Priya: sign off" — which is the single highest-value thing to catch,
 * so list items are checked from their first word. Headings are structure the
 * template dictated, never content, and are skipped entirely.
 */
function extractProperNouns(text: string): string[] {
  const names: string[] = []
  for (const line of text.split(/\r?\n/)) {
    if (HEADING.test(line)) continue

    const isListItem = LIST_MARKER.test(line)
    const content = isListItem ? line.replace(LIST_MARKER, '') : line
    if (!content.trim()) continue

    const sentences = content.split(/(?<=[.!?])\s+/)
    for (const [sentenceIndex, sentence] of sentences.entries()) {
      const words = sentence.trim().split(/\s+/)
      // Only a list item's very first word escapes the sentence-initial skip.
      const start = isListItem && sentenceIndex === 0 ? 0 : 1
      for (let i = start; i < words.length; i++) {
        const name = candidateName(words[i])
        if (name) names.push(name)
      }
    }
  }
  return names
}

/**
 * Screen `output` against everything it was allowed to draw on.
 *
 * @param output   the enhanced notes the model produced
 * @param sources  transcript text and the user's own notes
 */
export function screenGroundedness(output: string, sources: string[]): GroundednessReport {
  const haystack = normalize(sources.join('\n'))
  const normalizedBody = normalize(stripMarkdown(output))

  const unsupportedNumbers = [
    ...new Set(extractNumbers(normalizedBody).filter((n) => !haystack.includes(n)))
  ]
  const unsupportedNames = [
    ...new Set(extractProperNouns(output).filter((name) => !haystack.includes(name.toLowerCase())))
  ]

  const checked =
    new Set(extractNumbers(normalizedBody)).size + new Set(extractProperNouns(output)).size
  const unsupported = unsupportedNumbers.length + unsupportedNames.length
  return {
    grounded: unsupported === 0,
    unsupportedNumbers,
    unsupportedNames,
    score: checked === 0 ? 1 : (checked - unsupported) / checked
  }
}
