/**
 * Relation-field resolution across both registry shapes (exploration 0415).
 *
 * The two agent backends disagree about what a schema's `properties` looks
 * like: the CLI's built-in registry returns the JSON-LD **array**, the Electron
 * renderer maps it to a keyed **record**. Handling only one is a silent
 * failure — the lane still reports `bm25-graph` while the graph stage finds no
 * edges at all — and that is precisely how this bug was caught: an end-to-end
 * multi-hop recall reported `expanded=0` against a workspace that had the edge.
 */

import { describe, expect, it, vi } from 'vitest'
import { relationFieldNames, schemaRegistryRelationFields } from '../ai-surface/retrieval'

const ARRAY_SHAPE = [
  { '@id': 'x#title', name: 'title', type: 'text', required: true },
  { '@id': 'x#page', name: 'page', type: 'relation', required: false },
  { '@id': 'x#tags', name: 'tags', type: 'relation', required: false }
]

const RECORD_SHAPE = {
  title: { type: 'text', required: true },
  page: { type: 'relation', required: false },
  tags: { type: 'relation', required: false }
}

describe('relationFieldNames', () => {
  it('reads the JSON-LD array shape (CLI registry)', () => {
    expect(relationFieldNames(ARRAY_SHAPE)).toEqual(['page', 'tags'])
  })

  it('reads the keyed record shape (Electron renderer)', () => {
    expect(relationFieldNames(RECORD_SHAPE)).toEqual(['page', 'tags'])
  })

  it('returns nothing for shapes it does not understand, rather than throwing', () => {
    expect(relationFieldNames(null)).toEqual([])
    expect(relationFieldNames('nope')).toEqual([])
    expect(relationFieldNames([{ type: 'relation' }])).toEqual([]) // no name → no edge
  })
})

describe('schemaRegistryRelationFields', () => {
  it('resolves and memoizes per schema', async () => {
    const get = vi.fn(async () => ({ iri: 'S', name: 'S', properties: ARRAY_SHAPE }) as never)
    const lookup = schemaRegistryRelationFields({ getAllIRIs: () => ['S'], get })

    expect(await lookup('S')).toEqual(['page', 'tags'])
    expect(await lookup('S')).toEqual(['page', 'tags'])
    expect(get).toHaveBeenCalledTimes(1)
  })

  it('treats an unreadable schema as no edges, not as a failed retrieval', async () => {
    const lookup = schemaRegistryRelationFields({
      getAllIRIs: () => [],
      get: async () => {
        throw new Error('registry offline')
      }
    })
    await expect(lookup('S')).resolves.toEqual([])
  })
})
