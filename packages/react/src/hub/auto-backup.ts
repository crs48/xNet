/**
 * Auto-backup for hub snapshots.
 */
import * as Y from 'yjs'

export type BackupUploader = (docId: string, plaintext: Uint8Array) => Promise<void>

export type AutoBackupOptions = {
  debounceMs?: number
  isEnabled?: () => boolean
}

export class AutoBackup {
  private timers = new Map<string, ReturnType<typeof setTimeout>>()
  private debounceMs: number
  private isEnabled: () => boolean

  constructor(
    private upload: BackupUploader,
    options?: AutoBackupOptions
  ) {
    this.debounceMs = options?.debounceMs ?? 5000
    this.isEnabled = options?.isEnabled ?? (() => true)
  }

  handleDocUpdate(docId: string, doc: Y.Doc): void {
    this.scheduleBackup(docId, doc, this.debounceMs)
  }

  handleDocEvict(docId: string, doc: Y.Doc): void {
    this.scheduleBackup(docId, doc, 0)
  }

  private scheduleBackup(docId: string, doc: Y.Doc, delay: number): void {
    const existing = this.timers.get(docId)
    if (existing) {
      clearTimeout(existing)
    }

    const run = async () => {
      this.timers.delete(docId)
      if (!this.isEnabled()) return

      try {
        const state = Y.encodeStateAsUpdate(doc)
        await this.upload(docId, state)
      } catch (err) {
        console.warn(`[auto-backup] Failed for ${docId}:`, err)
      }
    }

    if (delay <= 0) {
      void run()
      return
    }

    this.timers.set(
      docId,
      setTimeout(() => void run(), delay)
    )
  }

  async flush(): Promise<void> {
    for (const timer of this.timers.values()) {
      clearTimeout(timer)
    }
    this.timers.clear()
  }

  destroy(): void {
    void this.flush()
  }
}
