import { describe, expect, it } from 'vitest'
import {
  acceptedDevelopmentHeads,
  captureDevelopmentInput,
  createExtensionVersion,
  decodeDevelopmentRecord,
  developmentAncestry,
  developmentMessage,
  developmentRelationIssue,
  readDevelopmentEntry,
  type DevelopmentEntry,
  type DevelopmentRecord
} from './extension-development'
const author = 'did:key:alice'
async function entry(record: DevelopmentRecord, content = 'hello', who = author) {
  const message = await developmentMessage(who, 'room', content, record)
  return (await readDevelopmentEntry({ ...message, createdBy: who, createdAt: 1, updatedAt: 1 }))!
}
const project = () =>
  entry({ kind: 'project', title: 'Reading list', brief: 'Build together', nonce: 'nonce' })
async function version(projectId: string, parents: string[] = [], title = 'List') {
  return entry({
    kind: 'version',
    project: projectId,
    parents,
    manual: true,
    extension: await createExtensionVersion({
      title,
      summary: '',
      source: 'export default () => null',
      author,
      changeNote: title
    })
  })
}
describe('shared development record integrity', () => {
  it('binds request context to ordered revision digests and feedback to its bases', async () => {
    const feedback = await entry(
      { kind: 'feedback', project: 'p', parents: ['base'] },
      'Keep the filter'
    )
    expect(feedback.record).toMatchObject({ parents: ['base'] })
    const request: DevelopmentRecord = {
      kind: 'request',
      project: 'p',
      host: author,
      epoch: 'e',
      parents: ['base'],
      contextIds: [feedback.id],
      contextDigests: ['a'.repeat(64)]
    }
    expect(await decodeDevelopmentRecord(request)).toEqual(request)
    await expect(decodeDevelopmentRecord({ ...request, contextDigests: [] })).rejects.toThrow(
      'fingerprints'
    )
    await expect(
      decodeDevelopmentRecord({ ...request, contextDigests: ['wrong'] })
    ).rejects.toThrow('fingerprints')
  })
  it('binds signed author, channel, content and complete metadata into the record id', async () => {
    const record: DevelopmentRecord = { kind: 'project', title: 'List', brief: '', nonce: 'new' }
    const message = await developmentMessage(author, 'room', 'Started', record)
    const node = { ...message, createdBy: author, createdAt: 1, updatedAt: 1 }
    expect((await readDevelopmentEntry(node))?.record).toEqual(record)
    await expect(readDevelopmentEntry({ ...node, createdBy: 'did:key:eve' })).rejects.toThrow(
      'attribution'
    )
    await expect(
      readDevelopmentEntry({ ...node, properties: { ...node.properties, content: 'Changed' } })
    ).rejects.toThrow('changed')
    await expect(
      readDevelopmentEntry({ ...node, properties: { ...node.properties, channel: 'secret' } })
    ).rejects.toThrow('changed')
    expect(
      await readDevelopmentEntry({ ...node, properties: { ...node.properties, redacted: true } })
    ).toBeNull()
  })
  it('rejects unknown protocol versions and fields, oversized sources and duplicate references', async () => {
    await expect(
      decodeDevelopmentRecord({ kind: 'project', title: '', brief: '', nonce: 'n', hidden: true })
    ).rejects.toThrow('Unsupported')
    await expect(
      decodeDevelopmentRecord({
        kind: 'request',
        project: 'p',
        host: author,
        epoch: 'e',
        parents: ['x', 'x'],
        contextIds: []
      })
    ).rejects.toThrow('Duplicate')
    const message = await developmentMessage(author, 'room', 'Started', {
      kind: 'project',
      title: '',
      brief: '',
      nonce: 'n'
    })
    await expect(
      readDevelopmentEntry({
        ...message,
        createdBy: author,
        createdAt: 1,
        updatedAt: 1,
        properties: { ...message.properties, development: { version: 2, record: {} } }
      })
    ).rejects.toThrow('protocol')
  })
  it('verifies retained message revisions and rejects changed snapshot text', async () => {
    const p = await project()
    const input = await captureDevelopmentInput({
      id: 'm',
      createdBy: author,
      createdAt: 1,
      updatedAt: 2,
      properties: { content: 'Original question' }
    })
    const base = (await version(p.id)).record
    if (base.kind !== 'version') throw new Error('Expected a version fixture')
    const record: DevelopmentRecord = {
      kind: 'version',
      project: p.id,
      parents: [],
      request: 'r',
      attempt: 'a',
      manual: false,
      extension: base.extension,
      history: {
        inputs: [input],
        brief: '',
        provider: 'codex',
        model: 'model',
        context: 'explicit',
        template: 'conversation-v1'
      }
    }
    expect((await decodeDevelopmentRecord(record)).kind).toBe('version')
    record.history!.inputs[0].content = 'Forged question'
    await expect(decodeDevelopmentRecord(record)).rejects.toThrow('fingerprint')
  })
  it('detects forged agent-host attribution independently of a valid content hash', async () => {
    const request = await entry(
      { kind: 'request', project: 'p', host: author, epoch: 'e', parents: [], contextIds: [] },
      'Request',
      'did:key:bob'
    )
    const forged = await entry(
      {
        kind: 'attempt',
        project: 'p',
        request: request.id,
        attempt: 'a',
        status: 'completed',
        phase: '',
        startedAt: 1
      },
      'Done',
      'did:key:eve'
    )
    expect(developmentRelationIssue(forged, [request])).toContain('requested agent host')
  })
})
describe('version graph and acceptance', () => {
  it('retains concurrent acceptances and resolves both explicitly', async () => {
    const p = await project(),
      a = await version(p.id),
      b = await version(p.id, [a.id], 'B')
    const first = await entry({ kind: 'accept', project: p.id, version: a.id, previous: [] })
    const second = await entry({ kind: 'accept', project: p.id, version: b.id, previous: [] })
    expect(acceptedDevelopmentHeads(p, [a, b, first, second]).heads).toHaveLength(2)
    const resolved = await entry({
      kind: 'accept',
      project: p.id,
      version: b.id,
      previous: [first.id, second.id]
    })
    expect(
      acceptedDevelopmentHeads(p, [a, b, first, second, resolved]).heads.map((v) => v.id)
    ).toEqual([resolved.id])
  })
  it('does not let another member promote a version or a missing predecessor erase heads', async () => {
    const p = await project(),
      a = await version(p.id)
    const forged = await entry(
      { kind: 'accept', project: p.id, version: a.id, previous: [] },
      'Accepted',
      'did:key:eve'
    )
    const missing = await entry({
      kind: 'accept',
      project: p.id,
      version: a.id,
      previous: ['not-synced']
    })
    expect(acceptedDevelopmentHeads(p, [a, forged, missing])).toEqual({ heads: [], unresolved: 1 })
  })
  it('deduplicates common ancestors when combining branches and reports missing history', async () => {
    const p = await project(),
      root = await version(p.id),
      a = await version(p.id, [root.id], 'A'),
      b = await version(p.id, [root.id], 'B'),
      merge = await version(p.id, [a.id, b.id], 'Combined')
    expect(developmentAncestry(merge.id, [root, a, b, merge]).versions.map((v) => v.id)).toEqual([
      root.id,
      a.id,
      b.id,
      merge.id
    ])
    expect(developmentAncestry(merge.id, [a, b, merge]).missing).toEqual([root.id])
  })
  it('refuses cross-project ancestry and cycles without recursive overflow', async () => {
    const p = await project(),
      root = await version('other'),
      a = await version(p.id, [root.id])
    expect(developmentAncestry(a.id, [root, a]).missing).toEqual([root.id])
    const cyclic: DevelopmentEntry = {
      ...a,
      record: { ...(a.record as Extract<DevelopmentRecord, { kind: 'version' }>), parents: [a.id] }
    }
    expect(developmentAncestry(a.id, [cyclic]).missing).toEqual([a.id])
  })
})
