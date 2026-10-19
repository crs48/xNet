// @vitest-environment node
import type { NodeState } from '@xnetjs/data'
import { ChannelSchema, ChatMessageSchema, TaskSchema } from '@xnetjs/data'
import { transformSync } from 'esbuild'
import { describe, expect, it } from 'vitest'
import { extensionExamples } from './agent-extension'
import { markupToTree, renderExtension } from './extension-runtime.worker'

const node = (
  id: string,
  schemaId: NodeState['schemaId'],
  properties: NodeState['properties']
): NodeState => ({
  id,
  schemaId,
  properties,
  timestamps: {},
  deleted: false,
  createdAt: 1,
  updatedAt: 1,
  createdBy: 'did:key:owner',
  updatedBy: 'did:key:owner'
})
const dataset = {
  grant: {
    version: 1 as const,
    owner: 'did:key:owner',
    hash: 'build',
    channelIds: ['chat'],
    records: [{ id: 'task', schemaId: TaskSchema._schemaId }]
  },
  nodes: [
    node('chat', ChannelSchema._schemaId, { name: 'Film club' }),
    node('message', ChatMessageSchema._schemaId, { content: 'Watch: Arrival', channel: 'chat' }),
    node('task', TaskSchema._schemaId, { title: 'Choose a film', status: 'todo' })
  ]
}
const compile = (source: string) =>
  transformSync(source, { loader: 'tsx', format: 'cjs', jsx: 'automatic' }).code

describe('isolated xNet React extension runtime', () => {
  it('keeps the legacy read-only examples compatible with static rendering', () => {
    for (const [title, text] of [
      ['Our watchlist', 'Arrival'],
      ['Conversation index', 'Film club']
    ]) {
      const tree = renderExtension(
        compile(extensionExamples.find((example) => example.title === title)!.source),
        dataset,
        'chat'
      )
      expect(JSON.stringify(tree)).toContain(text)
    }
  })
  it('reflects record edits and deletion in subsequent renders', () => {
    const code = compile(
      extensionExamples.find((example) => example.title === 'Our watchlist')!.source
    )
    expect(
      JSON.stringify(
        renderExtension(
          code,
          {
            ...dataset,
            nodes: dataset.nodes.map((n) =>
              n.id === 'message'
                ? { ...n, properties: { ...n.properties, content: 'Watch: Moon' } }
                : n
            )
          },
          'chat'
        )
      )
    ).toContain('Moon')
    expect(
      JSON.stringify(
        renderExtension(
          code,
          { ...dataset, nodes: dataset.nodes.filter((n) => n.id !== 'message') },
          'chat'
        )
      )
    ).not.toContain('Arrival')
  })
  it('denies unapproved schema and record queries from the actual hook', () => {
    expect(() =>
      renderExtension(
        compile(
          "import {useQuery} from '@xnetjs/react'; import {PageSchema} from '@xnetjs/data'; export default function View(){useQuery(PageSchema); return <p>Denied</p>}"
        ),
        dataset,
        'chat'
      )
    ).toThrow('denied')
    expect(() =>
      renderExtension(
        compile(
          "import {useQuery} from '@xnetjs/react'; import {TaskSchema} from '@xnetjs/data'; export default function View(){useQuery(TaskSchema, 'outside'); return <p>Denied</p>}"
        ),
        dataset,
        'chat'
      )
    ).toThrow('denied')
    expect(() =>
      renderExtension(
        compile("import fs from 'node:fs'; export default () => <p>{fs}</p>"),
        dataset,
        'chat'
      )
    ).toThrow('Module access denied')
  })
  it.each([
    '<img src="https://example.com">',
    '<script>alert(1)</script>',
    '<p onclick="alert(1)">hello</p>',
    '<a href="/">link</a>',
    '<input>'
  ])('rejects executable and external markup: %s', (markup) => {
    expect(() => markupToTree(markup)).toThrow()
  })
  it('keeps escaped content inert and bounds output', () => {
    expect(
      JSON.stringify(markupToTree('<p>&lt;script&gt;plain text&lt;/script&gt;</p>'))
    ).toContain('<script>plain text</script>')
    expect(() => markupToTree('<p>' + 'x'.repeat(64001) + '</p>')).toThrow()
  })
})
