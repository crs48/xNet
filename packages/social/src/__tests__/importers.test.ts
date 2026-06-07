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
  parseTwitterArchiveJs,
  parseYouTubeCsv,
  sanitizeStagedRecordsForFixture,
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
