import type { StagedSocialRecord } from '../import/types'
import { describe, expect, it } from 'vitest'
import { mapInstagramLikedPosts, mapInstagramSavedPosts } from '../importers/instagram'
import { mapYouTubePlaylists } from '../importers/youtube'

const context = {
  archiveId: 'archive:fixture',
  importRunId: 'run:fixture',
  observedBy: 'did:key:fixture',
  importedAt: '2026-09-01T00:00:00Z'
}
const source = (path: string) => ({ path, byteSize: 100 })
const ofKind = (records: StagedSocialRecord[], kind: StagedSocialRecord['kind']) =>
  records.filter((record) => record.kind === kind)
const post = {
  fbid: 'native-1',
  timestamp: 1750000000,
  label_values: [
    { label: 'URL', href: 'https://www.instagram.com/p/sample1/' },
    { label: 'Title', value: 'Example movement lesson' },
    { label: 'Caption', value: 'Full caption for finding this source later.' },
    { title: 'Creators', dict: [{ dict: [{ label: 'Username', value: 'example_creator' }] }] }
  ]
}

describe('observed seed export shapes (synthetic content)', () => {
  it('shares one Instagram resource across saves, likes, and named collections', () => {
    const saved = mapInstagramSavedPosts({
      context,
      source: source('saved_posts.json'),
      selfActorId: 'self',
      input: [post]
    })
    const liked = mapInstagramLikedPosts({
      context,
      source: source('liked_posts.json'),
      selfActorId: 'self',
      input: [post]
    })
    const named = mapInstagramSavedPosts({
      context,
      source: source('saved_collections.json'),
      selfActorId: 'self',
      input: [
        {
          fbid: 'collection-1',
          label_values: [
            { label: 'Name', value: 'Practice' },
            { dict: [{ title: 'Item', dict: post.label_values }] }
          ]
        }
      ]
    })
    const resources = [saved, liked, named].map((records) => ofKind(records, 'content')[0])
    expect(new Set(resources.map((record) => record.deterministicId)).size).toBe(1)
    expect(resources[0].properties.searchText).toContain('Full caption')
    expect(resources[0].properties.authorHandle).toBe('example_creator')
    expect(ofKind(saved, 'interaction')[0].properties.interactionKind).toBe('save')
    expect(ofKind(liked, 'interaction')[0].properties.interactionKind).toBe('like')
    expect(ofKind(named, 'interaction')).toHaveLength(0)
    expect(ofKind(named, 'collection')[0].properties.title).toBe('Practice')
    expect(ofKind(named, 'collection')[0].privacyClass).toBe('private')
    expect(ofKind(named, 'collection-item')).toHaveLength(1)
  })

  it('preserves repeated Instagram collection memberships and reimports deterministically', () => {
    const input = {
      context,
      source: source('saved_collections.json'),
      selfActorId: 'self',
      input: [
        {
          fbid: 'collection-1',
          label_values: [
            { label: 'Name', value: 'Practice' },
            { dict: [{ dict: post.label_values }, { dict: post.label_values }] }
          ]
        }
      ]
    }
    const records = mapInstagramSavedPosts(input)
    expect(
      new Set(ofKind(records, 'collection-item').map((record) => record.deterministicId)).size
    ).toBe(2)
    expect(mapInstagramSavedPosts(input)).toEqual(records)
    expect(
      ofKind(records, 'collection-item').every((record) => record.properties.addedAt === undefined)
    ).toBe(true)
  })

  it('reads the liked-comments wrapper and refuses unknown wrappers', () => {
    const records = mapInstagramLikedPosts({
      context,
      source: source('liked_comments.json'),
      selfActorId: 'self',
      input: {
        likes_comment_likes: [
          {
            title: 'A comment',
            string_list_data: [
              {
                href: 'https://www.instagram.com/p/sample1/c/42/',
                value: 'Liked',
                timestamp: 1750000000
              }
            ]
          }
        ]
      }
    })
    expect(ofKind(records, 'content')[0].properties.contentKind).toBe('comment')
    expect(ofKind(records, 'interaction')).toHaveLength(1)
    expect(() =>
      mapInstagramLikedPosts({
        context,
        source: source('liked_posts.json'),
        selfActorId: 'self',
        input: { unsupported: [] }
      })
    ).toThrow('Unsupported Instagram')
  })

  it('joins sanitized YouTube filenames without dropping repeated memberships', () => {
    const input = {
      context,
      selfActorId: 'self',
      catalogSource: source('playlists.csv'),
      catalogRows: [
        { 'Playlist ID': 'PLfixture', 'Playlist Title (Original)': 'Learning / Practice' }
      ],
      videoFiles: [
        {
          source: source('Learning _ Practice-videos.csv'),
          rows: [
            { 'Video ID': 'video1', 'Playlist Video Creation Timestamp': '2025-01-01T00:00:00Z' },
            { 'Video ID': 'video1', 'Playlist Video Creation Timestamp': '2025-01-01T00:00:00Z' }
          ]
        }
      ]
    }
    const records = mapYouTubePlaylists(input)
    expect(ofKind(records, 'collection')).toHaveLength(1)
    expect(new Set(ofKind(records, 'content').map((record) => record.deterministicId)).size).toBe(1)
    expect(
      new Set(ofKind(records, 'collection-item').map((record) => record.deterministicId)).size
    ).toBe(2)
    expect(mapYouTubePlaylists(input)).toEqual(records)
  })

  it('reports missing membership files and ambiguous catalog matches', () => {
    const records = mapYouTubePlaylists({
      context,
      selfActorId: 'self',
      catalogSource: source('playlists.csv'),
      catalogRows: [
        { 'Playlist ID': 'PLone', 'Playlist Title (Original)': 'Same / Title' },
        { 'Playlist ID': 'PLtwo', 'Playlist Title (Original)': 'Same _ Title' },
        { 'Playlist ID': 'PLempty', 'Playlist Title (Original)': 'No file' }
      ],
      videoFiles: [{ source: source('Same _ Title-videos.csv'), rows: [{ 'Video ID': 'video1' }] }]
    })
    expect(ofKind(records, 'collection')).toHaveLength(4)
    expect(
      records.some((record) => record.warnings.some((warning) => warning.includes('Ambiguous')))
    ).toBe(true)
    expect(
      records.some((record) =>
        record.warnings.some((warning) => warning.includes('coverage is unknown'))
      )
    ).toBe(true)
  })
})
