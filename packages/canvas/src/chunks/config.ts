/**
 * Chunk Configuration
 *
 * Constants and helpers for tile-based spatial chunking.
 * Chunks divide the infinite canvas into manageable tiles that can be
 * loaded/unloaded independently.
 */

import type { Rect } from '../types'

// ─── Constants ────────────────────────────────────────────────────────────────

/** Size of each chunk in canvas units (2048 = ~10 screens at 1x zoom) */
export const CHUNK_SIZE = 2048

/** Load chunks within this radius (in chunks) from viewport center */
export const LOAD_RADIUS = 2

/** Evict chunks beyond this radius (in chunks) from viewport center */
export const EVICT_RADIUS = 4

/** Maximum chunks to keep in memory */
export const MAX_LOADED_CHUNKS = 50

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Chunk key format: "x,y" e.g., "0,0", "-1,2"
 * This is a template literal type for type safety.
 */
export type ChunkKey = `${number},${number}`

// ─── Helper Functions ─────────────────────────────────────────────────────────

/**
 * Convert canvas coordinates to a chunk key.
 * Uses the node center to determine which chunk it belongs to.
 *
 * @example
 * chunkKeyFromPosition(100, 100)   // "0,0"
 * chunkKeyFromPosition(2200, 100)  // "1,0"
 * chunkKeyFromPosition(-100, -100) // "-1,-1"
 */
export function chunkKeyFromPosition(x: number, y: number): ChunkKey {
  const chunkX = Math.floor(x / CHUNK_SIZE)
  const chunkY = Math.floor(y / CHUNK_SIZE)
  return `${chunkX},${chunkY}`
}

/**
 * Parse a chunk key into chunk coordinates.
 * Returns the top-left corner of the chunk in chunk coordinates.
 */
export function parseChunkKey(key: ChunkKey): { chunkX: number; chunkY: number } {
  const [x, y] = key.split(',').map(Number)
  return { chunkX: x, chunkY: y }
}

/**
 * Convert a chunk key to canvas coordinates.
 * Returns the top-left corner of the chunk in canvas space.
 *
 * @example
 * positionFromChunkKey("0,0")  // { x: 0, y: 0 }
 * positionFromChunkKey("1,0")  // { x: 2048, y: 0 }
 * positionFromChunkKey("-1,0") // { x: -2048, y: 0 }
 */
export function positionFromChunkKey(key: ChunkKey): { x: number; y: number } {
  const { chunkX, chunkY } = parseChunkKey(key)
  return { x: chunkX * CHUNK_SIZE, y: chunkY * CHUNK_SIZE }
}

/**
 * Get the bounding rectangle of a chunk in canvas coordinates.
 */
export function chunkBounds(key: ChunkKey): Rect {
  const { x, y } = positionFromChunkKey(key)
  return { x, y, width: CHUNK_SIZE, height: CHUNK_SIZE }
}

/**
 * Calculate the center of a chunk in canvas coordinates.
 */
export function chunkCenter(key: ChunkKey): { x: number; y: number } {
  const { x, y } = positionFromChunkKey(key)
  return { x: x + CHUNK_SIZE / 2, y: y + CHUNK_SIZE / 2 }
}

/**
 * Calculate the Euclidean distance between two chunks.
 */
export function chunkDistance(key1: ChunkKey, key2: ChunkKey): number {
  const { chunkX: x1, chunkY: y1 } = parseChunkKey(key1)
  const { chunkX: x2, chunkY: y2 } = parseChunkKey(key2)
  return Math.sqrt((x1 - x2) ** 2 + (y1 - y2) ** 2)
}

/**
 * Get all chunk keys within a radius of a center chunk.
 * Returns keys sorted by distance from center.
 */
export function getChunksInRadius(centerKey: ChunkKey, radius: number): ChunkKey[] {
  const { chunkX: cx, chunkY: cy } = parseChunkKey(centerKey)
  const chunks: ChunkKey[] = []

  for (let x = cx - radius; x <= cx + radius; x++) {
    for (let y = cy - radius; y <= cy + radius; y++) {
      // Use Chebyshev distance (max of dx, dy) for square radius
      if (Math.abs(x - cx) <= radius && Math.abs(y - cy) <= radius) {
        chunks.push(`${x},${y}`)
      }
    }
  }

  // Sort by distance from center
  return chunks.sort((a, b) => chunkDistance(a, centerKey) - chunkDistance(b, centerKey))
}

/**
 * Get chunk keys that cover a visible rectangle.
 * Used to determine which chunks are needed for a viewport.
 */
export function getChunksForRect(rect: Rect): ChunkKey[] {
  const minChunkX = Math.floor(rect.x / CHUNK_SIZE)
  const maxChunkX = Math.floor((rect.x + rect.width) / CHUNK_SIZE)
  const minChunkY = Math.floor(rect.y / CHUNK_SIZE)
  const maxChunkY = Math.floor((rect.y + rect.height) / CHUNK_SIZE)

  const chunks: ChunkKey[] = []
  for (let x = minChunkX; x <= maxChunkX; x++) {
    for (let y = minChunkY; y <= maxChunkY; y++) {
      chunks.push(`${x},${y}`)
    }
  }

  return chunks
}
