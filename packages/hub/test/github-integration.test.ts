import { createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  parseBranchTaskId,
  parseTaskLinks,
  processGithubEvent,
  verifyWebhookSignature
} from '../src/services/github-integration'

describe('parseTaskLinks', () => {
  it('parses closing magic words', () => {
    const { closes, refs } = parseTaskLinks('Fixes XN-142 and closes ops-7. Also fixed XN-9.')
    expect(closes).toEqual(['XN-142', 'OPS-7', 'XN-9'])
    expect(refs).toEqual([])
  })

  it('parses references and bare identifiers without closing semantics', () => {
    const { closes, refs } = parseTaskLinks('Ref XN-1; related to XN-2 somehow')
    expect(closes).toEqual([])
    expect(refs).toEqual(['XN-1', 'XN-2'])
  })

  it('deduplicates and prefers closing semantics', () => {
    const { closes, refs } = parseTaskLinks('Fixes XN-5. See XN-5 for details. Refs XN-5.')
    expect(closes).toEqual(['XN-5'])
    expect(refs).toEqual([])
  })
})

describe('parseBranchTaskId', () => {
  it('extracts identifiers from branch names', () => {
    expect(parseBranchTaskId('crs/xn-142-fix-grid')).toBe('XN-142')
    expect(parseBranchTaskId('xn-142-fix-grid')).toBe('XN-142')
    expect(parseBranchTaskId('feature/no-task-here')).toBeNull()
  })
})

describe('verifyWebhookSignature', () => {
  it('accepts a valid sha256 signature and rejects others', () => {
    const secret = 'shhh'
    const body = JSON.stringify({ hello: 'world' })
    const signature = `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`

    expect(verifyWebhookSignature(secret, body, signature)).toBe(true)
    expect(verifyWebhookSignature(secret, body, 'sha256=deadbeef')).toBe(false)
    expect(verifyWebhookSignature(secret, body, undefined)).toBe(false)
    expect(verifyWebhookSignature('wrong', body, signature)).toBe(false)
  })
})

describe('processGithubEvent', () => {
  const basePr = {
    number: 12,
    title: 'Fix the grid',
    body: 'Fixes XN-142',
    draft: false,
    merged: false,
    html_url: 'https://github.com/acme/app/pull/12',
    head: { ref: 'crs/xn-142-fix-grid' },
    base: { repo: { full_name: 'acme/app' } }
  }

  it('links and moves tasks to in-review when a PR opens', () => {
    const actions = processGithubEvent('pull_request', { action: 'opened', pull_request: basePr })

    expect(actions).toContainEqual({
      type: 'link',
      shortId: 'XN-142',
      reference: {
        url: 'https://github.com/acme/app/pull/12',
        provider: 'github',
        kind: 'pull-request',
        refId: 'acme/app#12',
        title: 'Fix the grid'
      }
    })
    expect(actions).toContainEqual({ type: 'set-status', shortId: 'XN-142', status: 'in-review' })
  })

  it('keeps draft PRs inert beyond linking', () => {
    const actions = processGithubEvent('pull_request', {
      action: 'opened',
      pull_request: { ...basePr, draft: true }
    })

    expect(actions.some((action) => action.type === 'set-status')).toBe(false)
    expect(actions.some((action) => action.type === 'link')).toBe(true)
  })

  it('moves closing tasks to done on merge', () => {
    const actions = processGithubEvent('pull_request', {
      action: 'closed',
      pull_request: { ...basePr, merged: true }
    })

    expect(actions).toContainEqual({ type: 'set-status', shortId: 'XN-142', status: 'done' })
  })

  it('reverts tasks to in-progress when a PR closes without merging', () => {
    const actions = processGithubEvent('pull_request', {
      action: 'closed',
      pull_request: { ...basePr, merged: false }
    })

    expect(actions).toContainEqual({
      type: 'set-status',
      shortId: 'XN-142',
      status: 'in-progress'
    })
  })

  it('links branch pushes and commit magic words', () => {
    const actions = processGithubEvent('push', {
      ref: 'refs/heads/crs/xn-9-polish',
      repository: { full_name: 'acme/app' },
      commits: [
        {
          id: 'abcdef1234567',
          message: 'polish styles\n\nRefs XN-10',
          url: 'https://github.com/acme/app/commit/abcdef1'
        }
      ]
    })

    expect(actions).toContainEqual({
      type: 'link',
      shortId: 'XN-9',
      reference: {
        url: 'https://github.com/acme/app/tree/crs/xn-9-polish',
        provider: 'github',
        kind: 'link',
        refId: 'acme/app:crs/xn-9-polish',
        title: 'crs/xn-9-polish'
      }
    })
    expect(actions).toContainEqual({
      type: 'link',
      shortId: 'XN-10',
      reference: expect.objectContaining({ kind: 'link', refId: 'abcdef1' })
    })
  })

  it('ignores unrelated events', () => {
    expect(processGithubEvent('issues', {})).toEqual([])
    expect(processGithubEvent('pull_request', { action: 'opened' })).toEqual([])
  })
})
