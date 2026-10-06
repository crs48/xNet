import type {
  SpatialDetail,
  SpatialLibraryAdapter,
  SpatialSnapshot
} from '../shared/spatial-library'
import { validateSpatialSnapshot } from '../shared/spatial-library'

/** Same-origin TLS only; capabilities live in memory, never storage or query strings. */
export async function pairedAdapter(invitation: string): Promise<SpatialLibraryAdapter> {
  if (location.protocol !== 'https:')
    throw new Error('Pairing requires trusted HTTPS on both devices.')
  let token = ''
  const paired = await fetch('/pair', {
    method: 'POST',
    headers: { Authorization: `Bearer ${invitation}` },
    cache: 'no-store',
    credentials: 'omit',
    redirect: 'error'
  })
  if (!paired.ok)
    throw new Error('This invitation expired or was already used. Create a new pairing on the Mac.')
  const grant = (await paired.json()) as { token: string }
  token = grant.token
  async function read(path: string, signal: AbortSignal) {
    const response = await fetch(path, {
      signal,
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
      credentials: 'omit',
      redirect: 'error'
    })
    if (response.status === 401)
      throw new Error('Pairing expired or was revoked. Reconnect from the Mac.')
    if (response.status === 404) return null
    if (!response.ok) throw new Error(`The Mac could not read this item (${response.status}).`)
    return response
  }
  return {
    async snapshot(signal) {
      const response = await read('/api/snapshot', signal)
      if (!response) throw new Error('The paired graph is unavailable.')
      return validateSpatialSnapshot((await response.json()) as SpatialSnapshot)
    },
    async detail(id, signal, text = false) {
      const response = await read(
        `/api/detail/${encodeURIComponent(id)}${text ? '?text=1' : ''}`,
        signal
      )
      return response ? ((await response.json()) as SpatialDetail) : null
    },
    async thumbnail(id, signal) {
      const response = await read(`/api/thumbnail/${encodeURIComponent(id)}`, signal)
      return response ? response.blob() : null
    },
    close() {
      token = ''
    }
  }
}
