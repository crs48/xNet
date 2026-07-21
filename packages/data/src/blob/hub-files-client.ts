/**
 * HubFilesClient — the one client for the hub's content-addressed file
 * endpoints (`packages/hub/src/routes/files.ts`).
 *
 * Blob bytes never travel through the change log: the log carries the small
 * FileRef, and the bytes move over this sideband, addressed by CID
 * (exploration 0385 W3). The hub verifies the declared CID against the bytes
 * it receives, and we verify again on download — a CID is a claim until the
 * hash checks out.
 */

/** Thrown for hub responses we can act on differently (quota, missing). */
export class HubFilesError extends Error {
  readonly _tag = 'HubFilesError'
  constructor(
    message: string,
    readonly code:
      | 'NOT_FOUND'
      | 'QUOTA_EXCEEDED'
      | 'FILE_TOO_LARGE'
      | 'UNAUTHORIZED'
      | 'CID_MISMATCH'
      | 'NETWORK',
    readonly status?: number,
    options?: { cause?: unknown }
  ) {
    super(message, options)
    this.name = 'HubFilesError'
  }
}

export interface HubFilesClientOptions {
  /** Hub base URL; ws/wss are normalised to http/https. */
  hubUrl: string
  /** UCAN bearer token provider (re-read per request; tokens expire). */
  getAuthToken?: () => Promise<string> | string
  fetchImpl?: typeof fetch
}

/** ws://… → http://…, and trim any trailing slash. */
export function toHttpUrl(hubUrl: string): string {
  try {
    const url = new URL(hubUrl)
    if (url.protocol === 'ws:') url.protocol = 'http:'
    if (url.protocol === 'wss:') url.protocol = 'https:'
    return url.toString().replace(/\/$/, '')
  } catch {
    return hubUrl
  }
}

function codeForStatus(status: number): HubFilesError['code'] {
  switch (status) {
    case 404:
      return 'NOT_FOUND'
    case 507:
      return 'QUOTA_EXCEEDED'
    case 413:
      return 'FILE_TOO_LARGE'
    case 401:
    case 403:
      return 'UNAUTHORIZED'
    case 422:
      return 'CID_MISMATCH'
    default:
      return 'NETWORK'
  }
}

export class HubFilesClient {
  private readonly fetchImpl: typeof fetch

  constructor(private readonly options: HubFilesClientOptions) {
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis)
  }

  private get base(): string {
    return toHttpUrl(this.options.hubUrl)
  }

  private async headers(extra: Record<string, string> = {}): Promise<Record<string, string>> {
    const token = this.options.getAuthToken ? await this.options.getAuthToken() : ''
    return { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...extra }
  }

  /** Does the hub already hold this CID? Cheap pre-check before uploading. */
  async has(cid: string): Promise<boolean> {
    const res = await this.fetchImpl(`${this.base}/files/${encodeURIComponent(cid)}`, {
      method: 'HEAD',
      headers: await this.headers()
    })
    return res.ok
  }

  /** Upload bytes under a CID the caller already computed. */
  async put(
    cid: string,
    data: Uint8Array,
    meta: { name: string; mimeType: string }
  ): Promise<void> {
    const res = await this.fetchImpl(`${this.base}/files/${encodeURIComponent(cid)}`, {
      method: 'PUT',
      headers: await this.headers({
        'Content-Type': meta.mimeType || 'application/octet-stream',
        'X-File-Name': meta.name
      }),
      body: data as unknown as BodyInit
    })
    if (!res.ok) {
      throw new HubFilesError(await describeFailure(res), codeForStatus(res.status), res.status)
    }
  }

  /** Download bytes for a CID. Callers must verify the hash before storing. */
  async get(cid: string): Promise<Uint8Array> {
    const res = await this.fetchImpl(`${this.base}/files/${encodeURIComponent(cid)}`, {
      method: 'GET',
      headers: await this.headers()
    })
    if (!res.ok) {
      throw new HubFilesError(await describeFailure(res), codeForStatus(res.status), res.status)
    }
    return new Uint8Array(await res.arrayBuffer())
  }
}

async function describeFailure(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string }
    if (body?.error) return body.error
  } catch {
    // non-JSON body; fall through to the status line
  }
  return `Hub file request failed: ${res.status}`
}
