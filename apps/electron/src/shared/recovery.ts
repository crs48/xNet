export type CheckpointManifest = {
  format: 'xnet-desktop-checkpoint/1'
  id: string
  createdAt: string
  appVersion: string
  profile: string
  identity: 'stored' | 'test'
  files: { path: string; size: number; sha256: string }[]
}
