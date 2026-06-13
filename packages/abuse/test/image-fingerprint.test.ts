import type { GrayscaleImage } from '../src/image-fingerprint'
import { describe, expect, it } from 'vitest'
import {
  averageHash,
  differenceHash,
  hammingDistanceHex,
  imageHashSimilarity,
  matchKnownImageHash,
  perceptualHash
} from '../src/image-fingerprint'
import {
  createNsfwImageClassifier,
  mapNsfwLabelToSensitivity
} from '../src/local-image-classifier'

function gradient(width: number, height: number, invert = false): GrayscaleImage {
  const luma: number[] = []
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const value = Math.round((x / Math.max(1, width - 1)) * 255)
      luma.push(invert ? 255 - value : value)
    }
  }
  return { width, height, luma }
}

function noise(width: number, height: number, seed: number): GrayscaleImage {
  const luma: number[] = []
  let state = seed
  for (let i = 0; i < width * height; i++) {
    state = (state * 1103515245 + 12345) & 0x7fffffff
    luma.push(state % 256)
  }
  return { width, height, luma }
}

describe('perceptual image hashing', () => {
  it('produces 64-bit (16 hex char) hashes', () => {
    const image = gradient(64, 64)
    expect(averageHash(image)).toHaveLength(16)
    expect(differenceHash(image)).toHaveLength(16)
    expect(perceptualHash(image)).toHaveLength(16)
  })

  it('is stable to downscaling the same image (similarity ~1)', () => {
    const big = gradient(128, 128)
    const small = gradient(64, 64)
    expect(imageHashSimilarity(perceptualHash(big), perceptualHash(small))).toBeGreaterThan(0.9)
    expect(imageHashSimilarity(differenceHash(big), differenceHash(small))).toBeGreaterThan(0.9)
  })

  it('separates a gradient from its inverse and from noise', () => {
    const grad = perceptualHash(gradient(64, 64))
    const inv = perceptualHash(gradient(64, 64, true))
    const rnd = perceptualHash(noise(64, 64, 7))
    expect(imageHashSimilarity(grad, inv)).toBeLessThan(0.9)
    expect(imageHashSimilarity(grad, rnd)).toBeLessThan(0.9)
  })

  it('hamming distance counts differing bits', () => {
    expect(hammingDistanceHex('ff', '00')).toBe(8)
    expect(hammingDistanceHex('ff', 'ff')).toBe(0)
    expect(hammingDistanceHex('f0', 'f1')).toBe(1)
  })
})

describe('known-bad hash matching (CSAM-style)', () => {
  it('matches within tolerance and reports the closest', () => {
    const hash = perceptualHash(gradient(64, 64))
    const known = [
      { hash, label: 'known-bad', source: 'test-list' },
      { hash: 'f'.repeat(16), label: 'other' }
    ]
    const match = matchKnownImageHash(hash, known, 4)
    expect(match).not.toBeNull()
    expect(match!.label).toBe('known-bad')
    expect(match!.distance).toBe(0)
  })

  it('does not match an unrelated image', () => {
    const candidate = perceptualHash(noise(64, 64, 99))
    const known = [{ hash: perceptualHash(gradient(64, 64)), label: 'known-bad' }]
    expect(matchKnownImageHash(candidate, known, 4)).toBeNull()
  })
})

describe('nsfw image classifier adapter', () => {
  it('maps model categories to the sensitivity vocabulary', () => {
    expect(mapNsfwLabelToSensitivity('Porn')).toBe('porn')
    expect(mapNsfwLabelToSensitivity('sexy')).toBe('sexual')
    expect(mapNsfwLabelToSensitivity('hentai')).toBe('porn')
    expect(mapNsfwLabelToSensitivity('neutral')).toBeNull()
    expect(mapNsfwLabelToSensitivity('drawing')).toBeNull()
  })

  it('emits ml sensitivity labels above the threshold and ignores safe categories', async () => {
    const classifier = createNsfwImageClassifier({
      detect: () => [
        { label: 'porn', score: 0.92 },
        { label: 'sexy', score: 0.6 },
        { label: 'neutral', score: 0.05 }
      ],
      threshold: 0.5,
      sourceDid: 'did:model'
    })
    expect(classifier.supports?.({ surface: 'feed', body: '', metadata: { mediaKind: 'image/png' } })).toBe(
      true
    )
    const result = await classifier.classify({
      surface: 'feed',
      body: '',
      metadata: { mediaKind: 'image/png' }
    })
    const values = result.labels.map((label) => label.value).sort()
    expect(values).toEqual(['porn', 'sexual'])
    const porn = result.labels.find((label) => label.value === 'porn')!
    expect(porn.sourceWeight).toBeCloseTo(0.3) // ml weight
    expect(porn.confidence).toBeCloseTo(0.92)
  })

  it('does not support non-image inputs', () => {
    const classifier = createNsfwImageClassifier({ detect: () => [] })
    expect(classifier.supports?.({ surface: 'feed', body: 'hi' })).toBe(false)
  })
})
