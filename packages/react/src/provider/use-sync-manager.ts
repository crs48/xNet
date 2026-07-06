/**
 * Sync + backup lifecycle for `XNetProvider` (0276).
 *
 * Owns the `SyncManager` (external IPC-provided or internally created), the
 * optional encrypted `AutoBackup` pipeline hanging off doc updates/evictions,
 * the bridge↔sync wiring, and the hub connection status stream.
 */

import type { SyncManagedBridge } from './runtime-resolution'
import type { NodeStorageAdapter, NodeStore } from '@xnetjs/data'
import type { DataBridge } from '@xnetjs/data-bridge'
import type { BlobStoreForSync, SyncManager, SyncStatus } from '@xnetjs/runtime'
import type { SyncReplicationConfig } from '@xnetjs/sync'
import type { MutableRefObject } from 'react'
import { createSyncManager } from '@xnetjs/runtime'
import { useEffect, useState } from 'react'
import { AutoBackup } from '../hub/auto-backup'
import { uploadBackup } from '../hub/backup'
import { log } from './debug'

export type SyncManagerLifecycleInput = {
  nodeStore: NodeStore | null
  nodeStoreReady: boolean
  nodeStorageRef: MutableRefObject<NodeStorageAdapter | null>
  externalSyncManager: SyncManager | undefined
  disableSyncManager: boolean | undefined
  signalingUrls: string[]
  authorDID: string | undefined
  signingKey: Uint8Array | undefined
  sync: SyncReplicationConfig | undefined
  blobStore: BlobStoreForSync | undefined
  hubUrl: string | null
  nodeSyncRoom: string
  autoAuth: boolean
  autoBackup: boolean
  backupDebounceMs: number
  encryptionKey: Uint8Array | null
  getHubAuthToken: () => Promise<string>
}

export function useSyncManagerLifecycle(input: SyncManagerLifecycleInput): SyncManager | null {
  const {
    nodeStore,
    nodeStoreReady,
    nodeStorageRef,
    externalSyncManager,
    disableSyncManager,
    signalingUrls,
    authorDID,
    signingKey,
    sync,
    blobStore,
    hubUrl,
    nodeSyncRoom,
    autoAuth,
    autoBackup,
    backupDebounceMs,
    encryptionKey,
    getHubAuthToken
  } = input

  const [syncManager, setSyncManager] = useState<SyncManager | null>(null)

  useEffect(() => {
    // If an external SyncManager is provided (e.g., IPC-based for Electron), use it directly
    if (externalSyncManager) {
      // Set the syncManager immediately so components can subscribe to status updates
      setSyncManager(externalSyncManager)

      // If the external SyncManager supports setIdentity (e.g., IPCSyncManager for Electron),
      // set the identity before starting so updates can be signed
      const sm = externalSyncManager as SyncManager & {
        setIdentity?: (authorDID: string, signingKey: Uint8Array) => void
        configureReplication?: (config: SyncReplicationConfig | undefined) => void
      }
      if (sm.setIdentity && authorDID && signingKey) {
        sm.setIdentity(authorDID, signingKey)
      }
      if (sm.configureReplication) {
        sm.configureReplication(sync)
      }

      externalSyncManager.start().catch((err) => {
        console.warn('[XNetProvider] External SyncManager failed to start:', err)
        // SyncManager is still usable for local-only operation
      })

      return () => {
        externalSyncManager.stop().catch((err) => {
          console.warn('[XNetProvider] External SyncManager failed to stop:', err)
        })
        setSyncManager(null)
      }
    }

    if (!nodeStore || !nodeStoreReady || disableSyncManager) {
      log('SyncManager disabled or NodeStore not ready', {
        nodeStore: !!nodeStore,
        nodeStoreReady,
        disableSyncManager
      })
      setSyncManager(null)
      return
    }

    const storage = nodeStorageRef.current
    if (!storage) {
      log('No storage adapter available')
      return
    }

    // No hub and no signaling servers → empty URL. The connection manager treats
    // that as "stay offline" (no socket, no browser connection error) instead of
    // dialing a hardcoded localhost hub that nothing is serving (exploration
    // 0188). A real hub is opted into via hubUrl / signalingServers.
    const signalingUrl = signalingUrls[0] ?? ''

    if (autoAuth && hubUrl && (!authorDID || !signingKey)) {
      console.warn('[XNetProvider] Hub auth enabled but authorDID/signingKey missing')
    }

    if (autoBackup && (!hubUrl || !encryptionKey)) {
      console.warn('[XNetProvider] Auto-backup requires hubUrl and encryptionKey')
    }

    console.log('[XNetProvider] Creating SyncManager with signalingUrls:', signalingUrls)
    log('Creating SyncManager with signalingUrls:', signalingUrls)
    let autoBackupManager: AutoBackup | null = null
    const enableAutoBackup = Boolean(autoBackup && hubUrl && encryptionKey)

    const sm = createSyncManager({
      nodeStore,
      storage,
      signalingUrl,
      signalingUrls,
      authorDID,
      signingKey,
      replication: sync,
      blobStore,
      nodeSyncRoom: hubUrl ? nodeSyncRoom : undefined,
      getUCANToken: hubUrl ? getHubAuthToken : undefined,
      onDocUpdate: enableAutoBackup
        ? (nodeId, doc) => {
            autoBackupManager?.handleDocUpdate(nodeId, doc)
          }
        : undefined,
      onDocEvict: enableAutoBackup
        ? (nodeId, doc) => {
            autoBackupManager?.handleDocEvict(nodeId, doc)
          }
        : undefined
    })

    if (enableAutoBackup && hubUrl && encryptionKey) {
      autoBackupManager = new AutoBackup(
        async (docId, plaintext) => {
          await uploadBackup(
            {
              hubUrl,
              encryptionKey,
              getAuthToken: autoAuth ? getHubAuthToken : undefined
            },
            docId,
            plaintext
          )
        },
        {
          debounceMs: backupDebounceMs,
          isEnabled: () => sm.connection?.status === 'connected'
        }
      )
    }

    // Set SyncManager immediately so hooks can use it
    // (it will connect in the background)
    setSyncManager(sm)
    console.log('[XNetProvider] SyncManager created and set in context')
    log('SyncManager created, starting...')

    sm.start()
      .then(() => {
        log('SyncManager started successfully')
      })
      .catch((err) => {
        console.warn('[XNetProvider] SyncManager failed to start:', err)
        log('SyncManager start failed:', err)
      })

    return () => {
      sm.stop().catch((err) => {
        console.warn('[XNetProvider] SyncManager failed to stop:', err)
      })
      autoBackupManager?.destroy()
      setSyncManager(null)
    }
  }, [
    nodeStore,
    nodeStoreReady,
    disableSyncManager,
    externalSyncManager,
    signalingUrls,
    blobStore,
    sync,
    authorDID,
    autoAuth,
    autoBackup,
    backupDebounceMs,
    encryptionKey,
    getHubAuthToken,
    hubUrl,
    nodeSyncRoom,
    nodeStorageRef,
    signingKey
  ])

  return syncManager
}

/**
 * Connect SyncManager to DataBridge for Y.Doc acquisition.
 * This allows useNode to use bridge.acquireDoc() instead of direct SyncManager access.
 */
export function useBridgeSyncWiring(dataBridge: DataBridge | null, syncManager: SyncManager | null): void {
  useEffect(() => {
    if (!dataBridge || !syncManager) return

    const bridge = dataBridge as SyncManagedBridge

    if (typeof bridge.setSyncManager === 'function') {
      bridge.setSyncManager(syncManager)
      log('Connected SyncManager to DataBridge')
    }

    return () => {
      if (typeof bridge.setSyncManager === 'function') {
        bridge.setSyncManager(null)
      }
    }
  }, [dataBridge, syncManager])
}

/** Track hub connection status from SyncManager. */
export function useHubStatus(syncManager: SyncManager | null): SyncStatus {
  const [hubStatus, setHubStatus] = useState<SyncStatus>('disconnected')

  useEffect(() => {
    if (!syncManager) {
      setHubStatus('disconnected')
      return
    }

    setHubStatus(syncManager.status)
    return syncManager.on('status', (status) => {
      setHubStatus(status)
    })
  }, [syncManager])

  return hubStatus
}
