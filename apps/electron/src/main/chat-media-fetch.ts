import type { LookupAddress } from 'node:dns'
import { lookup } from 'node:dns/promises'
import { addAbortListener } from 'node:events'
import { request as httpRequest } from 'node:http'
import { request as httpsRequest } from 'node:https'
import { isIP } from 'node:net'
import { assertPublicUrl } from '@xnetjs/core'

export function validatePreviewUrl(raw: string): URL {
  if (typeof raw !== 'string' || raw.length > 4096) throw new Error('Invalid preview URL.')
  assertPublicUrl(raw)
  const url = new URL(raw)
  if (url.username || url.password || (url.port && !['80', '443'].includes(url.port)))
    throw new Error('Preview URLs cannot contain credentials or custom ports.')
  return url
}

export async function resolvePreviewAddress(
  hostname: string,
  resolve: (host: string) => Promise<LookupAddress[]> = (host) => lookup(host, { all: true })
): Promise<LookupAddress> {
  const host = hostname.replace(/^\[|\]$/g, '')
  const addresses = isIP(host) ? [{ address: host, family: isIP(host) }] : await resolve(host)
  if (!addresses.length) throw new Error('The preview host could not be resolved.')
  for (const entry of addresses) {
    assertPublicUrl(`https://${entry.family === 6 ? `[${entry.address}]` : entry.address}/`)
    // Also reject multicast, reserved and broadcast destinations.
    if (entry.family === 4 && Number(entry.address.split('.')[0]) >= 224)
      throw new Error('Preview host is not a public unicast address.')
    if (entry.family === 6 && entry.address.toLowerCase().startsWith('ff'))
      throw new Error('Preview host is not a public unicast address.')
  }
  return addresses.find((entry) => entry.family === 4) ?? addresses[0]
}

/** DNS is checked once and pinned to the socket; redirects are checked before dialing. */
export async function fetchPreviewBytes(
  raw: string,
  limit: number,
  signal: AbortSignal,
  redirects = 0
): Promise<{
  url: string
  mimeType: string
  bytes: Uint8Array
}> {
  signal.throwIfAborted()
  const url = validatePreviewUrl(raw)
  const address = await new Promise<LookupAddress>((resolve, reject) => {
    const listener = addAbortListener(signal, () => reject(signal.reason))
    void resolvePreviewAddress(url.hostname)
      .then(resolve, reject)
      .finally(() => listener[Symbol.dispose]())
  })
  signal.throwIfAborted()
  return new Promise((resolve, reject) => {
    const request = (url.protocol === 'https:' ? httpsRequest : httpRequest)(
      url,
      {
        signal,
        agent: false,
        family: address.family,
        lookup: (_host, _options, callback) => callback(null, address.address, address.family),
        headers: { 'User-Agent': 'xNet-LinkPreview/1.0', 'Accept-Encoding': 'identity' }
      },
      (response) => {
        const status = response.statusCode ?? 0
        if ([301, 302, 303, 307, 308].includes(status) && response.headers.location) {
          response.destroy()
          if (redirects >= 4) return reject(new Error('Too many preview redirects.'))
          try {
            resolve(
              fetchPreviewBytes(
                new URL(response.headers.location, url).href,
                limit,
                signal,
                redirects + 1
              )
            )
          } catch (error) {
            reject(error)
          }
          return
        }
        if (status < 200 || status >= 300) {
          response.destroy()
          reject(new Error(`This link returned HTTP ${status}.`))
          return
        }
        if (
          response.headers['content-encoding'] &&
          response.headers['content-encoding'] !== 'identity'
        ) {
          response.destroy()
          reject(new Error('This site requires an unsupported preview encoding.'))
          return
        }
        let size = 0
        const chunks: Buffer[] = []
        response.on('data', (chunk: Buffer) => {
          size += chunk.length
          if (size > limit) {
            response.destroy(
              new Error('This file is too large for an automatic preview. Attach it instead.')
            )
            return
          }
          chunks.push(chunk)
        })
        response.on('error', reject)
        response.on('aborted', () => reject(new Error('Preview download was interrupted.')))
        response.on('end', () =>
          resolve({
            url: url.href,
            mimeType: (response.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase(),
            bytes: new Uint8Array(Buffer.concat(chunks))
          })
        )
      }
    )
    request.on('error', reject)
    request.end()
  })
}
