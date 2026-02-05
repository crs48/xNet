/**
 * DIDAvatar - Generates a deterministic geometric avatar from a DID string.
 *
 * Creates a unique visual identity by hashing the DID and using the resulting
 * bytes to determine colors, shapes, and positions in a 5x5 grid pattern
 * (mirrored for symmetry, like GitHub identicons).
 */
import React from 'react'

interface DIDavatarProps {
  did: string
  size?: number
  className?: string
}

/**
 * Simple hash function for DID strings.
 * Returns an array of pseudo-random bytes derived from the input.
 */
function hashDID(did: string): number[] {
  const bytes: number[] = []
  let hash = 0

  for (let i = 0; i < did.length; i++) {
    hash = ((hash << 5) - hash + did.charCodeAt(i)) | 0
  }

  // Generate 32 bytes from the hash by iterating
  for (let i = 0; i < 32; i++) {
    hash = ((hash << 13) ^ hash) | 0
    hash = (hash * 0x5bd1e995) | 0
    hash = (hash ^ (hash >> 15)) | 0
    bytes.push(Math.abs(hash) % 256)
  }

  return bytes
}

/**
 * Generate a color from hash bytes at a given offset.
 * Returns an HSL color with good saturation and brightness.
 */
function colorFromBytes(bytes: number[], offset: number): string {
  const hue = (bytes[offset % bytes.length] * 360) / 256
  const sat = 50 + (bytes[(offset + 1) % bytes.length] % 30) // 50-80%
  const lit = 45 + (bytes[(offset + 2) % bytes.length] % 20) // 45-65%
  return `hsl(${Math.round(hue)}, ${sat}%, ${lit}%)`
}

/**
 * Generate a 5x5 grid pattern (mirrored horizontally for symmetry).
 * Returns a boolean array of which cells are filled.
 */
function generatePattern(bytes: number[]): boolean[] {
  const grid: boolean[] = new Array(25).fill(false)

  // Only compute left half + center column (3 columns), mirror the rest
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 3; col++) {
      const byteIdx = row * 3 + col + 5
      const filled = bytes[byteIdx % bytes.length] > 128
      grid[row * 5 + col] = filled
      grid[row * 5 + (4 - col)] = filled // Mirror
    }
  }

  return grid
}

export function DIDAvatar({ did, size = 32, className = '' }: DIDavatarProps) {
  const bytes = hashDID(did)
  const bgColor = colorFromBytes(bytes, 0)
  const fgColor = colorFromBytes(bytes, 3)
  const pattern = generatePattern(bytes)

  const padding = size * 0.1
  const innerSize = size - padding * 2
  const innerCellSize = innerSize / 5

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className={className}
      style={{ borderRadius: '50%', flexShrink: 0 }}
    >
      {/* Background circle */}
      <circle cx={size / 2} cy={size / 2} r={size / 2} fill={bgColor} />

      {/* Pattern cells */}
      {pattern.map((filled, idx) => {
        if (!filled) return null
        const row = Math.floor(idx / 5)
        const col = idx % 5
        return (
          <rect
            key={idx}
            x={padding + col * innerCellSize}
            y={padding + row * innerCellSize}
            width={innerCellSize}
            height={innerCellSize}
            fill={fgColor}
            rx={innerCellSize * 0.15}
          />
        )
      })}
    </svg>
  )
}

/**
 * Get a deterministic color for a DID (useful for cursor colors).
 */
export function getColorForDID(did: string): string {
  return colorFromBytes(hashDID(did), 0)
}
