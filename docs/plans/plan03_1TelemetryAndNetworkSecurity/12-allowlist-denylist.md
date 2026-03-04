# 12: Allowlist/Denylist

> User-controlled peer access lists at workspace level

**Duration:** 1 day  
**Dependencies:** [11-auto-blocking.md](./11-auto-blocking.md)

## Overview

Allow users to explicitly control which peers can sync with their workspaces:

- **Denylist**: Block specific peers (manual or automatic)
- **Allowlist**: Only allow specific peers (for private workspaces)

## Implementation

```typescript
// packages/network/src/security/access-list.ts

import type { PeerId, DID } from '@xnetjs/core'

/**
 * Deny list entry.
 */
export interface DenyEntry {
  /** When blocked */
  addedAt: Date
  /** When block expires (undefined = permanent) */
  expiresAt?: Date
  /** Why blocked */
  reason: string
  /** Who added (DID of user, or 'system' for auto-blocks) */
  addedBy: string
  /** Was this an auto-block? */
  auto: boolean
}

/**
 * Allow list entry.
 */
export interface AllowEntry {
  /** When added */
  addedAt: Date
  /** Label/note */
  label?: string
  /** Who added */
  addedBy: string
}

/**
 * Access control configuration for a workspace.
 */
export interface WorkspaceAccessConfig {
  workspaceId: string

  /** Enable allowlist mode (only allowlisted peers can sync) */
  allowlistEnabled: boolean

  /** Peers allowed to sync (only used if allowlistEnabled) */
  allowlist: Map<PeerId, AllowEntry>

  /** Peers blocked from syncing */
  denylist: Map<PeerId, DenyEntry>

  /** IPs blocked (for severe cases) */
  ipDenylist: Map<string, DenyEntry>
}

/**
 * Workspace-level peer access control.
 */
export class PeerAccessControl {
  private configs = new Map<string, WorkspaceAccessConfig>()
  private globalDenylist = new Map<PeerId, DenyEntry>()
  private globalIPDenylist = new Map<string, DenyEntry>()

  // ============ Configuration ============

  /**
   * Get or create config for a workspace.
   */
  getConfig(workspaceId: string): WorkspaceAccessConfig {
    let config = this.configs.get(workspaceId)
    if (!config) {
      config = {
        workspaceId,
        allowlistEnabled: false,
        allowlist: new Map(),
        denylist: new Map(),
        ipDenylist: new Map()
      }
      this.configs.set(workspaceId, config)
    }
    return config
  }

  /**
   * Enable/disable allowlist mode.
   */
  setAllowlistMode(workspaceId: string, enabled: boolean): void {
    const config = this.getConfig(workspaceId)
    config.allowlistEnabled = enabled
  }

  // ============ Access Checks ============

  /**
   * Check if a peer can access a workspace.
   */
  canAccess(
    workspaceId: string,
    peerId: PeerId,
    ip?: string
  ): {
    allowed: boolean
    reason?: string
  } {
    // Check global denylist first
    if (this.globalDenylist.has(peerId)) {
      const entry = this.globalDenylist.get(peerId)!
      if (!entry.expiresAt || entry.expiresAt > new Date()) {
        return { allowed: false, reason: `Global denylist: ${entry.reason}` }
      }
    }

    // Check global IP denylist
    if (ip && this.globalIPDenylist.has(ip)) {
      const entry = this.globalIPDenylist.get(ip)!
      if (!entry.expiresAt || entry.expiresAt > new Date()) {
        return { allowed: false, reason: `IP blocked: ${entry.reason}` }
      }
    }

    const config = this.configs.get(workspaceId)
    if (!config) {
      return { allowed: true } // No config = allow all
    }

    // Check workspace denylist
    if (config.denylist.has(peerId)) {
      const entry = config.denylist.get(peerId)!
      if (!entry.expiresAt || entry.expiresAt > new Date()) {
        return { allowed: false, reason: `Workspace denylist: ${entry.reason}` }
      }
    }

    // Check workspace IP denylist
    if (ip && config.ipDenylist.has(ip)) {
      const entry = config.ipDenylist.get(ip)!
      if (!entry.expiresAt || entry.expiresAt > new Date()) {
        return { allowed: false, reason: `Workspace IP blocked: ${entry.reason}` }
      }
    }

    // Check allowlist mode
    if (config.allowlistEnabled) {
      if (!config.allowlist.has(peerId)) {
        return { allowed: false, reason: 'Not on allowlist' }
      }
    }

    return { allowed: true }
  }

  // ============ Denylist Management ============

  /**
   * Add peer to global denylist.
   */
  addToGlobalDenylist(peerId: PeerId, entry: Omit<DenyEntry, 'addedAt'>): void {
    this.globalDenylist.set(peerId, {
      ...entry,
      addedAt: new Date()
    })
  }

  /**
   * Add peer to workspace denylist.
   */
  addToDenylist(workspaceId: string, peerId: PeerId, entry: Omit<DenyEntry, 'addedAt'>): void {
    const config = this.getConfig(workspaceId)
    config.denylist.set(peerId, {
      ...entry,
      addedAt: new Date()
    })
  }

  /**
   * Remove peer from denylist.
   */
  removeFromDenylist(workspaceId: string, peerId: PeerId): void {
    const config = this.configs.get(workspaceId)
    config?.denylist.delete(peerId)
  }

  /**
   * Remove peer from global denylist.
   */
  removeFromGlobalDenylist(peerId: PeerId): void {
    this.globalDenylist.delete(peerId)
  }

  /**
   * Add IP to denylist.
   */
  addIPToDenylist(workspaceId: string | null, ip: string, entry: Omit<DenyEntry, 'addedAt'>): void {
    if (workspaceId) {
      const config = this.getConfig(workspaceId)
      config.ipDenylist.set(ip, { ...entry, addedAt: new Date() })
    } else {
      this.globalIPDenylist.set(ip, { ...entry, addedAt: new Date() })
    }
  }

  // ============ Allowlist Management ============

  /**
   * Add peer to allowlist.
   */
  addToAllowlist(workspaceId: string, peerId: PeerId, entry: Omit<AllowEntry, 'addedAt'>): void {
    const config = this.getConfig(workspaceId)
    config.allowlist.set(peerId, {
      ...entry,
      addedAt: new Date()
    })
  }

  /**
   * Remove peer from allowlist.
   */
  removeFromAllowlist(workspaceId: string, peerId: PeerId): void {
    const config = this.configs.get(workspaceId)
    config?.allowlist.delete(peerId)
  }

  // ============ Queries ============

  /**
   * Get all denied peers for a workspace.
   */
  getDenylist(workspaceId: string): Array<{ peerId: PeerId; entry: DenyEntry }> {
    const config = this.configs.get(workspaceId)
    if (!config) return []

    return Array.from(config.denylist.entries()).map(([peerId, entry]) => ({ peerId, entry }))
  }

  /**
   * Get all allowed peers for a workspace.
   */
  getAllowlist(workspaceId: string): Array<{ peerId: PeerId; entry: AllowEntry }> {
    const config = this.configs.get(workspaceId)
    if (!config) return []

    return Array.from(config.allowlist.entries()).map(([peerId, entry]) => ({ peerId, entry }))
  }

  /**
   * Get global denylist.
   */
  getGlobalDenylist(): Array<{ peerId: PeerId; entry: DenyEntry }> {
    return Array.from(this.globalDenylist.entries()).map(([peerId, entry]) => ({ peerId, entry }))
  }

  // ============ Persistence ============

  /**
   * Export config for persistence.
   */
  exportConfig(workspaceId: string): object {
    const config = this.configs.get(workspaceId)
    if (!config) return {}

    return {
      workspaceId: config.workspaceId,
      allowlistEnabled: config.allowlistEnabled,
      allowlist: Array.from(config.allowlist.entries()),
      denylist: Array.from(config.denylist.entries()),
      ipDenylist: Array.from(config.ipDenylist.entries())
    }
  }

  /**
   * Import config from persistence.
   */
  importConfig(data: any): void {
    if (!data.workspaceId) return

    const config: WorkspaceAccessConfig = {
      workspaceId: data.workspaceId,
      allowlistEnabled: data.allowlistEnabled ?? false,
      allowlist: new Map(data.allowlist ?? []),
      denylist: new Map(data.denylist ?? []),
      ipDenylist: new Map(data.ipDenylist ?? [])
    }

    // Convert date strings back to Date objects
    for (const [_, entry] of config.denylist) {
      entry.addedAt = new Date(entry.addedAt)
      if (entry.expiresAt) entry.expiresAt = new Date(entry.expiresAt)
    }
    for (const [_, entry] of config.allowlist) {
      entry.addedAt = new Date(entry.addedAt)
    }

    this.configs.set(data.workspaceId, config)
  }
}
```

## Usage Example

```typescript
import { PeerAccessControl } from '@xnetjs/network/security'

const accessControl = new PeerAccessControl()

// Enable allowlist mode for private workspace
accessControl.setAllowlistMode('private-workspace', true)
accessControl.addToAllowlist('private-workspace', 'trusted-peer-1', {
  label: 'Team member Alice',
  addedBy: 'did:key:myDID'
})

// Block a peer
accessControl.addToDenylist('my-workspace', 'bad-peer', {
  reason: 'Sent invalid data repeatedly',
  addedBy: 'did:key:myDID',
  auto: false
})

// Check access in sync handler
function handleSyncRequest(workspaceId: string, peerId: string, ip: string) {
  const access = accessControl.canAccess(workspaceId, peerId, ip)
  if (!access.allowed) {
    throw new AccessDeniedError(access.reason)
  }
  // Continue with sync...
}
```

## Tests

```typescript
// packages/network/test/access-list.test.ts

import { describe, it, expect, beforeEach } from 'vitest'
import { PeerAccessControl } from '../src/security/access-list'

describe('PeerAccessControl', () => {
  let accessControl: PeerAccessControl

  beforeEach(() => {
    accessControl = new PeerAccessControl()
  })

  describe('canAccess', () => {
    it('should allow by default', () => {
      const result = accessControl.canAccess('workspace', 'peer1')
      expect(result.allowed).toBe(true)
    })

    it('should block denylisted peers', () => {
      accessControl.addToDenylist('workspace', 'bad-peer', {
        reason: 'test',
        addedBy: 'user',
        auto: false
      })

      const result = accessControl.canAccess('workspace', 'bad-peer')
      expect(result.allowed).toBe(false)
      expect(result.reason).toContain('denylist')
    })

    it('should block non-allowlisted peers in allowlist mode', () => {
      accessControl.setAllowlistMode('workspace', true)
      accessControl.addToAllowlist('workspace', 'good-peer', {
        addedBy: 'user'
      })

      expect(accessControl.canAccess('workspace', 'good-peer').allowed).toBe(true)
      expect(accessControl.canAccess('workspace', 'other-peer').allowed).toBe(false)
    })

    it('should respect block expiry', () => {
      const pastDate = new Date(Date.now() - 1000)

      accessControl.addToDenylist('workspace', 'peer1', {
        reason: 'test',
        addedBy: 'user',
        auto: false,
        expiresAt: pastDate
      })

      // Should be allowed because block expired
      const result = accessControl.canAccess('workspace', 'peer1')
      expect(result.allowed).toBe(true)
    })
  })
})
```

## Checklist

- [ ] Define DenyEntry and AllowEntry interfaces
- [ ] Implement PeerAccessControl class
- [ ] Implement workspace-level denylist
- [ ] Implement workspace-level allowlist
- [ ] Implement global denylist
- [ ] Implement IP denylist
- [ ] Add expiry support
- [ ] Add import/export for persistence
- [ ] Write tests
- [ ] Tests pass

---

[Back to README](./README.md) | [Previous: Auto Blocking](./11-auto-blocking.md) | [Next: Telemetry Sync](./13-telemetry-sync.md)
