/**
 * @xnetjs/cloud/identity — WorkOS AuthKit provider.
 *
 * The custodial billing identity for xNet Cloud, on WorkOS AuthKit (free up to 1M
 * MAU — exploration 0174). Implemented directly against the WorkOS User Management
 * REST API with `fetch`, so the package adds no SDK dependency and the same code
 * runs in the hub's Node runtime. SSO/SCIM (the paid per-connection add-ons) layer
 * on later for the company/enterprise tiers without changing this interface.
 *
 * Docs: https://workos.com/docs/user-management
 */

import type {
  AuthenticationResult,
  AuthorizationUrlOptions,
  BillingIdentityProvider,
  BillingUser
} from './provider'

export interface WorkOSAuthKitConfig {
  /** WorkOS Client ID (`client_...`). */
  clientId: string
  /** WorkOS API key (`sk_...`). Server-side only — never ship to a client. */
  apiKey: string
  /** Default OAuth redirect URI registered in the WorkOS dashboard. */
  redirectUri: string
  /** API base; override for testing. Default `https://api.workos.com`. */
  apiBaseUrl?: string
  /** Injectable fetch (defaults to global). */
  fetchImpl?: typeof fetch
}

/** Raw WorkOS user shape (snake_case) — the fields we consume. */
interface WorkOSUser {
  id: string
  email: string
  email_verified: boolean
  first_name?: string | null
  last_name?: string | null
}

const toBillingUser = (u: WorkOSUser): BillingUser => ({
  id: u.id,
  email: u.email,
  emailVerified: u.email_verified,
  ...(u.first_name ? { firstName: u.first_name } : {}),
  ...(u.last_name ? { lastName: u.last_name } : {})
})

export class WorkOSAuthKitProvider implements BillingIdentityProvider {
  readonly name = 'workos-authkit'
  private readonly apiBaseUrl: string
  private readonly fetchImpl: typeof fetch

  constructor(private readonly config: WorkOSAuthKitConfig) {
    if (!config.clientId || !config.apiKey || !config.redirectUri) {
      throw new Error('WorkOSAuthKitProvider requires clientId, apiKey, and redirectUri')
    }
    this.apiBaseUrl = (config.apiBaseUrl ?? 'https://api.workos.com').replace(/\/+$/, '')
    this.fetchImpl = config.fetchImpl ?? fetch
  }

  getAuthorizationUrl(options: AuthorizationUrlOptions = {}): string {
    const url = new URL(`${this.apiBaseUrl}/user_management/authorize`)
    url.searchParams.set('client_id', this.config.clientId)
    url.searchParams.set('redirect_uri', options.redirectUri ?? this.config.redirectUri)
    url.searchParams.set('response_type', 'code')
    // Enterprise SSO (0338 Phase 4): pin to a specific SAML/OIDC connection or
    // organization when provided; otherwise use WorkOS's hosted AuthKit UI (the
    // free experience). `connection`/`organization` and `provider` are mutually
    // exclusive in the WorkOS API, so we set exactly one path.
    if (options.connectionId) {
      url.searchParams.set('connection', options.connectionId)
    } else if (options.organizationId) {
      url.searchParams.set('organization', options.organizationId)
    } else {
      url.searchParams.set('provider', 'authkit')
    }
    if (options.state) url.searchParams.set('state', options.state)
    if (options.screenHint) url.searchParams.set('screen_hint', options.screenHint)
    return url.toString()
  }

  async authenticateWithCode(code: string): Promise<AuthenticationResult> {
    const res = await this.fetchImpl(`${this.apiBaseUrl}/user_management/authenticate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        client_id: this.config.clientId,
        client_secret: this.config.apiKey,
        grant_type: 'authorization_code',
        code
      })
    })
    if (!res.ok) {
      throw new Error(`WorkOS authenticate failed: ${res.status} ${await safeText(res)}`)
    }
    const data = (await res.json()) as {
      user: WorkOSUser
      access_token: string
      refresh_token?: string
    }
    return {
      user: toBillingUser(data.user),
      accessToken: data.access_token,
      ...(data.refresh_token ? { refreshToken: data.refresh_token } : {})
    }
  }

  async getUser(userId: string): Promise<BillingUser | null> {
    const res = await this.fetchImpl(
      `${this.apiBaseUrl}/user_management/users/${encodeURIComponent(userId)}`,
      { headers: { authorization: `Bearer ${this.config.apiKey}` } }
    )
    if (res.status === 404) return null
    if (!res.ok) {
      throw new Error(`WorkOS getUser failed: ${res.status} ${await safeText(res)}`)
    }
    return toBillingUser((await res.json()) as WorkOSUser)
  }
}

const safeText = async (res: Response): Promise<string> => {
  try {
    return await res.text()
  } catch {
    return ''
  }
}
