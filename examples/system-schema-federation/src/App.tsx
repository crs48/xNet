import type { DID } from '@xnetjs/core'
import type { NodeStore, SchemaIRI, SchemaRegistry } from '@xnetjs/data'
import {
  XNetProvider,
  describeGrantConsent,
  useAuthTrace,
  useGrants,
  useSyncManager
} from '@xnetjs/react'
import { createSchemaDiscovery } from '@xnetjs/sdk'
import { useEffect, useState } from 'react'

type SystemSchemaFederationAppProps = {
  authorDID: DID
  signingKey: Uint8Array
  store: NodeStore
  registry: SchemaRegistry
}

function SchemaFederationPanel({
  store,
  registry
}: {
  store: NodeStore
  registry: SchemaRegistry
}) {
  const [schemaNodeId, setSchemaNodeId] = useState<string | null>(null)
  const syncManager = useSyncManager()
  const grants = useGrants(schemaNodeId ?? '')
  const trace = useAuthTrace({
    nodeId: schemaNodeId ?? '',
    action: 'share',
    enabled: schemaNodeId !== null
  })

  useEffect(() => {
    let cancelled = false

    const load = async (): Promise<void> => {
      const discovery = await createSchemaDiscovery({ store, registry })
      const schemaIri = 'xnet://example.app/Task@1.0.0' as SchemaIRI
      const baseIri = 'xnet://example.app/Task' as SchemaIRI
      await discovery.resolveSchema(schemaIri)
      const definition = discovery
        .listSchemas()
        .find(
          (record) =>
            record.schemaIri === schemaIri ||
            (record.baseIri === baseIri && record.version === '1.0.0')
        )

      if (!cancelled) {
        setSchemaNodeId(definition?.nodeId ?? null)
      }
    }

    void load()

    return () => {
      cancelled = true
    }
  }, [registry, store])

  const shareSchema = async (): Promise<void> => {
    if (!schemaNodeId) return

    const input = {
      to: 'did:key:z6MkPeer' as DID,
      actions: ['read' as const],
      resource: schemaNodeId,
      expiresIn: '7d'
    }
    const consent = describeGrantConsent(input, schemaNodeId)

    console.info('Schema grant consent', {
      what: consent.what,
      where: consent.where,
      howLong: consent.howLong
    })

    await grants.grant(input)
  }

  const repairPartition = async (): Promise<void> => {
    const report = await syncManager?.reconcile({ reason: 'partition-repair' })
    console.info('Federation repair report', report)
  }

  return (
    <main>
      <button type="button" disabled={!schemaNodeId} onClick={() => void shareSchema()}>
        Share schema
      </button>
      <button type="button" onClick={() => void repairPartition()}>
        Repair federation
      </button>
      <pre>{JSON.stringify(trace.summary, null, 2)}</pre>
    </main>
  )
}

export function SystemSchemaFederationApp({
  authorDID,
  signingKey,
  store,
  registry
}: SystemSchemaFederationAppProps) {
  return (
    <XNetProvider
      config={{
        authorDID,
        signingKey,
        signalingServers: ['ws://localhost:4444', 'wss://hub.example.net'],
        sync: {
          federation: {
            hubs: [
              { id: 'local', url: 'ws://localhost:4444' },
              { id: 'public', url: 'wss://hub.example.net', kinds: ['system'] }
            ],
            defaultSystemHubIds: ['local', 'public'],
            defaultUserHubIds: ['local']
          }
        }
      }}
    >
      <SchemaFederationPanel store={store} registry={registry} />
    </XNetProvider>
  )
}
