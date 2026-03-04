/**
 * Storage interfaces and types
 */
import type { ContentId } from '@xnetjs/core'

export interface StorageAdapter {
  // Blobs
  getBlob(cid: ContentId): Promise<Uint8Array | null>
  setBlob(cid: ContentId, data: Uint8Array): Promise<void>
  hasBlob(cid: ContentId): Promise<boolean>

  // Lifecycle
  open(): Promise<void>
  close(): Promise<void>
  clear(): Promise<void>
}

/**
 * Optional telemetry collector interface for storage operations.
 * Compatible with @xnetjs/telemetry TelemetryCollector.
 */
export interface StorageTelemetry {
  reportPerformance(metricName: string, durationMs: number, codeNamespace?: string): void
  reportUsage(metricName: string, value: number): void
  reportCrash(error: Error, context?: { codeNamespace?: string }): void
}
