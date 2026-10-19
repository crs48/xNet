import type { ExtensionGrant } from './extension-data'
import type { DataBridge } from '@xnetjs/data-bridge'
import { readExtensionGrant } from './extension-data'
import { ExtensionAccessError } from './extension-protocol'

export interface ExtensionApproval {
  version: 2
  epoch: string
  channelId: string
  grant: ExtensionGrant
  active: boolean
  created: string[]
  commands: number
  lastReceipt: string | null
}
export interface ExtensionAuthority {
  key: string
  epoch: string
  read(): Promise<{ raw: string; approval: ExtensionApproval }>
  revoke(): Promise<void>
}
const listeners = new Map<string, Set<() => void>>()
export function observeExtensionAuthority(key: string, listener: () => void): () => void {
  const set = listeners.get(key) ?? new Set()
  listeners.set(key, set)
  set.add(listener)
  return () => {
    set.delete(listener)
    if (!set.size) listeners.delete(key)
  }
}
const unavailable = () =>
  new ExtensionAccessError(
    'unsupported',
    'Durable extension permissions are unavailable on this host.'
  )
export async function extensionAuthorityKey(
  owner: string,
  channelId: string,
  hash: string
): Promise<string> {
  const bytes = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(JSON.stringify([owner, channelId, hash]))
  )
  return `extension-authority:v2:${Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, '0')).join('')}`
}
function decode(text: string, owner: string, channelId: string, hash: string): ExtensionApproval {
  const value: unknown = JSON.parse(text)
  if (!value || typeof value !== 'object')
    throw new ExtensionAccessError('invalid', 'Saved extension permission is unreadable.')
  const state = value as ExtensionApproval
  if (
    state.version !== 2 ||
    typeof state.epoch !== 'string' ||
    !/^[a-f0-9-]{36}$/.test(state.epoch) ||
    state.channelId !== channelId ||
    typeof state.active !== 'boolean' ||
    !Number.isSafeInteger(state.commands) ||
    state.commands < 0 ||
    state.commands > 1000 ||
    (state.lastReceipt !== null &&
      (typeof state.lastReceipt !== 'string' ||
        !/^[a-zA-Z0-9:_-]{1,160}$/.test(state.lastReceipt))) ||
    !Array.isArray(state.created) ||
    state.created.length > 100 ||
    state.created.some((id) => typeof id !== 'string' || !/^[a-f0-9-]{36}$/.test(id))
  )
    throw new ExtensionAccessError('invalid', 'Saved extension permission is unreadable.')
  return { ...state, grant: readExtensionGrant(JSON.stringify(state.grant), owner, hash) }
}
/** Only the trusted permission sheet calls with `approve`. Legacy localStorage grants are never imported. */
export async function openExtensionAuthority(
  bridge: DataBridge,
  owner: string,
  channelId: string,
  hash: string,
  approve?: ExtensionGrant
): Promise<{ authority: ExtensionAuthority; approval: ExtensionApproval } | null> {
  if (!bridge.getLocalState || !bridge.transaction) throw unavailable()
  const key = await extensionAuthorityKey(owner, channelId, hash)
  let raw = await bridge.getLocalState(key)
  let approval = raw === null ? null : decode(raw, owner, channelId, hash)
  if (approve) {
    approval = {
      version: 2,
      epoch: crypto.randomUUID(),
      channelId,
      active: true,
      created: [],
      commands: 0,
      lastReceipt: null,
      grant: readExtensionGrant(JSON.stringify(approve), owner, hash)
    }
    const next = JSON.stringify(approval)
    await bridge.transaction([], {
      nodes: [],
      deadline: Date.now() + 5000,
      localState: [{ key, expected: raw, value: next }]
    })
    raw = next
    listeners.get(key)?.forEach((notify) => notify())
  }
  if (!approval?.active) return null
  const epoch = approval.epoch
  const read = async () => {
    const latest = await bridge.getLocalState!(key)
    if (latest === null)
      throw new ExtensionAccessError('revoked', 'Extension permission no longer exists.')
    const current = decode(latest, owner, channelId, hash)
    if (!current.active || current.epoch !== epoch)
      throw new ExtensionAccessError('revoked', 'Extension permission was revoked or replaced.')
    return { raw: latest, approval: current }
  }
  return {
    approval,
    authority: {
      key,
      epoch,
      read,
      async revoke() {
        // A concurrent write may append created IDs. Re-read until this epoch is durably revoked;
        // never revoke an independently approved newer epoch.
        for (let attempt = 0; attempt < 8; attempt++) {
          const latest = await bridge.getLocalState!(key)
          if (latest === null) return
          const current = decode(latest, owner, channelId, hash)
          if (current.epoch !== epoch || !current.active) return
          try {
            await bridge.transaction!([], {
              nodes: [],
              deadline: Date.now() + 5000,
              localState: [
                { key, expected: latest, value: JSON.stringify({ ...current, active: false }) }
              ]
            })
            listeners.get(key)?.forEach((notify) => notify())
            return
          } catch (cause) {
            if ((await bridge.getLocalState!(key)) === latest) throw cause
          }
        }
        throw new ExtensionAccessError(
          'conflict',
          'Access stopped, but durable revocation is still pending. Retry revocation.'
        )
      }
    }
  }
}
