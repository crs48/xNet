import { invoke } from '@tauri-apps/api/core'

export type RecordData = {
  id: string
  kind: string
  title: string
  description: string
  owner_name: string
  created: number
  size: number
  mime: string
  chunks: string[]
  reply_to?: string
}
export type Signed<T> = { author: string; payload: T; signature: string }
export type Item = { record: Signed<RecordData>; providers: unknown[] }
export const api = <T>(command: object) => invoke<T>('perform', { command })
export const errorText = (error: unknown) =>
  error instanceof Error ? error.message : String(error)

export type Preferences = {
  hidden: string[]
  muted_authors: string[]
  blocked_contacts: string[]
  topics: string[]
}
export type Room = {
  id: string
  title: string
  private: boolean
  owner: { id: string }
  members: string[]
  moderators: string[]
  banned: string[]
  pending: string[]
  past_members: string[]
  rules: string
  slow_seconds: number
  review_new_members: boolean
  epoch: number
}
export type Message = Signed<{
  id: string
  room: string
  name: string
  body: string
  created: number
}>
export type Subject = {
  kind: string
  id: string
  author: string
  title: string
  room: string | null
}
export type ReportInput = {
  subject: Subject
  category: string
  details: string
  evidence: Message[]
}
export type Decision = {
  id: string
  action: string
  reason: string
  rule: string
  actor: string
  created: number
  until: number | null
}
export type Appeal = { author: string; reason: string; created: number; decision_id: string }
export type ModerationCase = {
  id: string
  scope: string
  reporter: string
  report: ReportInput
  created: number
  evidence_expires: number
  evidence_expired: boolean
  decisions: Decision[]
  appeals: Appeal[]
}
export type Notice = {
  id: string
  scope: string
  subject: Subject
  decisions: Decision[]
  appeals: Appeal[]
}
export type CaseList = {
  cases: ModerationCase[]
  notices: Notice[]
  can_review: boolean
  offset: number
  next: number | null
}
export type Policy = {
  registry_id: string
  generated: number
  expires: number
  moderators: string[]
  rules: string
}
