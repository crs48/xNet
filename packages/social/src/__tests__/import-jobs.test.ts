import { describe, expect, it } from 'vitest'
import { createSocialImportJobCheckpointAccumulator } from '..'

describe('social import jobs', () => {
  describe('createSocialImportJobCheckpointAccumulator', () => {
    it('tracks current source and per-bucket checkpoints', () => {
      const accumulator = createSocialImportJobCheckpointAccumulator()

      expect(accumulator.snapshot()).toEqual({
        checkpoint: null,
        bucketCheckpoints: []
      })

      const snapshot = accumulator.add(
        [
          {
            bucketId: 'youtube.history',
            sourcePath: 'Takeout/YouTube/history/watch-history.json',
            sourceRecordId: 'watch-1'
          },
          {
            bucketId: 'youtube.history',
            sourcePath: 'Takeout/YouTube/history/watch-history.json',
            sourceRecordId: 'watch-2'
          },
          {
            bucketId: 'youtube.playlists',
            sourcePath: 'Takeout/YouTube/playlists/liked-videos.csv',
            sourceRecordId: 'playlist-1'
          }
        ],
        {
          processedRecords: 3,
          currentChunk: 1,
          updatedAt: 1234
        }
      )

      expect(snapshot.checkpoint).toEqual({
        bucketId: 'youtube.playlists',
        sourcePath: 'Takeout/YouTube/playlists/liked-videos.csv',
        sourceRecordId: 'playlist-1',
        processedRecords: 3,
        currentChunk: 1,
        updatedAt: 1234
      })
      expect(snapshot.bucketCheckpoints).toEqual([
        {
          bucketId: 'youtube.history',
          processedRecords: 2,
          sourcePath: 'Takeout/YouTube/history/watch-history.json',
          sourceRecordId: 'watch-2',
          updatedAt: 1234
        },
        {
          bucketId: 'youtube.playlists',
          processedRecords: 1,
          sourcePath: 'Takeout/YouTube/playlists/liked-videos.csv',
          sourceRecordId: 'playlist-1',
          updatedAt: 1234
        }
      ])
    })
  })
})
