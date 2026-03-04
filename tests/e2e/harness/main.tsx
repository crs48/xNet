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
import { RichTextEditor } from '@xnetjs/editor/react'
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

function DocEditor() {
  const { doc, loading, error, syncStatus, awareness } = useNode(PageSchema, docId, {
    createIfMissing: { title: `User ${userNum}'s doc` }
  })

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
          <RichTextEditor
            ydoc={doc}
            field="content"
            placeholder="Start writing..."
            showToolbar={false}
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
