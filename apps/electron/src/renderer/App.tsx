/**
 * Main App component
 */
import React, { useEffect, useState, useCallback } from 'react'

interface Document {
  id: string
  title: string
}

export function App() {
  const [identity, setIdentity] = useState<string | null>(null)
  const [documents, setDocuments] = useState<Document[]>([])
  const [selectedDoc, setSelectedDoc] = useState<string | null>(null)
  const [docContent, setDocContent] = useState<string>('')
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Initialize xNet client
  useEffect(() => {
    async function init() {
      try {
        const { did } = await window.xnet.init()
        setIdentity(did)
        await refreshDocuments()
        setIsLoading(false)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to initialize')
        setIsLoading(false)
      }
    }
    init()

    return () => {
      window.xnet.stop()
    }
  }, [])

  // Listen for new page menu command
  useEffect(() => {
    return window.xnet.onNewPage(() => {
      createDoc()
    })
  }, [])

  const refreshDocuments = async () => {
    const docIds = await window.xnet.listDocuments()
    const docs: Document[] = []
    for (const id of docIds) {
      const doc = await window.xnet.getDocument(id)
      if (doc) {
        docs.push({ id: doc.id, title: doc.title })
      }
    }
    setDocuments(docs)
  }

  const createDoc = useCallback(async () => {
    try {
      const doc = await window.xnet.createDocument({
        workspace: 'default',
        type: 'page',
        title: 'Untitled'
      })
      await refreshDocuments()
      setSelectedDoc(doc.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create document')
    }
  }, [])

  const selectDoc = async (id: string) => {
    setSelectedDoc(id)
    const doc = await window.xnet.getDocument(id)
    if (doc) {
      setDocContent(doc.content)
    }
  }

  const deleteDoc = async (id: string) => {
    await window.xnet.deleteDocument(id)
    await refreshDocuments()
    if (selectedDoc === id) {
      setSelectedDoc(null)
      setDocContent('')
    }
  }

  if (isLoading) {
    return (
      <div style={styles.loading}>
        <p>Loading xNotes...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div style={styles.error}>
        <p>Error: {error}</p>
        <button onClick={() => window.location.reload()}>Retry</button>
      </div>
    )
  }

  return (
    <div style={styles.app}>
      <header style={styles.titlebar}>
        <div style={styles.titlebarDrag} />
        <h1 style={styles.title}>xNotes</h1>
        <span style={styles.identity}>
          {identity ? `${identity.slice(0, 20)}...` : ''}
        </span>
      </header>
      <main style={styles.main}>
        <aside style={styles.sidebar}>
          <button style={styles.newButton} onClick={createDoc}>
            + New Page
          </button>
          <ul style={styles.docList}>
            {documents.map(doc => (
              <li
                key={doc.id}
                style={{
                  ...styles.docItem,
                  ...(selectedDoc === doc.id ? styles.docItemSelected : {})
                }}
                onClick={() => selectDoc(doc.id)}
              >
                <span style={styles.docTitle}>{doc.title}</span>
                <button
                  style={styles.deleteButton}
                  onClick={(e) => {
                    e.stopPropagation()
                    deleteDoc(doc.id)
                  }}
                >
                  x
                </button>
              </li>
            ))}
          </ul>
          {documents.length === 0 && (
            <p style={styles.emptyMessage}>No documents yet</p>
          )}
        </aside>
        <section style={styles.content}>
          {selectedDoc ? (
            <div style={styles.editor}>
              <textarea
                style={styles.textarea}
                value={docContent}
                onChange={(e) => setDocContent(e.target.value)}
                placeholder="Start typing..."
              />
            </div>
          ) : (
            <div style={styles.placeholder}>
              <p>Select a document or create a new one</p>
            </div>
          )}
        </section>
      </main>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  app: {
    display: 'flex',
    flexDirection: 'column',
    height: '100vh',
    background: 'var(--bg-primary)'
  },
  titlebar: {
    height: 'var(--titlebar-height)',
    background: 'var(--bg-secondary)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 80px 0 16px',
    borderBottom: '1px solid var(--border)',
    position: 'relative'
  },
  titlebarDrag: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    WebkitAppRegion: 'drag'
  } as React.CSSProperties,
  title: {
    fontSize: '14px',
    fontWeight: 600,
    zIndex: 1
  },
  identity: {
    fontSize: '12px',
    color: 'var(--text-secondary)',
    zIndex: 1
  },
  main: {
    flex: 1,
    display: 'flex',
    overflow: 'hidden'
  },
  sidebar: {
    width: '250px',
    background: 'var(--bg-secondary)',
    borderRight: '1px solid var(--border)',
    display: 'flex',
    flexDirection: 'column',
    padding: '16px'
  },
  newButton: {
    background: 'var(--accent)',
    color: 'white',
    border: 'none',
    padding: '8px 16px',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '14px',
    marginBottom: '16px'
  },
  docList: {
    listStyle: 'none',
    flex: 1,
    overflow: 'auto'
  },
  docItem: {
    padding: '8px 12px',
    borderRadius: '6px',
    cursor: 'pointer',
    marginBottom: '4px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  docItemSelected: {
    background: 'var(--bg-tertiary)'
  },
  docTitle: {
    fontSize: '14px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap'
  },
  deleteButton: {
    background: 'transparent',
    border: 'none',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
    padding: '4px 8px',
    borderRadius: '4px',
    opacity: 0.5
  },
  emptyMessage: {
    color: 'var(--text-secondary)',
    fontSize: '14px',
    textAlign: 'center',
    marginTop: '20px'
  },
  content: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column'
  },
  editor: {
    flex: 1,
    padding: '24px'
  },
  textarea: {
    width: '100%',
    height: '100%',
    background: 'transparent',
    border: 'none',
    color: 'var(--text-primary)',
    fontSize: '16px',
    lineHeight: 1.6,
    resize: 'none',
    outline: 'none',
    fontFamily: 'inherit'
  },
  placeholder: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'var(--text-secondary)'
  },
  loading: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100vh',
    color: 'var(--text-secondary)'
  },
  error: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100vh',
    color: '#ff6b6b',
    gap: '16px'
  }
}
