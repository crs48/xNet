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
  const words = [
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

  function randomWord(): string {
    return words[Math.floor(Math.random() * words.length)]
  }

  function generateParagraph(): string {
    const sentence: string[] = []
    for (let i = 0; i < wordsPerParagraph; i++) {
      sentence.push(randomWord())
    }
    return sentence.join(' ')
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
