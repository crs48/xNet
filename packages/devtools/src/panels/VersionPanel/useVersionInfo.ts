/**
 * Hook for gathering version and capability information
 */

import { schemaRegistry } from '@xnet/data'
import { CURRENT_PROTOCOL_VERSION } from '@xnet/sync'
import {
  type FeatureFlag,
  FEATURES,
  ALL_FEATURES,
  getEnabledFeatures,
  getRequiredFeatures
} from '@xnet/sync'
import { useState, useEffect } from 'react'
import { useDevTools } from '../../provider/useDevTools'

export interface VersionInfo {
  /** Current protocol version */
  protocolVersion: number
  /** Package version (from build) */
  packageVersion: string
  /** All available features */
  allFeatures: FeatureFlag[]
  /** Features enabled at current protocol version */
  enabledFeatures: FeatureFlag[]
  /** Required (non-optional) features */
  requiredFeatures: FeatureFlag[]
  /** Feature details */
  featureDetails: Map<FeatureFlag, FeatureDetail>
}

export interface FeatureDetail {
  name: FeatureFlag
  since: number
  required: boolean
  description: string
  enabled: boolean
  dependencies: FeatureFlag[]
}

export interface PeerVersionInfo {
  id: string
  name?: string
  protocolVersion?: number
  features?: string[]
  negotiated: boolean
  agreedVersion?: number
  commonFeatures?: string[]
  warnings?: string[]
}

export interface SchemaVersionInfo {
  iri: string
  name: string
  version: string
  nodeCount: number
}

export function useVersionInfo() {
  const { store } = useDevTools()

  const [versionInfo] = useState<VersionInfo>(() => {
    const enabledFeatures = getEnabledFeatures(CURRENT_PROTOCOL_VERSION)
    const requiredFeatures = getRequiredFeatures(CURRENT_PROTOCOL_VERSION)

    const featureDetails = new Map<FeatureFlag, FeatureDetail>()
    for (const name of ALL_FEATURES) {
      const config = FEATURES[name]
      featureDetails.set(name, {
        name,
        since: config.since,
        required: config.required,
        description: config.description,
        enabled: enabledFeatures.includes(name),
        dependencies: config.requires ?? []
      })
    }

    return {
      protocolVersion: CURRENT_PROTOCOL_VERSION,
      packageVersion: '0.0.0', // TODO: Get from build
      allFeatures: ALL_FEATURES,
      enabledFeatures,
      requiredFeatures,
      featureDetails
    }
  })

  const [peers] = useState<PeerVersionInfo[]>([])
  const [schemas, setSchemas] = useState<SchemaVersionInfo[]>([])

  // Gather schema versions from store
  useEffect(() => {
    if (!store) return

    const updateSchemas = async () => {
      try {
        // Get all nodes to count by schema
        const nodes = await store.list()
        const nodeCounts = new Map<string, number>()
        for (const node of nodes) {
          nodeCounts.set(node.schemaId, (nodeCounts.get(node.schemaId) || 0) + 1)
        }

        // Get all schema IRIs from registry
        const allIris = new Set([...nodeCounts.keys(), ...schemaRegistry.getAllIRIs()])
        const schemaInfos: SchemaVersionInfo[] = []

        for (const iri of allIris) {
          // Parse version from IRI (format: xnet://namespace/Name@version)
          const atIndex = iri.lastIndexOf('@')
          const version = atIndex !== -1 ? iri.slice(atIndex + 1) : '1.0.0'
          const baseName = atIndex !== -1 ? iri.slice(0, atIndex) : iri

          // Get name from registry if available
          let name = baseName.split('/').pop() || iri
          try {
            const schema = await schemaRegistry.get(iri as any)
            if (schema?.schema.name) {
              name = schema.schema.name
            }
          } catch {
            // Schema not in registry, use parsed name
          }

          schemaInfos.push({
            iri,
            name,
            version,
            nodeCount: nodeCounts.get(iri) || 0
          })
        }

        setSchemas(schemaInfos.sort((a, b) => a.name.localeCompare(b.name)))
      } catch (err) {
        console.error('[VersionPanel] Failed to gather schema info:', err)
      }
    }

    updateSchemas()
  }, [store])

  return {
    versionInfo,
    peers,
    schemas
  }
}
