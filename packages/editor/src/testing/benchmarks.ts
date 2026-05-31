/**
 * Benchmark utilities for editor performance testing.
 *
 * Provides tools to measure operation performance and generate test documents.
 */

export interface BenchmarkResult {
  /** Name of the benchmark */
  name: string
  /** Number of iterations */
  iterations: number
  /** Total time in milliseconds */
  totalMs: number
  /** Average time per iteration in milliseconds */
  avgMs: number
  /** Minimum time in milliseconds */
  minMs: number
  /** Maximum time in milliseconds */
  maxMs: number
  /** Operations per second */
  opsPerSec: number
}

export interface BenchmarkOptions {
  /** Number of warmup iterations (not counted). Default: 5 */
  warmup?: number
  /** Number of measured iterations. Default: 100 */
  iterations?: number
}

export interface LargeMarkdownOptions {
  /** Number of top-level Markdown blocks to generate. Default: 1000 */
  blocks?: number
  /** Approximate words per paragraph block. Default: 24 */
  wordsPerParagraph?: number
  /** Whether to include xNet-flavored embed blocks. Default: true */
  includeEmbeds?: boolean
}

const SAMPLE_WORDS = [
  'the',
  'quick',
  'brown',
  'fox',
  'jumps',
  'over',
  'lazy',
  'dog',
  'lorem',
  'ipsum',
  'dolor',
  'sit',
  'amet',
  'consectetur',
  'adipiscing',
  'elit',
  'sed',
  'do',
  'eiusmod',
  'tempor',
  'incididunt',
  'ut',
  'labore',
  'et',
  'dolore',
  'magna',
  'aliqua',
  'enim',
  'ad',
  'minim',
  'veniam'
]

function generateWords(seed: number, count: number): string {
  return Array.from(
    { length: count },
    (_, index) => SAMPLE_WORDS[(seed + index) % SAMPLE_WORDS.length]
  ).join(' ')
}

/**
 * Run a benchmark on a synchronous function.
 *
 * @param name - Name of the benchmark
 * @param fn - Function to benchmark
 * @param options - Configuration options
 * @returns Benchmark results
 */
export function benchmark(
  name: string,
  fn: () => void,
  options: BenchmarkOptions = {}
): BenchmarkResult {
  const { warmup = 5, iterations = 100 } = options

  // Warmup
  for (let i = 0; i < warmup; i++) {
    fn()
  }

  // Measure
  const times: number[] = []
  for (let i = 0; i < iterations; i++) {
    const start = performance.now()
    fn()
    times.push(performance.now() - start)
  }

  const totalMs = times.reduce((sum, t) => sum + t, 0)
  const avgMs = totalMs / iterations
  const minMs = Math.min(...times)
  const maxMs = Math.max(...times)
  const opsPerSec = 1000 / avgMs

  return { name, iterations, totalMs, avgMs, minMs, maxMs, opsPerSec }
}

/**
 * Run a benchmark on an async function.
 */
export async function benchmarkAsync(
  name: string,
  fn: () => Promise<void>,
  options: BenchmarkOptions = {}
): Promise<BenchmarkResult> {
  const { warmup = 5, iterations = 100 } = options

  // Warmup
  for (let i = 0; i < warmup; i++) {
    await fn()
  }

  // Measure
  const times: number[] = []
  for (let i = 0; i < iterations; i++) {
    const start = performance.now()
    await fn()
    times.push(performance.now() - start)
  }

  const totalMs = times.reduce((sum, t) => sum + t, 0)
  const avgMs = totalMs / iterations
  const minMs = Math.min(...times)
  const maxMs = Math.max(...times)
  const opsPerSec = 1000 / avgMs

  return { name, iterations, totalMs, avgMs, minMs, maxMs, opsPerSec }
}

/**
 * Generate a large ProseMirror-compatible document JSON for performance testing.
 *
 * @param paragraphs - Number of paragraphs to generate. Default: 100
 * @param wordsPerParagraph - Words per paragraph. Default: 50
 * @returns ProseMirror document JSON
 */
export function generateLargeDocument(
  paragraphs: number = 100,
  wordsPerParagraph: number = 50
): Record<string, any> {
  function generateParagraph(): string {
    return generateWords(content.length, wordsPerParagraph)
  }

  const content: any[] = []

  for (let i = 0; i < paragraphs; i++) {
    // Mix in different node types
    if (i % 10 === 0 && i > 0) {
      // Add a heading every 10 paragraphs
      content.push({
        type: 'heading',
        attrs: { level: (i % 3) + 1 },
        content: [{ type: 'text', text: `Section ${Math.floor(i / 10)}` }]
      })
    } else if (i % 15 === 0 && i > 0) {
      // Add a code block every 15 paragraphs
      content.push({
        type: 'codeBlock',
        attrs: { language: 'javascript' },
        content: [{ type: 'text', text: `const x = ${i};\nconsole.log(x);` }]
      })
    } else {
      // Regular paragraph with some inline marks
      const text = generateParagraph()
      const textNodes: any[] = []

      if (i % 3 === 0) {
        // Add some bold text
        const midpoint = Math.floor(text.length / 2)
        textNodes.push(
          { type: 'text', text: text.slice(0, midpoint) },
          { type: 'text', marks: [{ type: 'bold' }], text: text.slice(midpoint) }
        )
      } else {
        textNodes.push({ type: 'text', text })
      }

      content.push({
        type: 'paragraph',
        content: textNodes
      })
    }
  }

  return {
    type: 'doc',
    content
  }
}

/**
 * Generate a deterministic large Markdown document for import/export performance checks.
 */
export function generateLargeMarkdownDocument(options: LargeMarkdownOptions = {}): string {
  const { blocks = 1000, wordsPerParagraph = 24, includeEmbeds = true } = options

  return Array.from({ length: blocks }, (_, index) => {
    if (includeEmbeds && index > 0 && index % 125 === 0) {
      return [
        ':::xnet-embed',
        JSON.stringify({
          url: `https://www.youtube.com/watch?v=video${index}`,
          provider: 'youtube',
          embedId: `video${index}`,
          embedUrl: `https://www.youtube.com/embed/video${index}`,
          title: `Demo ${index}`,
          width: 640,
          alignment: 'center'
        }),
        ':::'
      ].join('\n')
    }

    if (index > 0 && index % 50 === 0) {
      return `## Section ${index / 50}`
    }

    if (index > 0 && index % 40 === 0) {
      return ['```ts', `const block${index} = ${index}`, '```'].join('\n')
    }

    if (index > 0 && index % 25 === 0) {
      return `- [ ] Task ${index} ${generateWords(index, 8)}`
    }

    if (index > 0 && index % 15 === 0) {
      return `> Quote ${index} ${generateWords(index, 10)}`
    }

    return `Paragraph ${index} ${generateWords(index, wordsPerParagraph)}`
  }).join('\n\n')
}

/**
 * Format benchmark results as a readable string table.
 */
export function formatBenchmarkResults(results: BenchmarkResult[]): string {
  const header = '| Benchmark | Avg (ms) | Min (ms) | Max (ms) | Ops/s |'
  const separator = '|-----------|----------|----------|----------|-------|'
  const rows = results.map(
    (r) =>
      `| ${r.name.padEnd(9)} | ${r.avgMs.toFixed(3).padStart(8)} | ${r.minMs.toFixed(3).padStart(8)} | ${r.maxMs.toFixed(3).padStart(8)} | ${Math.round(r.opsPerSec).toString().padStart(5)} |`
  )

  return [header, separator, ...rows].join('\n')
}
