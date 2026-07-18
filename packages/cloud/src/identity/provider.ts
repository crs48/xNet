/**
 * @xnetjs/cloud/identity — billing identity provider contract.
 *
 * The custodial, recoverable account that owns a tenant's subscription. The default
 * implementation is WorkOS AuthKit (see `workos.ts`); `MemoryBillingIdentityProvider`
 * is a working fake for dev + tests.
 */

/** A custodial user as seen by the control plane. */
export interface BillingUser {
  id: string
  email: string
  emailVerified: boolean
  firstName?: string
  lastName?: string
}

export interface AuthenticationResult {
  user: BillingUser
  accessToken: string
  refreshToken?: string
}

export interface AuthorizationUrlOptions {
  /** Opaque state echoed back to the callback (CSRF / deep-link). */
  state?: string
  /** Land the user on sign-up vs sign-in. */
  screenHint?: 'sign-up' | 'sign-in'
  /** Override the configured redirect URI for this request. */
  redirectUri?: string
  /**
   * Enterprise SSO (0338 Phase 4): route this sign-in through a specific SSO
   * connection or organization instead of the hosted AuthKit UI. One of these
   * pins the flow to an enterprise IdP (SAML / OIDC directory), which is a paid
   * WorkOS per-connection add-on.
   */
  connectionId?: string
  organizationId?: string
}

export interface BillingIdentityProvider {
  /** Telemetry/display label, e.g. `workos-authkit`. */
  readonly name: string
  /** Hosted-auth URL to start a sign-in/sign-up. */
  getAuthorizationUrl(options?: AuthorizationUrlOptions): string
  /** Exchange an OAuth `code` (from the callback) for a user + tokens. */
  authenticateWithCode(code: string): Promise<AuthenticationResult>
  /** Look up a user by id, or null if not found. */
  getUser(userId: string): Promise<BillingUser | null>
}

/** In-memory billing identity provider for dev + tests (no network). */
export class MemoryBillingIdentityProvider implements BillingIdentityProvider {
  readonly name = 'memory'
  private readonly users = new Map<string, BillingUser>()
  private readonly codes = new Map<string, string>() // code -> userId

  constructor(private readonly authBaseUrl = 'https://auth.local/authorize') {}

  /** Seed a user and (optionally) a redeemable auth code for tests. */
  seed(user: BillingUser, code?: string): void {
    this.users.set(user.id, { ...user })
    if (code) this.codes.set(code, user.id)
  }

  getAuthorizationUrl(options: AuthorizationUrlOptions = {}): string {
    const url = new URL(this.authBaseUrl)
    if (options.state) url.searchParams.set('state', options.state)
    if (options.screenHint) url.searchParams.set('screen_hint', options.screenHint)
    return url.toString()
  }

  async authenticateWithCode(code: string): Promise<AuthenticationResult> {
    const userId = this.codes.get(code)
    const user = userId ? this.users.get(userId) : undefined
    if (!user) throw new Error('Invalid authorization code')
    this.codes.delete(code)
    return { user: { ...user }, accessToken: `mem-access-${user.id}` }
  }

  async getUser(userId: string): Promise<BillingUser | null> {
    const user = this.users.get(userId)
    return user ? { ...user } : null
  }
}
