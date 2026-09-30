export type CheckpointManifest = {
  format: 'xnet-desktop-checkpoint/1'
  id: string
  createdAt: string
  appVersion: string
  profile: string
  identity: 'stored' | 'test'
  sourceFingerprint?: string
  pinned?: boolean
  storageVersion?: number
  files: { path: string; size: number; sha256: string }[]
}
