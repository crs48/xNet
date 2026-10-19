import { readPreviewTree, type ChatPreviewMessage, type ChatPreviewNode } from './agent-extension'

/** Untrusted code runs only in a terminable worker inside an opaque-origin frame. */
export async function compileChatExtension(
  source: string,
  signal?: AbortSignal
): Promise<{ code: string; hash: string }> {
  signal?.throwIfAborted()
  if (source.length > 24000) throw new Error('Source exceeds the 24,000-character preview limit.')
  const code = await new Promise<string>((resolve, reject) => {
    const worker = new Worker(new URL('./extension-compiler.worker.ts', import.meta.url), {
      type: 'module'
    })
    const finish = (code?: string, error?: Error) => {
      clearTimeout(timer)
      signal?.removeEventListener('abort', cancel)
      worker.terminate()
      if (error) reject(error)
      else if (code !== undefined) resolve(code)
    }
    const cancel = () => finish(undefined, new Error('TypeScript build stopped.'))
    const timer = setTimeout(() => {
      finish(undefined, new Error('TypeScript build exceeded ten seconds.'))
    }, 10000)
    signal?.addEventListener('abort', cancel, { once: true })
    worker.onmessage = ({ data }: MessageEvent<{ code?: string; error?: string }>) => {
      if (typeof data.code === 'string' && data.code.length <= 100000) finish(data.code)
      else finish(undefined, new Error(data.error ?? 'Compiler returned an invalid build.'))
    }
    worker.onerror = (event) => finish(undefined, new Error(event.message))
    worker.postMessage(source)
  })
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(
      JSON.stringify({
        source,
        code,
        compiler: '@swc/wasm-web@1.15.41',
        runtime: 'chat-preview-v1'
      })
    )
  )
  return {
    code,
    hash: [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
  }
}
export function runChatExtension(
  code: string,
  messages: ChatPreviewMessage[],
  signal?: AbortSignal
): Promise<ChatPreviewNode> {
  signal?.throwIfAborted()
  if (messages.length > 30 || JSON.stringify(messages).length > 24000 || code.length > 100000)
    return Promise.reject(new Error('Preview input exceeds its limits.'))
  return new Promise((resolve, reject) => {
    const frame = document.createElement('iframe')
    frame.setAttribute('sandbox', 'allow-scripts')
    frame.setAttribute('aria-hidden', 'true')
    frame.hidden = true
    const channel = new MessageChannel()
    let settled = false
    let started = false
    let received = 0
    const finish = (tree?: ChatPreviewNode, error?: Error) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      signal?.removeEventListener('abort', cancel)
      channel.port1.close()
      channel.port2.close()
      frame.remove()
      if (error) reject(error)
      else if (tree) resolve(tree)
      else reject(new Error('The preview returned no view.'))
    }
    const cancel = () => finish(undefined, new Error('Preview stopped.'))
    const timer = setTimeout(
      () => finish(undefined, new Error('Preview exceeded two seconds and was stopped.')),
      2000
    )
    signal?.addEventListener('abort', cancel, { once: true })
    channel.port1.onmessage = ({ data }: MessageEvent<unknown>) => {
      try {
        if (++received > 4) throw new Error('Too many preview messages.')
        if (!data || typeof data !== 'object' || JSON.stringify(data).length > 66000)
          throw new Error('Malformed or oversized preview response.')
        const result = data as Record<string, unknown>
        if (result.ready === true) {
          if (started) throw new Error('Unexpected preview handshake.')
          started = true
          channel.port1.postMessage({ code, input: { messages } })
          return
        }
        if (result.ok !== true)
          throw new Error(
            typeof result.error === 'string' ? result.error.slice(0, 1000) : 'The extension failed.'
          )
        finish(readPreviewTree(result.tree))
      } catch (cause) {
        finish(undefined, cause instanceof Error ? cause : new Error(String(cause)))
      }
    }
    channel.port1.onmessageerror = () => finish(undefined, new Error('Invalid preview message.'))
    frame.onload = () =>
      frame.contentWindow?.postMessage('xnet-preview-connect', '*', [channel.port2])
    frame.src = new URL('./extension-preview-frame.html', import.meta.url).href
    document.body.append(frame)
  })
}
