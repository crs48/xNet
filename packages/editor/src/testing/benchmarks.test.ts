import { describe, it, expect } from 'vitest'
import {
  benchmark,
  benchmarkAsync,
  generateLargeDocument,
  formatBenchmarkResults,
  type BenchmarkResult
} from './benchmarks'

describe('benchmark', () => {
  it('returns a BenchmarkResult', () => {
    const result = benchmark(
      'test',
      () => {
        /* eslint-disable @typescript-eslint/no-unused-vars */
        let sum = 0
        for (let i = 0; i < 100; i++) sum += i
        /* eslint-enable @typescript-eslint/no-unused-vars */
      },
      { warmup: 2, iterations: 10 }
    )

    expect(result.name).toBe('test')
    expect(result.iterations).toBe(10)
    expect(result.totalMs).toBeGreaterThanOrEqual(0)
    expect(result.avgMs).toBeGreaterThanOrEqual(0)
    expect(result.minMs).toBeGreaterThanOrEqual(0)
    expect(result.maxMs).toBeGreaterThanOrEqual(result.minMs)
    expect(result.opsPerSec).toBeGreaterThan(0)
  })

  it('performs warmup iterations before measuring', () => {
    let callCount = 0
    benchmark(
      'warmup-test',
      () => {
        callCount++
      },
      { warmup: 5, iterations: 10 }
    )
    expect(callCount).toBe(15) // 5 warmup + 10 measured
  })

  it('uses default options', () => {
    const result = benchmark('defaults', () => {})
    expect(result.iterations).toBe(100)
  })

  it('min <= avg <= max', () => {
    const result = benchmark(
      'ordering',
      () => {
        Math.random()
      },
      { iterations: 20 }
    )

    expect(result.minMs).toBeLessThanOrEqual(result.avgMs)
    expect(result.avgMs).toBeLessThanOrEqual(result.maxMs)
  })
})

describe('benchmarkAsync', () => {
  it('returns a BenchmarkResult for async functions', async () => {
    const result = await benchmarkAsync(
      'async-test',
      async () => {
        await Promise.resolve()
      },
      { warmup: 2, iterations: 10 }
    )

    expect(result.name).toBe('async-test')
    expect(result.iterations).toBe(10)
    expect(result.avgMs).toBeGreaterThanOrEqual(0)
    expect(result.opsPerSec).toBeGreaterThan(0)
  })

  it('measures actual async work', async () => {
    const result = await benchmarkAsync(
      'delay',
      async () => {
        await new Promise((resolve) => setTimeout(resolve, 5))
      },
      { warmup: 1, iterations: 3 }
    )

    // Each iteration should be at least ~5ms
    expect(result.avgMs).toBeGreaterThanOrEqual(3)
  })
})

describe('generateLargeDocument', () => {
  it('generates a document with the specified number of paragraphs', () => {
    const doc = generateLargeDocument(10, 20)
    expect(doc.type).toBe('doc')
    expect(doc.content).toBeDefined()
    expect(doc.content.length).toBe(10)
  })

  it('generates 100 paragraphs by default', () => {
    const doc = generateLargeDocument()
    expect(doc.content.length).toBe(100)
  })

  it('includes headings every 10 paragraphs', () => {
    const doc = generateLargeDocument(30)
    const headings = doc.content.filter((n: any) => n.type === 'heading')
    expect(headings.length).toBeGreaterThan(0)
  })

  it('includes code blocks every 15 paragraphs', () => {
    const doc = generateLargeDocument(30)
    const codeBlocks = doc.content.filter((n: any) => n.type === 'codeBlock')
    expect(codeBlocks.length).toBeGreaterThan(0)
  })

  it('includes paragraphs with bold marks', () => {
    const doc = generateLargeDocument(10)
    const boldParagraphs = doc.content.filter(
      (n: any) =>
        n.type === 'paragraph' &&
        n.content?.some((t: any) => t.marks?.some((m: any) => m.type === 'bold'))
    )
    expect(boldParagraphs.length).toBeGreaterThan(0)
  })

  it('generates proper text content in paragraphs', () => {
    const doc = generateLargeDocument(5, 10)
    const paragraphs = doc.content.filter((n: any) => n.type === 'paragraph')
    for (const p of paragraphs) {
      expect(p.content).toBeDefined()
      expect(p.content.length).toBeGreaterThan(0)
      for (const textNode of p.content) {
        expect(textNode.type).toBe('text')
        expect(textNode.text.length).toBeGreaterThan(0)
      }
    }
  })

  it('heading levels cycle through 1-3', () => {
    const doc = generateLargeDocument(40)
    const headings = doc.content.filter((n: any) => n.type === 'heading')
    const levels = headings.map((h: any) => h.attrs.level)
    expect(levels).toContain(1)
    expect(levels).toContain(2)
    expect(levels).toContain(3)
  })
})

describe('formatBenchmarkResults', () => {
  it('formats results as a markdown table', () => {
    const results: BenchmarkResult[] = [
      {
        name: 'test1',
        iterations: 100,
        totalMs: 100,
        avgMs: 1,
        minMs: 0.5,
        maxMs: 2,
        opsPerSec: 1000
      },
      {
        name: 'test2',
        iterations: 100,
        totalMs: 50,
        avgMs: 0.5,
        minMs: 0.2,
        maxMs: 1,
        opsPerSec: 2000
      }
    ]

    const output = formatBenchmarkResults(results)
    expect(output).toContain('Benchmark')
    expect(output).toContain('Avg (ms)')
    expect(output).toContain('test1')
    expect(output).toContain('test2')
    expect(output).toContain('|')
  })

  it('includes all result fields', () => {
    const results: BenchmarkResult[] = [
      {
        name: 'op',
        iterations: 50,
        totalMs: 25,
        avgMs: 0.5,
        minMs: 0.1,
        maxMs: 1.2,
        opsPerSec: 2000
      }
    ]

    const output = formatBenchmarkResults(results)
    expect(output).toContain('0.500') // avg
    expect(output).toContain('0.100') // min
    expect(output).toContain('1.200') // max
    expect(output).toContain('2000') // ops/s
  })

  it('handles empty results array', () => {
    const output = formatBenchmarkResults([])
    expect(output).toContain('Benchmark')
    // Just header and separator, no data rows
    expect(output.split('\n').length).toBe(2)
  })
})
