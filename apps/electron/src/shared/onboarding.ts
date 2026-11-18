/** Local desktop setup, separate from identity keys and provider OAuth transactions. */
export type PendingInvitation = {
  id: string
  channel: string
  name: string
  did: string
  expires: number
  kind?: 'direct' | 'group'
  access?: 'invite' | 'approval' | 'public'
}
export type DesktopOnboardingSnapshot = {
  complete: boolean
  identityStorage: 'secure' | 'plaintext' | 'test'
  invitations: PendingInvitation[]
  socialIdentity?: DesktopSocialIdentity
  signIn: DesktopSignInStatus
}
export type DesktopSocialIdentity = {
  provider: 'bluesky'
  subject: string
  handle: string
  displayName: string
  verifiedAt: number
}
export type DesktopSignInStatus = {
  phase: 'idle' | 'preparing' | 'waiting' | 'verifying' | 'connected' | 'error'
  handle?: string
  message?: string
}
export interface DesktopOnboardingPort {
  snapshot(): Promise<DesktopOnboardingSnapshot>
  saveInvitation(link: string): Promise<void>
  dismissInvitation(id: string): Promise<void>
  requestConnection(id: string): Promise<'requesting' | 'approved'>
  complete(): Promise<void>
  signInBluesky(handle: string): Promise<void>
  cancelSignIn(): Promise<void>
  unlinkBluesky(): Promise<void>
  subscribe(listener: () => void): () => void
}
