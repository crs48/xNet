import { describe, expect, it } from 'vitest'
import { detectSocialPatterns } from '../patterns'

describe('social workspace patterns', () => {
  it('detects explainable social workspace patterns from loaded rows', () => {
    const content = [
      {
        id: 'content-1',
        platform: 'instagram',
        authorActor: 'actor-a',
        actorHandle: '@maker',
        canonicalUrl: 'https://example.com/shared',
        title: 'Shared post',
        privacyClass: 'public',
        visibility: 'public',
        publishedAt: '2026-06-01T10:00:00.000Z'
      },
      {
        id: 'content-2',
        platform: 'youtube',
        authorActor: 'actor-a',
        actorHandle: '@maker',
        canonicalUrl: 'https://example.com/shared',
        title: 'Shared post',
        privacyClass: 'public',
        visibility: 'public',
        publishedAt: '2026-06-01T11:00:00.000Z'
      },
      {
        id: 'content-3',
        platform: 'reddit',
        authorActor: 'actor-a',
        actorHandle: '@maker',
        title: 'Discussion',
        privacyClass: 'private',
        visibility: 'private',
        publishedAt: '2026-06-01T12:00:00.000Z'
      }
    ]
    const interactions = [
      {
        id: 'interaction-1',
        platform: 'instagram',
        interactionKind: 'like',
        targetAuthorActor: 'actor-a',
        targetAuthorHandle: '@maker',
        privacyClass: 'public',
        visibility: 'private',
        observedAt: '2026-06-01T13:00:00.000Z'
      },
      {
        id: 'interaction-2',
        platform: 'youtube',
        interactionKind: 'save',
        targetAuthorActor: 'actor-b',
        targetAuthorHandle: '@teacher',
        privacyClass: 'public',
        visibility: 'private',
        observedAt: '2026-06-01T14:00:00.000Z'
      },
      {
        id: 'interaction-3',
        platform: 'youtube',
        interactionKind: 'save',
        targetAuthorActor: 'actor-b',
        targetAuthorHandle: '@teacher',
        privacyClass: 'public',
        visibility: 'private',
        observedAt: '2026-06-01T15:00:00.000Z'
      },
      {
        id: 'interaction-4',
        platform: 'youtube',
        interactionKind: 'save',
        targetAuthorActor: 'actor-b',
        targetAuthorHandle: '@teacher',
        privacyClass: 'public',
        visibility: 'private',
        observedAt: '2026-06-01T16:00:00.000Z'
      },
      {
        id: 'interaction-5',
        platform: 'youtube',
        interactionKind: 'save',
        targetAuthorActor: 'actor-b',
        targetAuthorHandle: '@teacher',
        privacyClass: 'public',
        visibility: 'private',
        observedAt: '2026-06-01T17:00:00.000Z'
      }
    ]

    const patterns = detectSocialPatterns({
      content,
      interactions,
      importRuns: [{ id: 'run-1' }]
    })

    expect(patterns.map((pattern) => pattern.kind)).toEqual(
      expect.arrayContaining([
        'repeated-creators',
        'bridge-actors',
        'cross-source-overlap',
        'attention-bursts',
        'unrevisited-saves',
        'privacy-hotspots'
      ])
    )
    expect(patterns.find((pattern) => pattern.kind === 'privacy-hotspots')).toMatchObject({
      severity: 'warning',
      sourceImportRunIds: ['run-1']
    })
    expect(patterns.find((pattern) => pattern.kind === 'repeated-creators')?.evidence[0]).toEqual({
      label: 'Creator',
      value: '@maker',
      count: 4
    })
  })

  it('limits suggestions and keeps ids deterministic', () => {
    const input = {
      content: [
        {
          id: 'content-1',
          platform: 'reddit',
          actorHandle: 'same-author',
          privacyClass: 'private',
          visibility: 'private'
        },
        {
          id: 'content-2',
          platform: 'reddit',
          actorHandle: 'same-author',
          privacyClass: 'private',
          visibility: 'private'
        },
        {
          id: 'content-3',
          platform: 'reddit',
          actorHandle: 'same-author',
          privacyClass: 'private',
          visibility: 'private'
        }
      ],
      interactions: [],
      importRuns: [{ id: 'run-1' }],
      maxSuggestions: 1
    }

    const first = detectSocialPatterns(input)
    const second = detectSocialPatterns(input)

    expect(first).toHaveLength(1)
    expect(first[0]?.id).toBe(second[0]?.id)
  })
})
