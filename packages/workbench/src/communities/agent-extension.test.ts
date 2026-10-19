import { describe, expect, it } from 'vitest'
import { readExtensionProposal, readPreviewTree } from './agent-extension'
describe('chat extension validation', () => {
  it('accepts bounded source and text/layout-only output', () => {
    expect(
      readExtensionProposal(
        '{"title":"Watchlist","summary":"Films","source":"export default () => ({type: \'text\',text: \'Hello\'})"}'
      ).title
    ).toBe('Watchlist')
    expect(
      readPreviewTree({
        type: 'card',
        children: [{ type: 'text', text: '<script>plain text</script>' }]
      }).type
    ).toBe('card')
  })
  it.each([
    { type: 'iframe', src: 'http://localhost' },
    { type: 'text', onClick: 'host()' },
    { type: 'text', html: '<script>' },
    { type: 'text', text: 4 },
    { type: 'stack', children: 'x' },
    { type: 'text', text: 'x'.repeat(32001) }
  ])('rejects executable, foreign, and oversized view fields', (value) => {
    expect(() => readPreviewTree(value)).toThrow()
  })
  it('bounds recursion and node count', () => {
    let nested: unknown = { type: 'text', text: 'leaf' }
    for (let i = 0; i < 15; i++) nested = { type: 'stack', children: [nested] }
    expect(() => readPreviewTree(nested)).toThrow()
    expect(() =>
      readPreviewTree({ type: 'stack', children: Array(301).fill({ type: 'text' }) })
    ).toThrow()
  })
  it('rejects permission escalation in a proposal', () => {
    expect(() =>
      readExtensionProposal(
        JSON.stringify({ title: 'A', summary: 'B', source: 'C', permissions: { network: true } })
      )
    ).toThrow('permission')
    expect(() =>
      readExtensionProposal(JSON.stringify({ title: 'A', summary: 'B', source: 'x'.repeat(24001) }))
    ).toThrow('limits')
  })
})
