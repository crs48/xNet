/**
 * @xnetjs/hub - Query authorization filtering tests.
 */

import { describe, expect, it } from 'vitest'
import { QueryService, type IndexUpdate, type QueryRequest } from '../src/services/query'
import { createMemoryStorage } from '../src/storage/memory'

const createQueryRequest = (query: string): QueryRequest => ({
  type: 'query-request',
  id: 'q1',
  query
})

const createIndexUpdate = (input: {
  docId: string
  schemaIri?: string
  title: string
  recipients?: string[]
  properties?: Record<string, unknown>
  text?: string
}): IndexUpdate => ({
  type: 'index-update',
  docId: input.docId,
  meta: {
    schemaIri: input.schemaIri ?? 'xnet://xnet.dev/Page',
    title: input.title,
    recipients: input.recipients,
    properties: input.properties
  },
  text: input.text
})

describe('QueryService authorization filter', () => {
  it('returns only docs where subject is owner, recipient, or PUBLIC', async () => {
    const storage = createMemoryStorage()
    const service = new QueryService(storage)

    await service.handleIndexUpdate(
      'doc-owner',
      'did:key:alice',
      createIndexUpdate({ docId: 'doc-owner', title: 'Owner Alpha', text: 'alpha owner content' })
    )
    await service.handleIndexUpdate(
      'doc-recipient',
      'did:key:bob',
      createIndexUpdate({
        docId: 'doc-recipient',
        title: 'Recipient Alpha',
        recipients: ['did:key:alice'],
        text: 'alpha recipient content'
      })
    )
    await service.handleIndexUpdate(
      'doc-public',
      'did:key:carol',
      createIndexUpdate({
        docId: 'doc-public',
        title: 'Public Alpha',
        recipients: ['PUBLIC'],
        text: 'alpha public content'
      })
    )
    await service.handleIndexUpdate(
      'doc-hidden',
      'did:key:bob',
      createIndexUpdate({
        docId: 'doc-hidden',
        title: 'Hidden Alpha',
        recipients: ['did:key:dave'],
        text: 'alpha hidden content'
      })
    )

    const response = await service.handleQuery(createQueryRequest('alpha'), 'did:key:alice')

    expect(response.results.map((result) => result.docId).sort()).toEqual([
      'doc-owner',
      'doc-public',
      'doc-recipient'
    ])
  })

  it('includes docs from active grants and excludes revoked/expired grants', async () => {
    const storage = createMemoryStorage()
    const service = new QueryService(storage)

    await service.handleIndexUpdate(
      'doc-granted-active',
      'did:key:owner',
      createIndexUpdate({
        docId: 'doc-granted-active',
        title: 'Active Grant Alpha',
        recipients: ['did:key:owner'],
        text: 'alpha active grant content'
      })
    )
    await service.handleIndexUpdate(
      'doc-granted-revoked',
      'did:key:owner',
      createIndexUpdate({
        docId: 'doc-granted-revoked',
        title: 'Revoked Grant Alpha',
        recipients: ['did:key:owner'],
        text: 'alpha revoked grant content'
      })
    )
    await service.handleIndexUpdate(
      'doc-granted-expired',
      'did:key:owner',
      createIndexUpdate({
        docId: 'doc-granted-expired',
        title: 'Expired Grant Alpha',
        recipients: ['did:key:owner'],
        text: 'alpha expired grant content'
      })
    )

    const now = Date.now()

    await service.handleIndexUpdate(
      'grant-active',
      'did:key:owner',
      createIndexUpdate({
        docId: 'grant-active',
        schemaIri: 'xnet://xnet.fyi/Grant',
        title: 'Grant active',
        properties: {
          grantee: 'did:key:alice',
          resource: 'doc-granted-active',
          actions: ['read'],
          revokedAt: 0,
          expiresAt: now + 60_000
        }
      })
    )

    await service.handleIndexUpdate(
      'grant-revoked',
      'did:key:owner',
      createIndexUpdate({
        docId: 'grant-revoked',
        schemaIri: 'xnet://xnet.fyi/Grant',
        title: 'Grant revoked',
        properties: {
          grantee: 'did:key:alice',
          resource: 'doc-granted-revoked',
          actions: ['read'],
          revokedAt: now - 1,
          expiresAt: now + 60_000
        }
      })
    )

    await service.handleIndexUpdate(
      'grant-expired',
      'did:key:owner',
      createIndexUpdate({
        docId: 'grant-expired',
        schemaIri: 'xnet://xnet.fyi/Grant',
        title: 'Grant expired',
        properties: {
          grantee: 'did:key:alice',
          resource: 'doc-granted-expired',
          actions: ['read'],
          revokedAt: 0,
          expiresAt: now - 1
        }
      })
    )

    const response = await service.handleQuery(createQueryRequest('alpha'), 'did:key:alice')

    expect(response.results.map((result) => result.docId)).toEqual(['doc-granted-active'])
  })
})
