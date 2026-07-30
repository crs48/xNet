/**
 * Minimal E2E test harness for collaborative sync.
 *
 * Opens as a single page. Query params control behavior:
 *   ?user=1     -> User 1 identity (seed byte 1)
 *   ?user=2     -> User 2 identity (seed byte 2)
 *   ?doc=<id>   -> Shared document ID
 *   ?hub=<url>  -> Hub WebSocket URL (default: ws://localhost:4444)
 */

import { PageSchema, MemoryNodeStorageAdapter } from '@xnetjs/data'
import { XNetEditor } from '@xnetjs/editor/react'
import { identityFromPrivateKey } from '@xnetjs/identity'
import { XNetProvider, useNode } from '@xnetjs/react'
import React from 'react'
import ReactDOM from 'react-dom/client'

// ─── Parse query params ──────────────────────────────────────────────

const params = new URLSearchParams(window.location.search)
const userNum = parseInt(params.get('user') || '1', 10)
const docId = params.get('doc') || 'e2e-shared-doc'
const hubUrl = params.get('hub') || 'ws://localhost:4444'

// ─── Deterministic identity per user ─────────────────────────────────

const seed = new Uint8Array(32)
seed[0] = userNum // Different first byte = different Ed25519 key = different DID
const identity = identityFromPrivateKey(seed)
const authorDID = identity.did as `did:key:${string}`
const signingKey = seed

// ─── Storage (in-memory, no IndexedDB needed for E2E) ────────────────

const nodeStorage = new MemoryNodeStorageAdapter()

// ─── App ──────────────────────────────────────────────────────────────

// Cross-client convergence harness (exploration 0238, L2). Mirrors the Electron
// renderer's `window.__xnetSyncTestHarness` so `sync-matrix.spec.ts` can drive a
// web client through the same `Y.Text('e2e')` field that the Electron side edits,
// over the same hub. Offline is simulated at the Playwright layer
// (`context.setOffline()`), so only acquire/type/read are exposed here.
declare global {
  interface Window {
    __xnetSyncTestHarness?: {
      acquire: (docId: string) => Promise<void>
      type: (docId: string, text: string) => Promise<void>
      read: (docId: string) => Promise<string>
    }
  }
}

const SYNC_FIELD = 'e2e'

function DocEditor() {
  const { doc, loading, error, syncStatus, awareness } = useNode(PageSchema, docId, {
    createIfMissing: { title: `User ${userNum}'s doc` }
  })

  React.useEffect(() => {
    if (!doc) return
    window.__xnetSyncTestHarness = {
      acquire: async () => {},
      type: async (_docId, text) => {
        const yText = doc.getText(SYNC_FIELD)
        doc.transact(() => yText.insert(yText.length, text))
      },
      read: async () => doc.getText(SYNC_FIELD).toString()
    }
    return () => {
      window.__xnetSyncTestHarness = undefined
    }
  }, [doc])

  return (
    <div>
      <div data-testid="status" className={`status ${syncStatus}`}>
        User {userNum} | DID: {authorDID.slice(0, 20)}... | Sync:{' '}
        <span data-testid="sync-status">{syncStatus}</span>
      </div>

      {loading && <div data-testid="loading">Loading...</div>}
      {error && <div data-testid="error">Error: {error.message}</div>}

      {doc && (
        <div className="editor-container" data-testid="editor-container">
          <XNetEditor
            ydoc={doc}
            placeholder="Start writing..."
            awareness={awareness ?? undefined}
            did={authorDID}
          />
        </div>
      )}

      {!loading && !doc && !error && <div data-testid="no-doc">No document loaded</div>}
    </div>
  )
}

function App() {
  return (
    <XNetProvider
      config={{
        nodeStorage,
        authorDID,
        signingKey,
        hubUrl,
        platform: 'web'
      }}
    >
      <DocEditor />
    </XNetProvider>
  )
}

// ─── Mount ────────────────────────────────────────────────────────────

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
