import type { GraphResource } from './graph'
import { expect, it } from 'vitest'
import { createGraphBuilder, hashtagsIn } from './graph'

const resource = (id: string, values: Partial<GraphResource> = {}): GraphResource => ({
  id,
  title: id,
  url: `https://example.com/${id}`,
  platform: 'youtube',
  provider: 'youtube',
  author: '',
  hashtags: [],
  ...values
})

it('keeps every link, including orphans, and deduplicates repeated memberships', () => {
  const builder = createGraphBuilder(
    Array.from({ length: 1200 }, (_, i) => resource(`${i}`)),
    1500
  )
  builder.collection('playlist', { title: 'Learning', platform: 'youtube' })
  builder.collection('empty-export', { title: 'A name without entries' })
  builder.membership({ collection: 'playlist', item: '1199' })
  builder.membership({ collection: 'playlist', item: '1199' })
  builder.membership({ collection: 'unknown', item: '0' })
  builder.membership({ collection: 'playlist', item: 'not-a-link' })
  const graph = builder.finish()
  expect(graph.linkCount).toBe(1200)
  expect(graph.resourceCount).toBe(1500)
  expect(graph.nodes).toHaveLength(1201)
  expect(graph.edges).toHaveLength(1)
  expect(graph.nodes[graph.edges[0].source].id).toBe('1199')
  expect(graph.nodes[graph.edges[0].target].label).toBe('Learning')
})

it('joins explicit tags across platforms but keeps creator names scoped to their provider', () => {
  const builder = createGraphBuilder(
    [
      resource('one', { author: 'Alex', hashtags: ['Learning'] }),
      resource('two', { author: 'Alex', platform: 'github', provider: 'github' }),
      resource('three', { author: 'alex' })
    ],
    3
  )
  builder.content('two', {
    platform: 'github',
    metadataJson: JSON.stringify({ topics: ['learning'], language: 'TypeScript' })
  })
  const graph = builder.finish()
  expect(graph.nodes.filter((node) => node.kind === 'tag')).toHaveLength(1)
  expect(graph.nodes.filter((node) => node.kind === 'creator')).toHaveLength(2)
  expect(graph.nodes.filter((node) => node.kind === 'category').map((node) => node.label)).toEqual([
    'Language: TypeScript'
  ])
  expect(graph.edges.filter((edge) => edge.kind === 'tag')).toHaveLength(2)
})

it('attaches garden tags to the link and reports unreadable source metadata', () => {
  const builder = createGraphBuilder([resource('saved')], 1)
  builder.content('note', {
    platformContentKind: 'garden-commentary',
    parentContent: 'saved',
    metadataJson: JSON.stringify({ tags: ['meditation'] })
  })
  builder.content('saved', { metadataJson: '{broken' })
  const graph = builder.finish()
  expect(graph.nodes.map((node) => node.label)).toEqual(['saved', '#meditation'])
  expect(graph.warnings).toHaveLength(1)
  expect(graph.warnings[0]).toContain('incomplete')
})

it('extracts actual hashtags without interpreting headings, URL fragments, or ordinary words as tags', () => {
  expect(
    hashtagsIn(
      'Learning #Mindfulness #éducation! #Mindfulness\n# A heading\nhttps://example.com/#fragment and plain words'
    )
  ).toEqual(['Mindfulness', 'éducation'])
})
