import { describe, expect, it } from 'vitest'
import {
  claudeAdapter,
  builtInSocialImportAdapters,
  builtInSocialImporterRegistry,
  createLargeArchiveStoragePlan,
  createSocialNodeId,
  createStagingSummary,
  detectSocialArchive,
  findSocialImporterRegistryEntry,
  grokAdapter,
  instagramAdapter,
  listAvailableSocialImportAdapters,
  mapGrokBackend,
  mapInstagramFollowing,
  mapInstagramFollowers,
  mapInstagramComments,
  mapInstagramLikedPosts,
  mapInstagramMessages,
  mapInstagramProfile,
  mapInstagramReels,
  mapInstagramSavedPosts,
  mapClaudeConversations,
  mapClaudeFiles,
  mapClaudeProfile,
  mapClaudeProject,
  mapRedditAuthoredContent,
  mapRedditChatHistory,
  mapRedditPrivateMessages,
  mapRedditProfile,
  mapRedditSavedAndHiddenItems,
  mapRedditSubredditMemberships,
  mapRedditVotes,
  redditAdapter,
  mapTikTokComments,
  mapTikTokContentInteractions,
  mapTikTokDirectMessages,
  mapTikTokFavoriteCollections,
  mapTikTokHashtags,
  mapTikTokProfile,
  mapTikTokRelationships,
  mapTikTokSearches,
  mapTikTokShares,
  mapXDirectMessages,
  mapXGrokChatItems,
  mapXLikes,
  mapXLists,
  mapXProfile,
  mapXRelationships,
  mapXTweets,
  mapYouTubeChannel,
  mapYouTubeComments,
  mapYouTubeMusicLibrary,
  mapYouTubePlaylists,
  mapYouTubeSearchHistory,
  mapYouTubeSubscriptions,
  mapYouTubeWatchHistory,
  parseRedditCsv,
  parseTwitterArchiveJs,
  parseYouTubeCsv,
  sanitizeStagedRecordsForFixture,
  tiktokAdapter,
  type ArchiveEntryRef,
  type ArchiveManifest,
  type SocialImportContext,
  type StagedSocialRecord,
  xAdapter,
  youtubeAdapter
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
  fixtures: Record<string, unknown>,
  textFixtures: Record<string, string> = {}
): SocialImportContext {
  return {
    manifest: archiveManifest,
    archiveId: 'social:archive:test',
    importRunId: 'social:import-run:test',
    observedBy: 'did:key:test',
    importedAt,
    readJsonEntry: async <T>(path: string) => fixtures[path] as T,
    readTextEntry: async (path: string) => textFixtures[path] ?? ''
  }
}

function byKind(records: readonly StagedSocialRecord[], kind: StagedSocialRecord['kind']) {
  return records.filter((record) => record.kind === kind)
}

describe('social import adapters', () => {
  describe('importer registry', () => {
    it('exposes available adapters and planned importer metadata from one registry', () => {
      const availableEntries = builtInSocialImporterRegistry.filter(
        (entry) => entry.availability === 'available'
      )
      const plannedEntries = builtInSocialImporterRegistry.filter(
        (entry) => entry.availability === 'planned'
      )

      expect(listAvailableSocialImportAdapters().map((adapter) => adapter.id)).toEqual(
        availableEntries.map((entry) => entry.id)
      )
      expect(builtInSocialImportAdapters.map((adapter) => adapter.id)).toEqual([
        'instagram',
        'grok',
        'youtube',
        'x',
        'tiktok',
        'claude',
        'reddit'
      ])
      expect(plannedEntries.map((entry) => entry.id)).toContain('openai')
      expect(plannedEntries.every((entry) => entry.adapter === undefined)).toBe(true)
      expect(findSocialImporterRegistryEntry('instagram')?.adapter?.id).toBe('instagram')
    })
  })

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
        detectSocialArchive([instagramAdapter, grokAdapter, youtubeAdapter], archiveManifest)
          ?.adapter.id
      ).toBe('grok')

      const probe = await grokAdapter.probe({ manifest: archiveManifest })
      expect(
        probe.buckets.find((bucket) => bucket.id === 'grok.conversations')?.defaultSelected
      ).toBe(false)
    })

    it('detects Claude exports and keeps conversations disabled by default', async () => {
      const usersPath = 'users.json'
      const conversationsPath = 'conversations.json'
      const archiveManifest = manifest([entry(usersPath), entry(conversationsPath)])

      expect(
        detectSocialArchive(
          [instagramAdapter, grokAdapter, claudeAdapter, youtubeAdapter],
          archiveManifest
        )?.adapter.id
      ).toBe('claude')

      const probe = await claudeAdapter.probe({ manifest: archiveManifest })
      expect(
        probe.buckets.find((bucket) => bucket.id === 'claude.conversations')?.defaultSelected
      ).toBe(false)

      const records: StagedSocialRecord[] = []
      for await (const record of claudeAdapter.stage(
        context(archiveManifest, {
          [usersPath]: [
            {
              uuid: 'user-1',
              full_name: 'Example User',
              email_address: 'private@example.invalid'
            }
          ],
          [conversationsPath]: [
            {
              uuid: 'conversation-1',
              name: 'Private conversation',
              chat_messages: [{ uuid: 'message-1', sender: 'human', text: 'Private text' }]
            }
          ]
        })
      )) {
        records.push(record)
      }

      expect(records).toEqual([])
    })

    it('detects Reddit exports and keeps private activity disabled by default', async () => {
      const postsPath = 'posts.csv'
      const commentsPath = 'comments.csv'
      const postVotesPath = 'post_votes.csv'
      const checkfilePath = 'checkfile.csv'
      const archiveManifest = manifest([
        entry(postsPath),
        entry(commentsPath),
        entry(postVotesPath),
        entry(checkfilePath)
      ])

      expect(
        detectSocialArchive(
          [instagramAdapter, grokAdapter, claudeAdapter, redditAdapter, youtubeAdapter],
          archiveManifest
        )?.adapter.id
      ).toBe('reddit')

      const probe = await redditAdapter.probe({ manifest: archiveManifest })
      expect(
        probe.buckets.find((bucket) => bucket.id === 'reddit.authored-content')?.defaultSelected
      ).toBe(true)
      expect(probe.buckets.find((bucket) => bucket.id === 'reddit.votes')?.defaultSelected).toBe(
        false
      )

      const records: StagedSocialRecord[] = []
      for await (const record of redditAdapter.stage(
        context(
          archiveManifest,
          {},
          {
            [postsPath]:
              'id,permalink,date,ip,subreddit,gildings,title,url,body\npost-1,/r/example/comments/post_1/title,2026-01-01T00:00:00Z,127.0.0.1,example,0,Post title,https://example.invalid,Post body',
            [commentsPath]:
              'id,permalink,date,ip,subreddit,gildings,gildings_silver,gildings_supergold,link,parent,body,media\ncomment-1,/r/example/comments/post_1/_/comment_1,2026-01-01T00:00:00Z,127.0.0.1,example,0,0,0,/r/example/comments/post_1,t3_post_1,Comment text,',
            [postVotesPath]: 'id,permalink,direction\npost-1,/r/example/comments/post_1/title,up',
            [checkfilePath]: 'filename,sha256\nposts.csv,hash'
          }
        )
      )) {
        records.push(record)
      }

      expect(records.some((record) => record.bucketId === 'reddit.authored-content')).toBe(true)
      expect(records.some((record) => record.bucketId === 'reddit.votes')).toBe(false)
    })

    it('detects YouTube Takeout and keeps history disabled by default', async () => {
      const subscriptionsPath = 'Takeout/YouTube and YouTube Music/subscriptions/subscriptions.csv'
      const watchHistoryPath = 'Takeout/YouTube and YouTube Music/history/watch-history.json'
      const archiveManifest = manifest([entry(subscriptionsPath), entry(watchHistoryPath)])

      expect(
        detectSocialArchive([instagramAdapter, grokAdapter, youtubeAdapter], archiveManifest)
          ?.adapter.id
      ).toBe('youtube')

      const probe = await youtubeAdapter.probe({ manifest: archiveManifest })
      expect(
        probe.buckets.find((bucket) => bucket.id === 'youtube.subscriptions')?.defaultSelected
      ).toBe(true)
      expect(probe.buckets.find((bucket) => bucket.id === 'youtube.history')?.defaultSelected).toBe(
        false
      )

      const records: StagedSocialRecord[] = []
      for await (const record of youtubeAdapter.stage(
        context(
          archiveManifest,
          {
            [watchHistoryPath]: [
              {
                title: 'Watched Private video',
                titleUrl: 'https://www.youtube.com/watch?v=private-video',
                time: importedAt
              }
            ]
          },
          {
            [subscriptionsPath]:
              'Channel Id,Channel Url,Channel Title\nUC123,https://www.youtube.com/channel/UC123,Example Channel'
          }
        )
      )) {
        records.push(record)
      }

      expect(records.some((record) => record.bucketId === 'youtube.subscriptions')).toBe(true)
      expect(records.some((record) => record.bucketId === 'youtube.history')).toBe(false)
    })

    it('detects X archives and keeps direct messages disabled by default', async () => {
      const manifestPath = 'data/manifest.js'
      const followingPath = 'data/following.js'
      const dmPath = 'data/direct-messages.js'
      const archiveManifest = manifest([entry(manifestPath), entry(followingPath), entry(dmPath)])

      expect(
        detectSocialArchive(
          [instagramAdapter, grokAdapter, youtubeAdapter, xAdapter],
          archiveManifest
        )?.adapter.id
      ).toBe('x')

      const probe = await xAdapter.probe({ manifest: archiveManifest })
      expect(probe.buckets.find((bucket) => bucket.id === 'x.following')?.defaultSelected).toBe(
        true
      )
      expect(
        probe.buckets.find((bucket) => bucket.id === 'x.direct-messages')?.defaultSelected
      ).toBe(false)

      const records: StagedSocialRecord[] = []
      for await (const record of xAdapter.stage(
        context(
          archiveManifest,
          {},
          {
            [followingPath]: twitterJs('following', [
              {
                following: {
                  accountId: 'account-1',
                  userLink: 'https://twitter.com/intent/user?user_id=account-1'
                }
              }
            ]),
            [dmPath]: twitterJs('direct_messages', [
              {
                dmConversation: {
                  conversationId: 'account-1-self',
                  messages: [
                    {
                      messageCreate: {
                        id: 'message-1',
                        senderId: 'account-1',
                        recipientId: 'self',
                        text: 'Private text',
                        createdAt: importedAt
                      }
                    }
                  ]
                }
              }
            ])
          }
        )
      )) {
        records.push(record)
      }

      expect(records.some((record) => record.bucketId === 'x.following')).toBe(true)
      expect(records.some((record) => record.bucketId === 'x.direct-messages')).toBe(false)
    })

    it('detects TikTok archives and keeps sensitive buckets disabled by default', async () => {
      const tiktokPath = 'user_data_tiktok.json'
      const archiveManifest = manifest([entry(tiktokPath)])

      expect(
        detectSocialArchive(
          [instagramAdapter, grokAdapter, youtubeAdapter, xAdapter, tiktokAdapter],
          archiveManifest
        )?.adapter.id
      ).toBe('tiktok')

      const probe = await tiktokAdapter.probe({ manifest: archiveManifest })
      expect(
        probe.buckets.find((bucket) => bucket.id === 'tiktok.following')?.defaultSelected
      ).toBe(true)
      expect(
        probe.buckets.find((bucket) => bucket.id === 'tiktok.direct-messages')?.defaultSelected
      ).toBe(false)

      const records: StagedSocialRecord[] = []
      for await (const record of tiktokAdapter.stage(
        context(archiveManifest, {
          [tiktokPath]: {
            'Profile And Settings': {
              Following: {
                Following: [{ Date: '2026-01-01 00:00:00', UserName: 'creator' }]
              }
            },
            'Direct Message': {
              'Direct Messages': {
                ChatHistory: {
                  'Chat History with creator:': [
                    { Date: '2026-01-01 00:00:00', From: 'creator', Content: 'Private text' }
                  ]
                }
              }
            }
          }
        })
      )) {
        records.push(record)
      }

      expect(records.some((record) => record.bucketId === 'tiktok.following')).toBe(true)
      expect(records.some((record) => record.bucketId === 'tiktok.direct-messages')).toBe(false)
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

  describe('YouTube mappers', () => {
    it('parses Takeout CSV rows and maps channel subscriptions into follow edges', () => {
      const rows = parseYouTubeCsv(
        'Channel Id,Channel Url,Channel Title\nUC123,https://www.youtube.com/channel/UC123,Example Channel'
      )
      const source = entry('Takeout/YouTube and YouTube Music/subscriptions/subscriptions.csv')
      const selfActorId = createSocialNodeId('actor', ['youtube', 'self'])
      const records = mapYouTubeSubscriptions({
        context: {
          archiveId: 'archive',
          importRunId: 'run',
          observedBy: 'did:key:test',
          importedAt
        },
        source,
        selfActorId,
        rows
      })
      const repeated = mapYouTubeSubscriptions({
        context: {
          archiveId: 'archive',
          importRunId: 'run',
          observedBy: 'did:key:test',
          importedAt
        },
        source,
        selfActorId,
        rows
      })

      expect(rows[0]['Channel Title']).toBe('Example Channel')
      expect(byKind(records, 'actor')).toHaveLength(1)
      expect(byKind(records, 'interaction')).toHaveLength(1)
      expect(byKind(records, 'interaction')[0].properties.interactionKind).toBe('follow')
      expect(records.map((record) => record.deterministicId)).toEqual(
        repeated.map((record) => record.deterministicId)
      )
    })

    it('maps channel, comments, playlists, music library, and history into canonical records', () => {
      const common = {
        context: {
          archiveId: 'archive',
          importRunId: 'run',
          observedBy: 'did:key:test',
          importedAt
        },
        selfActorId: createSocialNodeId('actor', ['youtube', 'self'])
      }
      const channelRecords = mapYouTubeChannel({
        ...common,
        source: entry('Takeout/YouTube and YouTube Music/channels/channel.csv'),
        rows: [
          {
            'Channel ID': 'UCSELF',
            'Channel Title (Original)': 'Self Channel',
            'Channel Visibility': 'Public'
          }
        ]
      })
      const commentRecords = mapYouTubeComments({
        ...common,
        source: entry('Takeout/YouTube and YouTube Music/comments/comments.csv'),
        rows: [
          {
            'Comment ID': 'comment-1',
            'Channel ID': 'UCSELF',
            'Comment Create Timestamp': importedAt,
            'Video ID': 'video-1',
            'Comment Text': '{"text":"Comment text"}'
          }
        ]
      })
      const playlistRecords = mapYouTubePlaylists({
        ...common,
        catalogSource: entry('Takeout/YouTube and YouTube Music/playlists/playlists.csv'),
        catalogRows: [
          {
            'Playlist ID': 'PL123',
            'Playlist Title (Original)': 'Watch Later',
            'Playlist Visibility': 'Private',
            'Playlist Update Timestamp': importedAt
          }
        ],
        videoFiles: [
          {
            source: entry('Takeout/YouTube and YouTube Music/playlists/Watch Later-videos.csv'),
            rows: [
              {
                'Video ID': 'video-1',
                'Playlist Video Creation Timestamp': importedAt
              }
            ]
          }
        ]
      })
      const musicRecords = mapYouTubeMusicLibrary({
        ...common,
        source: entry(
          'Takeout/YouTube and YouTube Music/music (library and uploads)/music library songs.csv'
        ),
        rows: [
          {
            'Video ID': 'song-1',
            'Song Title': 'Song title',
            'Album Title': 'Album title',
            'Artist Name 1': 'Artist'
          }
        ]
      })
      const watchRecords = mapYouTubeWatchHistory({
        ...common,
        source: entry('Takeout/YouTube and YouTube Music/history/watch-history.json'),
        records: [
          {
            title: 'Watched Video title',
            titleUrl: 'https://www.youtube.com/watch?v=video-1',
            subtitles: [{ name: 'Example Channel', url: 'https://www.youtube.com/channel/UC123' }],
            time: importedAt
          }
        ]
      })
      const searchRecords = mapYouTubeSearchHistory({
        ...common,
        source: entry('Takeout/YouTube and YouTube Music/history/search-history.json'),
        records: [{ title: 'Searched for repair bikes', time: importedAt }]
      })

      expect(byKind(channelRecords, 'actor')[0].properties.isSelf).toBe(true)
      expect(
        byKind(commentRecords, 'content').map((record) => record.properties.contentKind)
      ).toEqual(['video', 'comment'])
      expect(byKind(playlistRecords, 'collection')).toHaveLength(1)
      expect(byKind(playlistRecords, 'collection-item')).toHaveLength(1)
      expect(byKind(musicRecords, 'content')[0].properties.contentKind).toBe('audio')
      expect(byKind(watchRecords, 'interaction')[0].properties.interactionKind).toBe('view')
      expect(byKind(searchRecords, 'interaction')[0].properties.interactionKind).toBe('search')
      expect(byKind(searchRecords, 'interaction')[0].privacyClass).toBe('private')
    })
  })

  describe('X mappers', () => {
    it('parses Twitter archive JavaScript wrappers and maps profile without copying email', () => {
      const parsed = parseTwitterArchiveJs<Array<{ like: { tweetId: string } }>>(
        twitterJs('like', [{ like: { tweetId: 'tweet-1' } }])
      )
      const records = mapXProfile({
        context: {
          archiveId: 'archive',
          importRunId: 'run',
          observedBy: 'did:key:test',
          importedAt
        },
        source: entry('data/account.js'),
        selfActorId: createSocialNodeId('actor', ['x', 'self']),
        accountRecords: [
          {
            account: {
              accountId: 'self-1',
              username: 'SelfHandle',
              accountDisplayName: 'Self Account',
              createdAt: importedAt,
              createdVia: 'web',
              email: 'private@example.invalid'
            }
          }
        ],
        profileRecords: [
          {
            profile: {
              description: { bio: 'Profile bio', website: 'https://example.invalid', location: '' },
              avatarMediaUrl: 'https://example.invalid/avatar.jpg'
            }
          }
        ]
      })

      expect(parsed[0].like.tweetId).toBe('tweet-1')
      expect(byKind(records, 'actor')[0].properties.handle).toBe('selfhandle')
      expect(JSON.stringify(byKind(records, 'actor')[0].properties)).not.toContain(
        'private@example.invalid'
      )
    })

    it('maps X relationships, tweets, likes, lists, DMs, and Grok chat records', () => {
      const common = {
        context: {
          archiveId: 'archive',
          importRunId: 'run',
          observedBy: 'did:key:test',
          importedAt
        },
        selfActorId: createSocialNodeId('actor', ['x', 'self'])
      }
      const relationshipRecords = mapXRelationships({
        ...common,
        source: entry('data/following.js'),
        relationshipKey: 'following',
        records: [
          {
            following: {
              accountId: 'account-1',
              userLink: 'https://twitter.com/intent/user?user_id=account-1'
            }
          }
        ]
      })
      const tweetRecords = mapXTweets({
        ...common,
        source: entry('data/tweets.js'),
        selfHandle: 'selfhandle',
        records: [
          {
            tweet: {
              id_str: 'tweet-1',
              full_text: '@friend reply text https://t.co/example',
              created_at: 'Sat Mar 07 02:37:43 +0000 2026',
              in_reply_to_status_id_str: 'parent-1',
              favorite_count: '3',
              retweet_count: '1',
              lang: 'en',
              entities: {
                user_mentions: [{ id_str: 'friend-1', screen_name: 'Friend', name: 'Friend' }],
                urls: [
                  {
                    url: 'https://t.co/example',
                    expanded_url: 'https://example.invalid/post',
                    display_url: 'example.invalid/post'
                  }
                ]
              }
            }
          }
        ]
      })
      const likeRecords = mapXLikes({
        ...common,
        source: entry('data/like.js'),
        records: [
          {
            like: {
              tweetId: 'liked-1',
              fullText: 'Liked text',
              expandedUrl: 'https://twitter.com/i/web/status/liked-1'
            }
          }
        ]
      })
      const listRecords = mapXLists({
        ...common,
        source: entry('data/lists-subscribed.js'),
        listKind: 'subscribed',
        records: [{ userListInfo: { url: 'https://twitter.com/owner/lists/list-1' } }]
      })
      const dmRecords = mapXDirectMessages({
        ...common,
        source: entry('data/direct-messages.js'),
        selfAccountId: 'self-1',
        records: [
          {
            dmConversation: {
              conversationId: 'other-1-self-1',
              messages: [
                {
                  messageCreate: {
                    id: 'message-1',
                    senderId: 'other-1',
                    recipientId: 'self-1',
                    text: 'DM text',
                    createdAt: importedAt,
                    urls: [{ expanded: 'https://example.invalid/dm' }],
                    mediaUrls: ['data/direct_messages_media/file.jpg']
                  }
                }
              ]
            }
          }
        ]
      })
      const grokRecords = mapXGrokChatItems({
        ...common,
        source: entry('data/grok-chat-item.js'),
        records: [
          {
            grokChatItem: {
              chatId: 'chat-1',
              createdAt: importedAt,
              message: 'Prompt text',
              sender: { name: 'User', originalName: 'USER' },
              grokMode: { name: 'Fun', originalName: 'FUN' }
            }
          },
          {
            grokChatItem: {
              chatId: 'chat-1',
              createdAt: importedAt,
              message: 'Answer text',
              sender: { name: 'Agent', originalName: 'AGENT' },
              grokMode: { name: 'Fun', originalName: 'FUN' }
            }
          }
        ]
      })

      expect(byKind(relationshipRecords, 'interaction')[0].properties.interactionKind).toBe(
        'follow'
      )
      expect(byKind(tweetRecords, 'content')[0].properties.contentKind).toBe('reply')
      expect(
        byKind(tweetRecords, 'interaction').some(
          (record) => record.properties.interactionKind === 'mention'
        )
      ).toBe(true)
      expect(byKind(likeRecords, 'interaction')[0].properties.interactionKind).toBe('like')
      expect(byKind(listRecords, 'collection')[0].properties.collectionKind).toBe('list')
      expect(byKind(dmRecords, 'conversation')[0].privacyClass).toBe('third-party-private')
      expect(byKind(dmRecords, 'message')[0].properties.textPreview).toBe('DM text')
      expect(byKind(grokRecords, 'conversation')[0].properties.conversationKind).toBe('ai-chat')
      expect(byKind(grokRecords, 'message').map((record) => record.properties.messageKind)).toEqual(
        ['prompt', 'ai-response']
      )
    })
  })

  describe('Claude mappers', () => {
    it('maps profile without copying email or phone into canonical actor properties', () => {
      const records = mapClaudeProfile({
        context: {
          archiveId: 'archive',
          importRunId: 'run',
          observedBy: 'did:key:test',
          importedAt
        },
        source: entry('users.json'),
        selfActorId: createSocialNodeId('actor', ['claude', 'self']),
        users: [
          {
            uuid: 'user-1',
            full_name: 'Example User',
            email_address: 'private@example.invalid',
            verified_phone_number: '+15555555555'
          }
        ]
      })

      expect(byKind(records, 'actor')[0].platform).toBe('claude')
      expect(byKind(records, 'actor')[0].properties.displayName).toBe('Example User')
      expect(JSON.stringify(byKind(records, 'actor')[0].properties)).not.toContain(
        'private@example.invalid'
      )
      expect(JSON.stringify(byKind(records, 'actor')[0].properties)).not.toContain('+15555555555')
    })

    it('maps conversations, citations, projects, and files', () => {
      const common = {
        context: {
          archiveId: 'archive',
          importRunId: 'run',
          observedBy: 'did:key:test',
          importedAt
        },
        source: entry('conversations.json'),
        selfActorId: createSocialNodeId('actor', ['claude', 'self']),
        assistantActorId: createSocialNodeId('actor', ['claude', 'assistant'])
      }
      const conversationRecords = mapClaudeConversations({
        ...common,
        conversations: [
          {
            uuid: 'conversation-1',
            name: 'Research chat',
            created_at: importedAt,
            updated_at: importedAt,
            account: { uuid: 'user-1' },
            chat_messages: [
              {
                uuid: 'message-1',
                sender: 'human',
                text: 'Prompt text',
                created_at: importedAt,
                content: [{ type: 'text', text: 'Prompt text', citations: [] }]
              },
              {
                uuid: 'message-2',
                sender: 'assistant',
                text: 'Response text',
                created_at: importedAt,
                content: [
                  {
                    type: 'text',
                    text: 'Response text',
                    citations: [
                      {
                        uuid: 'citation-1',
                        details: { type: 'webpage', url: 'https://example.invalid/source' }
                      }
                    ]
                  }
                ],
                parent_message_uuid: 'message-1'
              }
            ]
          }
        ]
      })
      const projectRecords = mapClaudeProject({
        context: common.context,
        source: entry('projects/project-1.json'),
        selfActorId: common.selfActorId,
        project: {
          uuid: 'project-1',
          name: 'Research Project',
          description: 'Project description',
          is_private: true,
          created_at: importedAt,
          updated_at: importedAt,
          docs: [
            {
              uuid: 'doc-1',
              filename: 'brief.md',
              content: 'Document text',
              created_at: importedAt
            }
          ]
        }
      })
      const fileRecords = mapClaudeFiles({
        context: {
          archiveId: 'archive',
          importRunId: 'run'
        },
        source: entry('conversations.json'),
        conversations: [
          {
            uuid: 'conversation-1',
            chat_messages: [
              {
                uuid: 'message-1',
                attachments: [
                  {
                    file_name: 'secret.txt',
                    file_size: 10,
                    file_type: 'txt',
                    extracted_content: 'raw private attachment text'
                  }
                ],
                files: [{ file_uuid: 'file-1', file_name: 'linked.md' }]
              }
            ]
          }
        ]
      })

      expect(byKind(conversationRecords, 'conversation')[0].properties.conversationKind).toBe(
        'ai-chat'
      )
      expect(
        byKind(conversationRecords, 'message').map((record) => record.properties.messageKind)
      ).toEqual(['prompt', 'ai-response'])
      expect(
        byKind(conversationRecords, 'interaction').some(
          (record) => record.properties.interactionKind === 'cited'
        )
      ).toBe(true)
      expect(byKind(projectRecords, 'collection')[0].properties.collectionKind).toBe('project')
      expect(byKind(projectRecords, 'content')[0].properties.contentKind).toBe('transcript')
      expect(byKind(projectRecords, 'collection-item')).toHaveLength(1)
      expect(fileRecords).toHaveLength(2)
      expect(fileRecords.every((record) => record.kind === 'source-record')).toBe(true)
      expect(JSON.stringify(fileRecords)).not.toContain('raw private attachment text')
    })
  })

  describe('Reddit mappers', () => {
    it('parses CSV rows with Reddit headers', () => {
      expect(
        parseRedditCsv('id,permalink,direction\npost-1,/r/example/comments/post_1,up')
      ).toEqual([{ id: 'post-1', permalink: '/r/example/comments/post_1', direction: 'up' }])
    })

    it('maps profile without copying private demographic values into actor properties', () => {
      const records = mapRedditProfile({
        context: {
          archiveId: 'archive',
          importRunId: 'run',
          observedBy: 'did:key:test',
          importedAt
        },
        selfActorId: createSocialNodeId('actor', ['reddit', 'self']),
        files: [
          {
            source: entry('birthdate.csv'),
            rows: [
              {
                birthdate: '2000-01-01',
                verified_birthdate: '2000-01-01',
                verification_state: 'verified'
              }
            ]
          }
        ]
      })

      expect(byKind(records, 'actor')[0].platform).toBe('reddit')
      expect(byKind(records, 'actor')[0].properties.isSelf).toBe(true)
      expect(JSON.stringify(byKind(records, 'actor')[0].properties)).not.toContain('2000-01-01')
      expect(JSON.stringify(records.map((record) => record.properties))).not.toContain('2000-01-01')
    })

    it('maps authored content, votes, saves, subreddit memberships, and messages', () => {
      const common = {
        context: {
          archiveId: 'archive',
          importRunId: 'run',
          observedBy: 'did:key:test',
          importedAt
        },
        selfActorId: createSocialNodeId('actor', ['reddit', 'self'])
      }
      const authoredRecords = mapRedditAuthoredContent({
        ...common,
        files: [
          {
            source: entry('posts.csv'),
            rows: [
              {
                id: 'post-1',
                permalink: '/r/example/comments/post_1/title',
                date: importedAt,
                subreddit: 'example',
                title: 'Post title',
                body: 'Post body'
              }
            ]
          },
          {
            source: entry('comments.csv'),
            rows: [
              {
                id: 'comment-1',
                permalink: '/r/example/comments/post_1/_/comment_1',
                date: importedAt,
                subreddit: 'example',
                link: '/r/example/comments/post_1/title',
                parent: 't3_post_1',
                body: 'Comment text'
              }
            ]
          }
        ]
      })
      const voteRecords = mapRedditVotes({
        ...common,
        files: [
          {
            source: entry('post_votes.csv'),
            rows: [{ id: 'post-1', permalink: '/r/example/comments/post_1/title', direction: 'up' }]
          }
        ]
      })
      const savedRecords = mapRedditSavedAndHiddenItems({
        ...common,
        files: [
          {
            source: entry('saved_comments.csv'),
            rows: [{ id: 'comment-1', permalink: '/r/example/comments/post_1/_/comment_1' }]
          }
        ]
      })
      const subredditRecords = mapRedditSubredditMemberships({
        ...common,
        files: [
          {
            source: entry('subscribed_subreddits.csv'),
            rows: [{ subreddit: 'example' }]
          }
        ]
      })
      const chatRecords = mapRedditChatHistory({
        ...common,
        selfHandle: 'self',
        files: [
          {
            source: entry('chat_history.csv'),
            rows: [
              {
                message_id: 'chat-message-1',
                created_at: importedAt,
                username: 'other-user',
                message: 'Private chat text',
                channel_url: 'https://chat.reddit.com/room/1',
                conversation_type: 'direct'
              }
            ]
          }
        ]
      })
      const privateMessageRecords = mapRedditPrivateMessages({
        ...common,
        selfHandle: 'self',
        files: [
          {
            source: entry('messages_archive.csv'),
            rows: [
              {
                id: 'message-1',
                thread_id: 'thread-1',
                date: importedAt,
                from: 'self',
                to: 'other-user',
                subject: 'Private subject',
                body: 'Private message text'
              }
            ]
          }
        ]
      })

      expect(
        byKind(authoredRecords, 'content').map((record) => record.properties.contentKind)
      ).toEqual(expect.arrayContaining(['post', 'reply']))
      expect(
        byKind(authoredRecords, 'interaction').some(
          (record) => record.properties.interactionKind === 'comment'
        )
      ).toBe(true)
      expect(byKind(voteRecords, 'interaction')[0].properties.interactionKind).toBe('vote')
      expect(byKind(savedRecords, 'interaction')[0].properties.interactionKind).toBe('save')
      expect(
        byKind(subredditRecords, 'actor').some(
          (record) => record.properties.actorKind === 'community'
        )
      ).toBe(true)
      expect(byKind(subredditRecords, 'interaction')[0].properties.interactionKind).toBe(
        'membership'
      )
      expect(byKind(chatRecords, 'conversation')[0].properties.conversationKind).toBe('dm')
      expect(byKind(chatRecords, 'message')[0].properties.searchText).toBe('Private chat text')
      expect(byKind(privateMessageRecords, 'conversation')[0].properties.conversationKind).toBe(
        'dm'
      )
      expect(byKind(privateMessageRecords, 'message')[0].properties.searchText).toBe(
        'Private message text'
      )
    })
  })

  describe('TikTok mappers', () => {
    it('maps profile without copying sensitive profile fields into canonical actor properties', () => {
      const records = mapTikTokProfile({
        context: {
          archiveId: 'archive',
          importRunId: 'run',
          observedBy: 'did:key:test',
          importedAt
        },
        source: entry('user_data_tiktok.json'),
        selfActorId: createSocialNodeId('actor', ['tiktok', 'self']),
        profile: {
          userName: 'SelfHandle',
          displayName: 'Self Account',
          bioDescription: 'Profile bio',
          emailAddress: 'private@example.invalid',
          telephoneNumber: '+15555555555',
          birthDate: '2000-01-01',
          followerCount: 3,
          followingCount: 4,
          profilePhoto: 'https://example.invalid/avatar.jpg'
        }
      })

      expect(byKind(records, 'actor')[0].platform).toBe('tiktok')
      expect(byKind(records, 'actor')[0].properties.handle).toBe('selfhandle')
      expect(JSON.stringify(byKind(records, 'actor')[0].properties)).not.toContain(
        'private@example.invalid'
      )
      expect(JSON.stringify(byKind(records, 'actor')[0].properties)).not.toContain('+15555555555')
      expect(JSON.stringify(byKind(records, 'actor')[0].properties)).not.toContain('2000-01-01')
    })

    it('maps relationships, comments, interactions, collections, searches, shares, and DMs', () => {
      const common = {
        context: {
          archiveId: 'archive',
          importRunId: 'run',
          observedBy: 'did:key:test',
          importedAt
        },
        source: entry('user_data_tiktok.json'),
        selfActorId: createSocialNodeId('actor', ['tiktok', 'self'])
      }
      const relationshipRecords = mapTikTokRelationships({
        ...common,
        relationshipKind: 'following',
        records: [{ Date: '2026-01-02 03:04:05', UserName: 'Creator' }]
      })
      const commentRecords = mapTikTokComments({
        ...common,
        records: [
          {
            date: '2026-01-02 03:04:05 UTC',
            comment: 'Comment text',
            originalPostUrl: 'https://www.tiktok.com/@creator/video/123'
          }
        ]
      })
      const likeRecords = mapTikTokContentInteractions({
        ...common,
        bucketId: 'tiktok.likes',
        privacyClass: 'public',
        records: [
          { date: '2026-01-02 03:04:05', link: 'https://www.tiktok.com/@creator/video/123' }
        ],
        interactionKind: 'like',
        platformInteractionKind: 'like',
        contentKind: 'video',
        platformContentKind: 'video'
      })
      const searchRecords = mapTikTokSearches({
        ...common,
        records: [{ Date: '2026-01-02 03:04:05', SearchTerm: 'portable gardens' }]
      })
      const shareRecords = mapTikTokShares({
        ...common,
        records: [
          {
            Date: '2026-01-02 03:04:05',
            SharedContent: 'video',
            Link: 'https://www.tiktok.com/@creator/video/456',
            Method: 'copy link'
          }
        ]
      })
      const favoriteCollectionRecords = mapTikTokFavoriteCollections({
        ...common,
        records: [{ Date: '2026-01-02 03:04:05', FavoriteCollection: 'Saved ideas' }]
      })
      const hashtagRecords = mapTikTokHashtags({
        ...common,
        bucketId: 'tiktok.favorites',
        privacyClass: 'private',
        records: [{ HashtagName: 'gardening', HashtagLink: 'https://www.tiktok.com/tag/gardening' }]
      })
      const dmRecords = mapTikTokDirectMessages({
        ...common,
        selfHandle: 'selfhandle',
        chatHistory: {
          'Chat History with creator:': [
            { Date: '2026-01-02 03:04:05', From: 'creator', Content: 'Message text' },
            {
              Date: '2026-01-02 03:05:05',
              From: 'selfhandle',
              Content: 'https://www.tiktokv.com/share/video/789/'
            }
          ]
        }
      })

      expect(byKind(relationshipRecords, 'interaction')[0].properties.interactionKind).toBe(
        'follow'
      )
      expect(byKind(commentRecords, 'content')[0].properties.contentKind).toBe('video')
      expect(
        byKind(commentRecords, 'interaction').some(
          (record) => record.properties.interactionKind === 'comment'
        )
      ).toBe(true)
      expect(byKind(likeRecords, 'interaction')[0].properties.interactionKind).toBe('like')
      expect(byKind(searchRecords, 'interaction')[0].properties.interactionKind).toBe('search')
      expect(byKind(shareRecords, 'interaction')[0].properties.interactionKind).toBe('share')
      expect(byKind(favoriteCollectionRecords, 'collection')[0].properties.collectionKind).toBe(
        'folder'
      )
      expect(byKind(hashtagRecords, 'collection')[0].properties.collectionKind).toBe('topic')
      expect(byKind(dmRecords, 'conversation')[0].privacyClass).toBe('third-party-private')
      expect(byKind(dmRecords, 'message')).toHaveLength(2)
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

function twitterJs(globalName: string, payload: unknown): string {
  return `window.YTD.${globalName}.part0 = ${JSON.stringify(payload)}`
}
