import { describe, expect, it } from 'vitest'
import { planUpload, resumeUpload, uploadFraction, UPLOAD_CHUNK_SIZE } from './manifest'

const digest = (offset: number, length: number): string => `d-${offset}-${length}`

describe('planUpload', () => {
  it('splits a track into chunks with a short final chunk', () => {
    const manifest = planUpload('cid1', UPLOAD_CHUNK_SIZE * 2 + 100, digest)

    expect(manifest.chunks).toHaveLength(3)
    expect(manifest.chunks[2]).toMatchObject({ index: 2, length: 100 })
  })

  it('plans a realistic 300 MB screencast without losing a byte', () => {
    const size = 300 * 1024 * 1024
    const manifest = planUpload('cid1', size, digest)

    expect(manifest.chunks).toHaveLength(1_200)
    expect(manifest.chunks.reduce((n, c) => n + c.length, 0)).toBe(size)
  })

  it('plans nothing for a zero-byte track', () => {
    expect(planUpload('cid1', 0, digest).chunks).toEqual([])
  })

  it('rejects nonsense inputs loudly', () => {
    expect(() => planUpload('cid1', -1, digest)).toThrow(RangeError)
    expect(() => planUpload('cid1', 10, digest, 0)).toThrow(RangeError)
  })
})

describe('resumeUpload', () => {
  const manifest = planUpload('cid1', UPLOAD_CHUNK_SIZE * 3, digest)
  const serverChunk = (index: number) => ({
    index,
    digest: manifest.chunks[index]!.digest
  })

  it('reports every chunk remaining when the server holds nothing', () => {
    const progress = resumeUpload(manifest, [])

    expect(progress.status).toBe('incomplete')
    if (progress.status !== 'incomplete') throw new Error('expected incomplete')
    expect(progress.remaining).toHaveLength(3)
    expect(progress.uploadedBytes).toBe(0)
  })

  it('resumes from the middle after a killed connection', () => {
    const progress = resumeUpload(manifest, [serverChunk(0), serverChunk(1)])

    expect(progress.status).toBe('incomplete')
    if (progress.status !== 'incomplete') throw new Error('expected incomplete')
    expect(progress.remaining.map((c) => c.index)).toEqual([2])
    expect(progress.uploadedBytes).toBe(UPLOAD_CHUNK_SIZE * 2)
  })

  it('resumes out of order — the server may hold any subset', () => {
    const progress = resumeUpload(manifest, [serverChunk(2), serverChunk(0)])

    expect(progress.status === 'incomplete' && progress.remaining.map((c) => c.index)).toEqual([1])
  })

  it('is complete only when every chunk is accounted for', () => {
    const progress = resumeUpload(manifest, [serverChunk(0), serverChunk(1), serverChunk(2)])

    expect(progress.status).toBe('complete')
    expect(progress.status === 'complete' && progress.uploadedBytes).toBe(UPLOAD_CHUNK_SIZE * 3)
  })

  it('fails loudly on a digest mismatch instead of silently re-uploading', () => {
    const progress = resumeUpload(manifest, [{ index: 1, digest: 'tampered' }])

    expect(progress.status).toBe('failed')
    if (progress.status !== 'failed') throw new Error('expected failure')
    expect(progress.reason).toBe('digest-mismatch')
    expect(progress.detail).toContain('chunk 1')
  })

  it('fails on a chunk index the manifest never planned', () => {
    const progress = resumeUpload(manifest, [{ index: 99, digest: 'x' }])

    expect(progress.status === 'failed' && progress.reason).toBe('unknown-chunk')
  })

  it('does not double-count a chunk the server lists twice', () => {
    const progress = resumeUpload(manifest, [serverChunk(0), serverChunk(0)])

    expect(progress.status === 'incomplete' && progress.uploadedBytes).toBe(UPLOAD_CHUNK_SIZE)
  })

  it('treats a zero-byte track as complete', () => {
    expect(resumeUpload(planUpload('cid1', 0, digest), []).status).toBe('complete')
  })
})

describe('uploadFraction', () => {
  const manifest = planUpload('cid1', UPLOAD_CHUNK_SIZE * 4, digest)

  it('reports partial progress', () => {
    const progress = resumeUpload(manifest, [
      { index: 0, digest: manifest.chunks[0]!.digest },
      { index: 1, digest: manifest.chunks[1]!.digest }
    ])

    expect(uploadFraction(manifest, progress)).toBe(0.5)
  })

  it('reports zero for a failure — a failed upload is not partly done', () => {
    expect(
      uploadFraction(manifest, { status: 'failed', reason: 'unknown-chunk', detail: '' })
    ).toBe(0)
  })

  it('reports 1 for an empty track without dividing by zero', () => {
    const empty = planUpload('cid1', 0, digest)
    expect(uploadFraction(empty, resumeUpload(empty, []))).toBe(1)
  })
})
