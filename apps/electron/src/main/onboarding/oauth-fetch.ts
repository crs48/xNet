import { addAbortListener } from 'node:events'
import { request as httpsRequest } from 'node:https'
import { resolvePreviewAddress, validatePreviewUrl } from '../chat-media-fetch'

/** OAuth discovery can name arbitrary hosts. Pin public DNS answers before sending credentials. */
export const oauthFetch: typeof fetch = async (input, init) => {
  const request = new Request(input, init)
  const url = validatePreviewUrl(request.url)
  if (url.protocol !== 'https:') throw new Error('Sign-in requires HTTPS.')
  const signal = AbortSignal.any([request.signal, AbortSignal.timeout(15_000)])
  signal.throwIfAborted()
  const address = await new Promise<Awaited<ReturnType<typeof resolvePreviewAddress>>>(
    (resolve, reject) => {
      const listener = addAbortListener(signal, () => reject(signal.reason))
      void resolvePreviewAddress(url.hostname)
        .then(resolve, reject)
        .finally(() => listener[Symbol.dispose]())
    }
  )
  signal.throwIfAborted()
  const body = request.body ? Buffer.from(await request.arrayBuffer()) : undefined
  if (body && body.length > 64 * 1024) throw new Error('Sign-in request is too large.')
  return new Promise<Response>((resolve, reject) => {
    const outgoing = httpsRequest(
      url,
      {
        method: request.method,
        headers: { ...Object.fromEntries(request.headers), 'accept-encoding': 'identity' },
        signal,
        agent: false,
        family: address.family,
        lookup: (_host, _options, callback) => callback(null, address.address, address.family)
      },
      (incoming) => {
        // No automatic redirects: never forward a DPoP proof or bearer token to another origin.
        if (incoming.statusCode && incoming.statusCode >= 300 && incoming.statusCode < 400) {
          incoming.destroy()
          reject(new Error('The sign-in server returned an unsupported redirect.'))
          return
        }
        if (
          incoming.headers['content-encoding'] &&
          incoming.headers['content-encoding'] !== 'identity'
        ) {
          incoming.destroy()
          reject(new Error('The sign-in server returned an unsupported encoding.'))
          return
        }
        const chunks: Buffer[] = []
        let size = 0
        incoming.on('data', (chunk: Buffer) => {
          size += chunk.length
          if (size > 1024 * 1024) incoming.destroy(new Error('Sign-in response is too large.'))
          else chunks.push(chunk)
        })
        incoming.on('error', reject)
        incoming.on('aborted', () => reject(new Error('Sign-in response was interrupted.')))
        incoming.on('end', () => {
          const headers = new Headers()
          for (const [key, value] of Object.entries(incoming.headers)) {
            if (value !== undefined)
              headers.set(key, Array.isArray(value) ? value.join(', ') : value)
          }
          const status = incoming.statusCode ?? 502
          if (status < 200 || status > 599) {
            reject(new Error('The sign-in server returned an invalid status.'))
            return
          }
          const response = new Response(
            [204, 205, 304].includes(status) ? null : Buffer.concat(chunks),
            { status, headers }
          )
          Object.defineProperty(response, 'url', { value: url.href })
          resolve(response)
        })
      }
    )
    outgoing.on('error', reject)
    outgoing.end(body)
  })
}
