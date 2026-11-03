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
