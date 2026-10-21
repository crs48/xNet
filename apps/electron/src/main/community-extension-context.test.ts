import { describe, expect, it } from 'vitest'
import { selectedExtensionContext } from './community-extension-context'

const node = {
  id: 'version-a',
  schemaId: 'xnet://xnet.fyi/PluginSource@1.0.0',
  createdBy: 'did:key:owner',
  createdAt: 1,
  updatedAt: 1,
  properties: {
    name: 'Selected older version',
    description: 'Original features',
    files: { 'index.tsx': 'export default function V() { return <p>ORIGINAL_BASE</p> }' },
    manifest: { chatPreview: { channelId: 'chat', lineage: { versionId: 'a'.repeat(64) } } }
  }
}
describe('explicit extension edit context', () => {
  it('carries the exact reviewed source and stable parent fingerprint', () => {
    const result = selectedExtensionContext(node, 'did:key:owner', 'chat')
    expect(result.baseRevisionId).toBe('version-a')
    expect(result.baseVersionId).toBe('a'.repeat(64))
    expect(result.prompt).toContain('ORIGINAL_BASE')
    expect(result.prompt).toContain('untrusted source data')
  })
  it('refuses other owners, conversations, schemas, deleted and oversized source', () => {
    for (const altered of [
      null,
      { ...node, createdBy: 'did:key:other' },
      { ...node, deleted: true },
      { ...node, schemaId: 'other' },
      {
        ...node,
        properties: { ...node.properties, manifest: { chatPreview: { channelId: 'other' } } }
      },
      { ...node, properties: { ...node.properties, files: { 'index.tsx': 'x'.repeat(24001) } } }
    ])
      expect(() => selectedExtensionContext(altered, 'did:key:owner', 'chat')).toThrow(
        'selected extension'
      )
  })
})
