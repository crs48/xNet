import { describe, expect, it } from 'vitest'
import {
  createExtensionVersion,
  extensionPermissionHash,
  encodeSharedExtension,
  readSharedExtension,
  extensionBranches,
  sourceChangeSummary,
  versionLineage,
  type ExtensionRevision
} from './extension-versions'

const proposal = {
  title: 'Review desk',
  summary: 'Review selected work',
  source: 'export default function View() { return <p>Review</p> }',
  author: 'did:key:alice',
  changeNote: 'Initial version'
}
describe('shared extension versions', () => {
  it('does not reuse approvals for identical code with different authors or version identities', async () => {
    const a = await createExtensionVersion(proposal)
    const b = await createExtensionVersion({ ...proposal, author: 'did:key:bob' })
    expect(await extensionPermissionHash('build', a.versionId)).not.toBe(
      await extensionPermissionHash('build', b.versionId)
    )
    expect(await extensionPermissionHash('build', a.versionId)).not.toBe(
      await extensionPermissionHash('new-runtime', a.versionId)
    )
    expect(await extensionPermissionHash('legacy-build')).toBe('legacy-build')
  })
  it('round-trips source with signed-message attribution and no data grants', async () => {
    const version = await createExtensionVersion(proposal)
    expect(await readSharedExtension(encodeSharedExtension(version), proposal.author)).toEqual(
      version
    )
    expect(Object.keys(versionLineage(version)).sort()).toEqual([
      'author',
      'changeNote',
      'versionId'
    ])
    await expect(
      readSharedExtension(encodeSharedExtension(version), 'did:key:bob')
    ).rejects.toThrow('attribution')
  })
  it('binds fingerprints to code, author, parent and change note', async () => {
    const original = await createExtensionVersion(proposal)
    const variants = await Promise.all([
      createExtensionVersion({ ...proposal, source: proposal.source + '\n' }),
      createExtensionVersion({ ...proposal, author: 'did:key:bob' }),
      createExtensionVersion({ ...proposal, parent: original.versionId }),
      createExtensionVersion({ ...proposal, changeNote: 'Added feature' })
    ])
    expect(new Set([original, ...variants].map((v) => v.versionId)).size).toBe(5)
    await expect(
      readSharedExtension(
        encodeSharedExtension({ ...original, source: proposal.source + ' changed' }),
        proposal.author
      )
    ).rejects.toThrow('fingerprint')
  })
  it('rejects authority fields, unsupported versions and oversized or malformed payloads', async () => {
    const version = await createExtensionVersion(proposal)
    const bytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value))
    await expect(
      readSharedExtension(
        bytes({
          format: 'xnet-chat-extension',
          version: 1,
          revision: { ...version, grants: ['all'] }
        }),
        proposal.author
      )
    ).rejects.toThrow('metadata')
    await expect(
      readSharedExtension(
        bytes({ format: 'xnet-chat-extension', version: 2, revision: version }),
        proposal.author
      )
    ).rejects.toThrow('format')
    await expect(readSharedExtension(new Uint8Array(128001), proposal.author)).rejects.toThrow(
      'limit'
    )
    await expect(readSharedExtension(new Uint8Array([255]), proposal.author)).rejects.toThrow()
    await expect(createExtensionVersion({ ...proposal, changeNote: '' })).rejects.toThrow(
      'change note'
    )
    await expect(createExtensionVersion({ ...proposal, parent: '<script>' })).rejects.toThrow(
      'parent'
    )
  })
  it('shows sibling branches, deduplicates imports and marks unavailable parents', () => {
    const entry = (id: string, parent?: string): ExtensionRevision => ({
      ...proposal,
      id,
      hash: id,
      actor: 'You',
      createdAt: 0,
      lineage: { versionId: id, author: proposal.author, changeNote: id, parent }
    })
    const rows = extensionBranches([
      entry('b', 'root'),
      entry('a', 'root'),
      entry('root'),
      entry('a', 'root'),
      entry('orphan', 'missing')
    ])
    expect(rows.map((r) => [r.entry.id, r.depth, r.missingParent])).toEqual([
      ['orphan', 0, true],
      ['root', 0, false],
      ['a', 1, false],
      ['b', 1, false]
    ])
    expect(extensionBranches([entry('x', 'y'), entry('y', 'x')])).toHaveLength(2)
    const older = entry('same')
    const newer = { ...older, id: 'new-local-copy', createdAt: 2 }
    expect(extensionBranches([newer, older]).map((row) => row.entry.id)).toEqual(['new-local-copy'])
  })
  it('compares only the changed source region without inventing a line-by-line diff', () => {
    expect(sourceChangeSummary('first\nold\nlast', 'first\nnew\nextra\nlast')).toEqual({
      removed: 1,
      added: 2,
      before: 'old',
      after: 'new\nextra'
    })
    expect(sourceChangeSummary('same', 'same')).toMatchObject({ added: 0, removed: 0 })
  })
})
