import { describe, expect, it } from 'vitest'
import {
  createLargeArchiveStoragePlan,
  createSocialNodeId,
  createStagingSummary,
  detectSocialArchive,
  grokAdapter,
  instagramAdapter,
  mapGrokBackend,
  mapInstagramFollowing,
  mapInstagramFollowers,
  mapInstagramComments,
  mapInstagramLikedPosts,
  mapInstagramMessages,
  mapInstagramProfile,
  mapInstagramReels,
  mapInstagramSavedPosts,
  sanitizeStagedRecordsForFixture,
  type ArchiveEntryRef,
  type ArchiveManifest,
  type SocialImportContext,
  type StagedSocialRecord
} from '..'

const importedAt = '2026-06-06T00:00:00.000Z'

function entry(path: string, byteSize = 1024): ArchiveEntryRef {
  return {
    path,
    byteSize,
    compressedByteSize: byteSize,
    sha256: createSocialNodeId('entry-hash', [path, byteSize])
  }
}

function manifest(entries: ArchiveEntryRef[]): ArchiveManifest {
  return {
    filename: 'sample.zip',
    byteSize: entries.reduce((total, item) => total + item.byteSize, 0),
    archiveHash: createSocialNodeId(
      'archive-hash',
      entries.map((item) => item.path)
    ),
    entries
  }
}

function context(
  archiveManifest: ArchiveManifest,
  fixtures: Record<string, unknown>
): SocialImportContext {
  return {
    manifest: archiveManifest,
    archiveId: 'social:archive:test',
    importRunId: 'social:import-run:test',
    observedBy: 'did:key:test',
    importedAt,
    readJsonEntry: async <T>(path: string) => fixtures[path] as T
  }
}

function byKind(records: readonly StagedSocialRecord[], kind: StagedSocialRecord['kind']) {
  return records.filter((record) => record.kind === kind)
}

describe('social import adapters', () => {
  describe('detection and selection', () => {
    it('detects Instagram and keeps private message buckets disabled by default', async () => {
      const followingPath = 'connections/followers_and_following/following.json'
      const messagePath = 'your_instagram_activity/messages/inbox/person_123/message_1.json'
      const archiveManifest = manifest([entry(followingPath), entry(messagePath)])

      expect(
        detectSocialArchive([instagramAdapter, grokAdapter], archiveManifest)?.adapter.id
      ).toBe('instagram')

      const probe = await instagramAdapter.probe({ manifest: archiveManifest })
      expect(
        probe.buckets.find((bucket) => bucket.id === 'instagram.following')?.defaultSelected
      ).toBe(true)
      expect(
        probe.buckets.find((bucket) => bucket.id === 'instagram.messages')?.defaultSelected
      ).toBe(false)

      const records: StagedSocialRecord[] = []
      for await (const record of instagramAdapter.stage(
        context(archiveManifest, {
          [followingPath]: {
            relationships_following: [
              {
                title: 'Example Creator',
                string_list_data: [{ href: 'https://instagram.com/example', timestamp: 1700000000 }]
              }
            ]
          },
          [messagePath]: {
            participants: [{ name: 'Self' }, { name: 'Example Creator' }],
            messages: [
              { sender_name: 'Self', timestamp_ms: 1700000000000, content: 'Private text' }
            ],
            title: 'Example Creator',
            thread_path: 'inbox/example'
          }
        })
      )) {
        records.push(record)
      }

      expect(records.some((record) => record.bucketId === 'instagram.following')).toBe(true)
      expect(records.some((record) => record.bucketId === 'instagram.messages')).toBe(false)
    })

    it('detects Grok and marks conversations as private by default', async () => {
      const backendPath = 'ttl/30d/export_data/test/prod-grok-backend.json'
      const archiveManifest = manifest([entry(backendPath, 293_000_000)])

      expect(
        detectSocialArchive([instagramAdapter, grokAdapter], archiveManifest)?.adapter.id
      ).toBe('grok')

      const probe = await grokAdapter.probe({ manifest: archiveManifest })
      expect(
        probe.buckets.find((bucket) => bucket.id === 'grok.conversations')?.defaultSelected
      ).toBe(false)
    })
  })

  describe('Instagram mappers', () => {
    it('maps profile records into the self actor without exposing raw labels', () => {
      const selfActorId = createSocialNodeId('actor', ['instagram', 'self'])
      const records = mapInstagramProfile({
        context: {
          archiveId: 'archive',
          importRunId: 'run',
          observedBy: 'did:key:test',
          importedAt
        },
        source: entry('personal_information/personal_information/personal_information.json'),
        selfActorId,
        input: {
          profile_user: [
            {
              title: 'Example Self',
              string_map_data: {
                Username: { value: 'example_self' },
                Website: { href: 'https://example.invalid/profile' }
              }
            }
          ]
        }
      })

      expect(byKind(records, 'actor')).toHaveLength(1)
      expect(byKind(records, 'actor')[0].deterministicId).toBe(selfActorId)
      expect(byKind(records, 'actor')[0].properties.isSelf).toBe(true)
      expect(byKind(records, 'actor')[0].privacyClass).toBe('private')
    })

    it('maps following records into actors and follow interactions with stable IDs', () => {
      const source = entry('connections/followers_and_following/following.json')
      const selfActorId = createSocialNodeId('actor', ['instagram', 'self'])
      const records = mapInstagramFollowing({
        context: {
          archiveId: 'archive',
          importRunId: 'run',
          observedBy: 'did:key:test',
          importedAt
        },
        source,
        selfActorId,
        input: {
          relationships_following: [
            {
              title: 'Example Creator',
              string_list_data: [
                { href: 'https://instagram.com/ExampleCreator/', timestamp: 1700000000 }
              ]
            }
          ]
        }
      })
      const repeated = mapInstagramFollowing({
        context: {
          archiveId: 'archive',
          importRunId: 'run',
          observedBy: 'did:key:test',
          importedAt
        },
        source,
        selfActorId,
        input: {
          relationships_following: [
            {
              title: 'Example Creator',
              string_list_data: [
                { href: 'https://instagram.com/ExampleCreator/', timestamp: 1700000000 }
              ]
            }
          ]
        }
      })

      expect(byKind(records, 'source-record')).toHaveLength(1)
      expect(byKind(records, 'actor')).toHaveLength(1)
      expect(byKind(records, 'interaction')).toHaveLength(1)
      expect(byKind(records, 'actor')[0].properties.handle).toBe('example creator')
      expect(records.map((record) => record.deterministicId)).toEqual(
        repeated.map((record) => record.deterministicId)
      )
    })

    it('maps saved posts into a collection, content, save interaction, and collection item', () => {
      const records = mapInstagramSavedPosts({
        context: {
          archiveId: 'archive',
          importRunId: 'run',
          observedBy: 'did:key:test',
          importedAt
        },
        source: entry('your_instagram_activity/saved/saved_posts.json'),
        selfActorId: createSocialNodeId('actor', ['instagram', 'self']),
        input: [
          {
            timestamp: 1700000000,
            fbid: 'post-1',
            label_values: [
              { label: 'Title', value: 'A saved post' },
              { label: 'Href', href: 'https://instagram.com/p/post-1/' }
            ],
            media: []
          }
        ]
      })

      expect(byKind(records, 'collection')).toHaveLength(1)
      expect(byKind(records, 'content')).toHaveLength(1)
      expect(byKind(records, 'interaction')).toHaveLength(1)
      expect(byKind(records, 'collection-item')).toHaveLength(1)
    })

    it('maps followers, liked posts, comments, and reels into canonical records', () => {
      const common = {
        context: {
          archiveId: 'archive',
          importRunId: 'run',
          observedBy: 'did:key:test',
          importedAt
        },
        selfActorId: createSocialNodeId('actor', ['instagram', 'self'])
      }
      const followerRecords = mapInstagramFollowers({
        ...common,
        source: entry('connections/followers_and_following/followers_1.json'),
        input: [
          {
            title: 'Follower Account',
            string_list_data: [{ href: 'https://instagram.com/follower', timestamp: 1700000000 }]
          }
        ]
      })
      const likedRecords = mapInstagramLikedPosts({
        ...common,
        source: entry('your_instagram_activity/likes/liked_posts.json'),
        input: [
          {
            timestamp: 1700000001,
            fbid: 'liked-post-1',
            label_values: [{ label: 'Href', href: 'https://instagram.com/p/liked-post-1/' }]
          }
        ]
      })
      const commentRecords = mapInstagramComments({
        ...common,
        source: entry('your_instagram_activity/comments/post_comments_1.json'),
        input: [
          {
            media_list_data: [{ uri: 'media/posts/post.jpg' }],
            string_map_data: {
              Comment: { value: 'Comment text', href: 'https://instagram.com/p/commented/' },
              'Media Owner': { value: 'Owner Account' },
              Time: { timestamp: 1700000002 }
            }
          }
        ]
      })
      const reelRecords = mapInstagramReels({
        ...common,
        source: entry('your_instagram_activity/media/reels.json'),
        input: {
          ig_reels_media: [
            {
              uri: 'media/reels/reel.mp4',
              creation_timestamp: 1700000003,
              title: 'Reel title'
            }
          ]
        }
      })

      expect(byKind(followerRecords, 'interaction')[0].properties.platformInteractionKind).toBe(
        'relationships_followers'
      )
      expect(byKind(likedRecords, 'interaction')[0].properties.interactionKind).toBe('like')
      expect(byKind(commentRecords, 'content')[0].properties.contentKind).toBe('comment')
      expect(byKind(reelRecords, 'content')[0].properties.platformContentKind).toBe('reel')
    })

    it('maps message threads with third-party-private privacy and encoding warnings', () => {
      const records = mapInstagramMessages({
        context: {
          archiveId: 'archive',
          importRunId: 'run',
          observedBy: 'did:key:test',
          importedAt
        },
        source: entry('your_instagram_activity/messages/inbox/example_123/message_1.json'),
        selfActorId: createSocialNodeId('actor', ['instagram', 'self']),
        input: {
          participants: [{ name: 'Self' }, { name: 'Example Creator' }],
          title: 'Example Creator',
          thread_path: 'inbox/example',
          is_still_participant: true,
          messages: [
            {
              sender_name: 'Example Creator',
              timestamp_ms: 1700000000000,
              content: 'Mojibake Ã© sample',
              share: { link: 'https://example.invalid/post', share_text: 'Shared text' },
              reactions: [{ reaction: 'heart' }]
            }
          ]
        }
      })

      expect(byKind(records, 'conversation')).toHaveLength(1)
      expect(byKind(records, 'message')).toHaveLength(1)
      expect(byKind(records, 'message')[0].privacyClass).toBe('third-party-private')
      expect(byKind(records, 'message')[0].warnings).toContain('possible mojibake encoding anomaly')
    })
  })

  describe('Grok mappers', () => {
    it('maps conversations, prompts, AI responses, citations, media posts, projects, and tasks', () => {
      const records = mapGrokBackend({
        context: {
          archiveId: 'archive',
          importRunId: 'run',
          observedBy: 'did:key:test',
          importedAt
        },
        source: entry('ttl/30d/export_data/test/prod-grok-backend.json', 293_000_000),
        input: {
          conversations: [
            {
              conversation: {
                id: 'conversation-1',
                title: 'Research chat',
                create_time: '2026-06-01T00:00:00.000Z',
                modify_time: '2026-06-01T00:10:00.000Z',
                starred: true,
                temporary: false,
                asset_ids: ['asset-1']
              },
              responses: [
                {
                  response: {
                    _id: 'response-1',
                    conversation_id: 'conversation-1',
                    create_time: '2026-06-01T00:01:00.000Z',
                    message: 'Question text',
                    sender: 'human',
                    model: 'grok-test'
                  }
                },
                {
                  response: {
                    _id: 'response-2',
                    conversation_id: 'conversation-1',
                    create_time: '2026-06-01T00:02:00.000Z',
                    message: 'Answer text',
                    sender: 'ASSISTANT',
                    model: 'grok-test',
                    metadata: {
                      citations: [{ url: 'https://example.invalid/source', title: 'Source' }]
                    }
                  },
                  share_link: 'https://grok.example.invalid/share'
                }
              ]
            }
          ],
          media_posts: [
            {
              id: 'media-1',
              create_time: '2026-06-01T00:03:00.000Z',
              link: 'https://example.invalid/media',
              media_type: 'image',
              original_prompt: 'Image prompt'
            }
          ],
          projects: [{ id: 'project-1', title: 'Research Project' }],
          tasks: [{ id: 'task-1', title: 'Task title' }]
        }
      })

      expect(byKind(records, 'actor')).toHaveLength(2)
      expect(byKind(records, 'conversation')).toHaveLength(1)
      expect(byKind(records, 'message')).toHaveLength(2)
      expect(byKind(records, 'content')).toHaveLength(2)
      expect(byKind(records, 'collection')).toHaveLength(1)
      expect(
        byKind(records, 'interaction').some(
          (record) => record.properties.platformInteractionKind === 'web_citation'
        )
      ).toBe(true)
      expect(byKind(records, 'message').map((record) => record.properties.messageKind)).toEqual([
        'prompt',
        'ai-response'
      ])
    })
  })

  describe('staging utilities', () => {
    it('summarizes staged records and sanitizes fixture content', () => {
      const records = mapInstagramMessages({
        context: {
          archiveId: 'archive',
          importRunId: 'run',
          observedBy: 'did:key:test',
          importedAt
        },
        source: entry('your_instagram_activity/messages/inbox/example_123/message_1.json'),
        selfActorId: createSocialNodeId('actor', ['instagram', 'self']),
        input: {
          participants: [{ name: 'Self' }, { name: 'Example Creator' }],
          title: 'Example Creator',
          thread_path: 'inbox/example',
          messages: [{ sender_name: 'Self', timestamp_ms: 1700000000000, content: 'Secret' }]
        }
      })
      const summary = createStagingSummary(records)
      const sanitized = sanitizeStagedRecordsForFixture(records)

      expect(summary.totalRecords).toBe(records.length)
      expect(
        summary.bucketSummaries[0].recordsByPrivacyClass['third-party-private']
      ).toBeGreaterThan(0)
      expect(JSON.stringify(sanitized)).not.toContain('Secret')
      expect(JSON.stringify(sanitized)).not.toContain('Example Creator')
    })

    it('plans entry-level blob storage for large archives', () => {
      const plan = createLargeArchiveStoragePlan(
        manifest([
          entry('large.json', 150_000_000),
          entry('media/post.jpg', 1_000_000),
          entry('notes/readme.txt', 1000)
        ])
      )

      expect(plan.mode).toBe('entry-level-blobs')
      expect(plan.entryBlobPaths).toEqual(['large.json', 'media/post.jpg'])
      expect(plan.skippedBlobPaths).toEqual(['notes/readme.txt'])
    })
  })
})
