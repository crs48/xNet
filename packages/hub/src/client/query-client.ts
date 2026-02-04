/**
 * @xnet/hub - Query client reference implementation.
 */

export class QueryClient {
  private pending = new Map<
    string,
    {
      resolve: (value: unknown) => void
      reject: (error: Error) => void
      timeout: ReturnType<typeof setTimeout>
    }
  >()

  constructor(private ws: WebSocket) {
    this.ws.addEventListener('message', (event) => {
      const msg = JSON.parse(event.data as string) as { type?: string; id?: string; error?: string }
      if (msg.type === 'query-response' || msg.type === 'query-error') {
        const pending = msg.id ? this.pending.get(msg.id) : undefined
        if (pending) {
          clearTimeout(pending.timeout)
          this.pending.delete(msg.id as string)
          if (msg.type === 'query-error') {
            pending.reject(new Error(msg.error ?? 'Query error'))
          } else {
            pending.resolve(msg)
          }
        }
      }
    })
  }

  search(
    query: string,
    options?: {
      schemaIri?: string
      ownerDid?: string
      limit?: number
      offset?: number
      timeoutMs?: number
    }
  ): Promise<{ results: unknown[]; total: number; took: number }> {
    const id = crypto.randomUUID()
    const timeoutMs = options?.timeoutMs ?? 5000

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error('Query timeout'))
      }, timeoutMs)

      this.pending.set(id, { resolve, reject, timeout })

      this.ws.send(
        JSON.stringify({
          type: 'query-request',
          id,
          query,
          filters: {
            schemaIri: options?.schemaIri,
            ownerDid: options?.ownerDid
          },
          limit: options?.limit,
          offset: options?.offset
        })
      )
    })
  }

  index(docId: string, meta: { schemaIri: string; title: string }, text?: string): void {
    this.ws.send(
      JSON.stringify({
        type: 'index-update',
        docId,
        meta,
        text
      })
    )
  }

  removeFromIndex(docId: string): void {
    this.ws.send(
      JSON.stringify({
        type: 'index-remove',
        docId
      })
    )
  }

  destroy(): void {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timeout)
    }
    this.pending.clear()
  }
}
