/**
 * Authoring-time projection guardrail (0380/0389): a schema that opts into
 * `publish` must be warned about properties a lexicon cannot carry, so the loss
 * surfaces at authoring time rather than silently at putRecord time.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineSchema } from './define'
import { text, number } from './properties'

const LEXICON = 'site.standard.document'

let warn: ReturnType<typeof vi.spyOn>
let priorEnv: string | undefined

beforeEach(() => {
  priorEnv = process.env.NODE_ENV
  // The guard is gated to non-production.
  process.env.NODE_ENV = 'development'
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  process.env.NODE_ENV = priorEnv
  warn.mockRestore()
})

const warnings = (): string[] => warn.mock.calls.map((c: unknown[]) => String(c[0]))

describe('publish guardrail', () => {
  it('warns on a float property when the schema publishes', () => {
    defineSchema({
      name: 'Rating',
      namespace: 'xnet://xnet.fyi/',
      publish: { lexicon: LEXICON },
      properties: {
        title: text({ required: true }),
        score: number({}) // float — no integer:true
      }
    })
    const w = warnings().filter((m) => m.includes('Rating.score'))
    expect(w).toHaveLength(1)
    expect(w[0]).toMatch(/no float form/)
    expect(w[0]).toContain(LEXICON)
  })

  it('stays silent for an integer number', () => {
    defineSchema({
      name: 'Counter',
      namespace: 'xnet://xnet.fyi/',
      publish: { lexicon: LEXICON },
      properties: {
        title: text({ required: true }),
        count: number({ integer: true })
      }
    })
    expect(warnings().filter((m) => m.includes('Counter.count'))).toHaveLength(0)
  })

  it('does not warn when the schema does not opt into publishing', () => {
    defineSchema({
      name: 'Private',
      namespace: 'xnet://xnet.fyi/',
      properties: {
        score: number({}) // float, but never projected
      }
    })
    expect(warnings().filter((m) => m.includes('Private.score'))).toHaveLength(0)
  })

  it('records the capability on the schema', () => {
    const schema = defineSchema({
      name: 'Doc',
      namespace: 'xnet://xnet.fyi/',
      publish: { lexicon: LEXICON },
      properties: { title: text({ required: true }) }
    })
    expect(schema.schema.publish).toEqual({ lexicon: LEXICON })
  })

  it('is silent in production even with an unmappable property', () => {
    process.env.NODE_ENV = 'production'
    defineSchema({
      name: 'ProdRating',
      namespace: 'xnet://xnet.fyi/',
      publish: { lexicon: LEXICON },
      properties: { score: number({}) }
    })
    expect(warnings().filter((m) => m.includes('ProdRating'))).toHaveLength(0)
  })
})
