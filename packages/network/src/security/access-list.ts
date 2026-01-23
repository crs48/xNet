/**
 * PeerAccessControl - workspace-level peer access lists.
 *
 * Priority order: global deny > workspace deny > allowlist mode > default allow.
 */

export interface DenyEntry {
  addedAt: number
  expiresAt?: number
  reason: string
  addedBy: string
  auto: boolean
}

export interface AllowEntry {
  addedAt: number
  label?: string
  addedBy: string
}

export interface WorkspaceAccessConfig {
  workspaceId: string
  /** Only allowlisted peers can sync when enabled */
  allowlistEnabled: boolean
  allowlist: Map<string, AllowEntry>
  denylist: Map<string, DenyEntry>
  ipDenylist: Map<string, DenyEntry>
}

export class PeerAccessControl {
  private configs = new Map<string, WorkspaceAccessConfig>()
  private globalDenylist = new Map<string, DenyEntry>()
  private globalIPDenylist = new Map<string, DenyEntry>()

  // ============ Configuration ============

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

  setAllowlistMode(workspaceId: string, enabled: boolean): void {
    this.getConfig(workspaceId).allowlistEnabled = enabled
  }

  // ============ Access Checks ============

  /** Check if a peer can access a workspace. */
  canAccess(
    workspaceId: string,
    peerId: string,
    ip?: string
  ): { allowed: boolean; reason?: string } {
    // Global deny takes priority
    const globalDeny = this.globalDenylist.get(peerId)
    if (globalDeny && (!globalDeny.expiresAt || globalDeny.expiresAt > Date.now())) {
      return { allowed: false, reason: `Global denylist: ${globalDeny.reason}` }
    }

    if (ip) {
      const globalIPDeny = this.globalIPDenylist.get(ip)
      if (globalIPDeny && (!globalIPDeny.expiresAt || globalIPDeny.expiresAt > Date.now())) {
        return { allowed: false, reason: `IP blocked: ${globalIPDeny.reason}` }
      }
    }

    const config = this.configs.get(workspaceId)
    if (!config) return { allowed: true }

    // Workspace deny
    const wsDeny = config.denylist.get(peerId)
    if (wsDeny && (!wsDeny.expiresAt || wsDeny.expiresAt > Date.now())) {
      return { allowed: false, reason: `Workspace denylist: ${wsDeny.reason}` }
    }

    if (ip) {
      const wsIPDeny = config.ipDenylist.get(ip)
      if (wsIPDeny && (!wsIPDeny.expiresAt || wsIPDeny.expiresAt > Date.now())) {
        return { allowed: false, reason: `Workspace IP blocked: ${wsIPDeny.reason}` }
      }
    }

    // Allowlist mode
    if (config.allowlistEnabled && !config.allowlist.has(peerId)) {
      return { allowed: false, reason: 'Not on allowlist' }
    }

    return { allowed: true }
  }

  // ============ Denylist Management ============

  addToGlobalDenylist(peerId: string, entry: Omit<DenyEntry, 'addedAt'>): void {
    this.globalDenylist.set(peerId, { ...entry, addedAt: Date.now() })
  }

  removeFromGlobalDenylist(peerId: string): void {
    this.globalDenylist.delete(peerId)
  }

  addToDenylist(workspaceId: string, peerId: string, entry: Omit<DenyEntry, 'addedAt'>): void {
    this.getConfig(workspaceId).denylist.set(peerId, { ...entry, addedAt: Date.now() })
  }

  removeFromDenylist(workspaceId: string, peerId: string): void {
    this.configs.get(workspaceId)?.denylist.delete(peerId)
  }

  addIPToDenylist(workspaceId: string | null, ip: string, entry: Omit<DenyEntry, 'addedAt'>): void {
    if (workspaceId) {
      this.getConfig(workspaceId).ipDenylist.set(ip, { ...entry, addedAt: Date.now() })
    } else {
      this.globalIPDenylist.set(ip, { ...entry, addedAt: Date.now() })
    }
  }

  // ============ Allowlist Management ============

  addToAllowlist(workspaceId: string, peerId: string, entry: Omit<AllowEntry, 'addedAt'>): void {
    this.getConfig(workspaceId).allowlist.set(peerId, { ...entry, addedAt: Date.now() })
  }

  removeFromAllowlist(workspaceId: string, peerId: string): void {
    this.configs.get(workspaceId)?.allowlist.delete(peerId)
  }

  // ============ Queries ============

  getDenylist(workspaceId: string): Array<{ peerId: string; entry: DenyEntry }> {
    const config = this.configs.get(workspaceId)
    if (!config) return []
    return Array.from(config.denylist.entries()).map(([peerId, entry]) => ({ peerId, entry }))
  }

  getAllowlist(workspaceId: string): Array<{ peerId: string; entry: AllowEntry }> {
    const config = this.configs.get(workspaceId)
    if (!config) return []
    return Array.from(config.allowlist.entries()).map(([peerId, entry]) => ({ peerId, entry }))
  }

  getGlobalDenylist(): Array<{ peerId: string; entry: DenyEntry }> {
    return Array.from(this.globalDenylist.entries()).map(([peerId, entry]) => ({ peerId, entry }))
  }

  // ============ Persistence ============

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

  importConfig(data: {
    workspaceId?: string
    allowlistEnabled?: boolean
    allowlist?: [string, AllowEntry][]
    denylist?: [string, DenyEntry][]
    ipDenylist?: [string, DenyEntry][]
  }): void {
    if (!data.workspaceId) return
    this.configs.set(data.workspaceId, {
      workspaceId: data.workspaceId,
      allowlistEnabled: data.allowlistEnabled ?? false,
      allowlist: new Map(data.allowlist ?? []),
      denylist: new Map(data.denylist ?? []),
      ipDenylist: new Map(data.ipDenylist ?? [])
    })
  }
}
