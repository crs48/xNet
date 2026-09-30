type Write = () => Promise<void>

/** Serializes each document and retains failed writes for an explicit retry. */
export function createDocumentWriteBarrier() {
  const tails = new Map<string, Promise<void>>()
  const failures = new Map<string, { write: Write; error: unknown }>()
  const flushers = new Set<Write>()

  const write = (key: string, operation: Write): Promise<void> => {
    const previous = tails.get(key)
    const next = (previous ? previous.catch(() => undefined) : Promise.resolve()).then(operation)
    tails.set(key, next)
    // Attach both handlers immediately, including for unmount writes whose caller is gone.
    void next.then(
      () => {
        failures.delete(key)
        if (tails.get(key) === next) tails.delete(key)
      },
      (error: unknown) => {
        failures.set(key, { write: operation, error })
        if (tails.get(key) === next) tails.delete(key)
      }
    )
    return next
  }

  return {
    write,
    async flushKey(key: string): Promise<void> {
      while (tails.has(key)) await tails.get(key)?.catch(() => undefined)
      const failed = failures.get(key)
      if (failed) await write(key, failed.write)
    },
    register(flush: Write): () => void {
      flushers.add(flush)
      return () => flushers.delete(flush)
    },
    async flush(): Promise<void> {
      while (tails.size) await Promise.allSettled([...tails.values()])
      // Unmounted documents have no active hook to retry their retained bytes.
      await Promise.allSettled([...failures].map(([key, failed]) => write(key, failed.write)))
      const active = await Promise.allSettled(Array.from(flushers, (flush) => flush()))
      while (tails.size) await Promise.allSettled([...tails.values()])
      if (failures.size)
        throw new AggregateError(
          [...failures.values()].map((item) => item.error),
          'Document writes failed. Your unsaved content is retained.'
        )
      const rejected = active.filter(
        (result): result is PromiseRejectedResult => result.status === 'rejected'
      )
      if (rejected.length)
        throw new AggregateError(
          rejected.map((result) => result.reason),
          'Could not flush every open document. Retry before closing.'
        )
    }
  }
}

const documents = createDocumentWriteBarrier()
const storeIds = new WeakMap<object, number>()
let nextStoreId = 0

function keyFor(store: object, id: string): string {
  if (!storeIds.has(store)) storeIds.set(store, ++nextStoreId)
  return `${storeIds.get(store)}:${id}`
}

export function persistDocument(
  store: { setDocumentContent(id: string, content: Uint8Array): Promise<void> },
  id: string,
  content: Uint8Array
): Promise<void> {
  const retained = content.slice()
  return documents.write(`document:${keyFor(store, id)}`, () =>
    store.setDocumentContent(id, retained)
  )
}

export const registerDocumentFlush = documents.register
export const flushDocumentWrites = documents.flush

export function retryDocumentWrite(store: object, id: string): Promise<void> {
  return documents.flushKey(`document:${keyFor(store, id)}`)
}
