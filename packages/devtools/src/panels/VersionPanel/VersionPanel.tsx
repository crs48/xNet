/**
 * VersionPanel - Display protocol version, features, and compatibility info
 */

import { useState } from 'react'
import { CopyButton } from '../../components/CopyButton'
import {
  useVersionInfo,
  type FeatureDetail,
  type PeerVersionInfo,
  type SchemaVersionInfo
} from './useVersionInfo'

export function VersionPanel() {
  const { versionInfo, peers, schemas } = useVersionInfo()
  const [activeTab, setActiveTab] = useState<'features' | 'peers' | 'schemas'>('features')

  const getExportData = () => ({
    protocol: versionInfo,
    peers,
    schemas
  })

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-hairline shrink-0">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-ink-3">Protocol</span>
            <span className="text-sm font-bold text-ink-1">v{versionInfo.protocolVersion}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-ink-3">Features</span>
            <span className="text-xs text-ink-2">
              {versionInfo.enabledFeatures.length}/{versionInfo.allFeatures.length}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-ink-3">Peers</span>
            <span className="text-xs text-ink-2">{peers.length}</span>
          </div>
        </div>
        <CopyButton getData={getExportData} label="Export" />
      </div>

      {/* Tab bar */}
      <div className="flex border-b border-hairline shrink-0">
        <TabButton
          label="Features"
          count={versionInfo.enabledFeatures.length}
          active={activeTab === 'features'}
          onClick={() => setActiveTab('features')}
        />
        <TabButton
          label="Peers"
          count={peers.length}
          active={activeTab === 'peers'}
          onClick={() => setActiveTab('peers')}
        />
        <TabButton
          label="Schemas"
          count={schemas.length}
          active={activeTab === 'schemas'}
          onClick={() => setActiveTab('schemas')}
        />
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === 'features' && <FeaturesTab featureDetails={versionInfo.featureDetails} />}
        {activeTab === 'peers' && <PeersTab peers={peers} />}
        {activeTab === 'schemas' && <SchemasTab schemas={schemas} />}
      </div>
    </div>
  )
}

// ─── Sub-components ────────────────────────────────────────

function TabButton({
  label,
  count,
  active,
  onClick
}: {
  label: string
  count: number
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`
        px-3 py-1.5 text-xs font-medium border-b-2 transition-colors
        ${active ? 'border-accent-ink text-ink-1' : 'border-transparent text-ink-2 hover:text-ink-1'}
      `}
    >
      {label} ({count})
    </button>
  )
}

function FeaturesTab({ featureDetails }: { featureDetails: Map<string, FeatureDetail> }) {
  const features = Array.from(featureDetails.values())
  const enabledFeatures = features.filter((f) => f.enabled)
  const disabledFeatures = features.filter((f) => !f.enabled)

  return (
    <div className="p-3 space-y-4">
      {/* Enabled features */}
      <div>
        <h3 className="text-[10px] font-bold text-ink-2 uppercase mb-2">
          Enabled Features ({enabledFeatures.length})
        </h3>
        <div className="space-y-1">
          {enabledFeatures.map((feature) => (
            <FeatureRow key={feature.name} feature={feature} />
          ))}
        </div>
      </div>

      {/* Disabled/future features */}
      {disabledFeatures.length > 0 && (
        <div>
          <h3 className="text-[10px] font-bold text-ink-2 uppercase mb-2">
            Future Features ({disabledFeatures.length})
          </h3>
          <div className="space-y-1 opacity-50">
            {disabledFeatures.map((feature) => (
              <FeatureRow key={feature.name} feature={feature} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function FeatureRow({ feature }: { feature: FeatureDetail }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div
      className={`
        rounded bg-surface-2 text-[10px] cursor-pointer
        ${feature.enabled ? '' : 'opacity-60'}
      `}
      onClick={() => setExpanded(!expanded)}
    >
      <div className="flex items-center gap-2 px-2 py-1.5">
        {/* Status indicator */}
        <span
          className={`w-1.5 h-1.5 rounded-full ${feature.enabled ? 'bg-success' : 'bg-border-emphasis'}`}
        />

        {/* Name */}
        <span className="text-ink-1 font-medium font-mono">{feature.name}</span>

        {/* Required badge */}
        {feature.required && (
          <span className="text-[8px] px-1 py-0.5 rounded bg-destructive-muted text-destructive">
            required
          </span>
        )}

        {/* Since version */}
        <span className="text-ink-3 ml-auto">v{feature.since}</span>

        {/* Expand indicator */}
        <span className="text-ink-3">{expanded ? '-' : '+'}</span>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="px-2 pb-2 pt-1 border-t border-hairline space-y-1">
          <p className="text-ink-2">{feature.description}</p>
          {feature.dependencies.length > 0 && (
            <div className="flex items-center gap-1 text-ink-3">
              <span>Requires:</span>
              {feature.dependencies.map((dep) => (
                <span key={dep} className="font-mono text-ink-2">
                  {dep}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function PeersTab({ peers }: { peers: PeerVersionInfo[] }) {
  if (peers.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-ink-3 text-xs">
        <span>No connected peers</span>
        <span className="text-[10px] mt-1">Peer version info appears here when syncing</span>
      </div>
    )
  }

  return (
    <div className="p-3 space-y-2">
      {peers.map((peer) => (
        <PeerRow key={peer.id} peer={peer} />
      ))}
    </div>
  )
}

function PeerRow({ peer }: { peer: PeerVersionInfo }) {
  const hasWarnings = peer.warnings && peer.warnings.length > 0

  return (
    <div
      className={`
        rounded px-3 py-2 text-[10px]
        ${hasWarnings ? 'bg-warning-muted border border-warning' : 'bg-surface-2'}
      `}
    >
      <div className="flex items-center gap-2 mb-1">
        {/* Negotiation status */}
        <span
          className={`w-1.5 h-1.5 rounded-full ${peer.negotiated ? 'bg-success' : 'bg-warning'}`}
          title={peer.negotiated ? 'Negotiated' : 'Pending'}
        />

        {/* Peer name/id */}
        <span className="text-ink-1 font-medium">{peer.name || peer.id.slice(0, 12)}</span>

        {/* Protocol version */}
        {peer.protocolVersion !== undefined && (
          <span className="text-ink-3">v{peer.protocolVersion}</span>
        )}

        {/* Agreed version (if different) */}
        {peer.agreedVersion !== undefined && peer.agreedVersion !== peer.protocolVersion && (
          <span className="text-ink-1">agreed: v{peer.agreedVersion}</span>
        )}
      </div>

      {/* Common features */}
      {peer.commonFeatures && peer.commonFeatures.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1">
          {peer.commonFeatures.slice(0, 5).map((f) => (
            <span
              key={f}
              className="px-1 py-0.5 rounded bg-background-emphasis text-ink-2 text-[8px]"
            >
              {f}
            </span>
          ))}
          {peer.commonFeatures.length > 5 && (
            <span className="text-ink-3">+{peer.commonFeatures.length - 5} more</span>
          )}
        </div>
      )}

      {/* Warnings */}
      {hasWarnings && (
        <div className="mt-1 space-y-0.5">
          {peer.warnings!.map((warning, i) => (
            <div key={i} className="text-warning flex items-start gap-1">
              <span>!</span>
              <span>{warning}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function SchemasTab({ schemas }: { schemas: SchemaVersionInfo[] }) {
  if (schemas.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-ink-3 text-xs">
        <span>No schemas found</span>
        <span className="text-[10px] mt-1">Schema versions appear here when nodes are created</span>
      </div>
    )
  }

  return (
    <div className="p-3">
      <table className="w-full text-[10px]">
        <thead>
          <tr className="text-left text-ink-3">
            <th className="pb-2 font-medium">Schema</th>
            <th className="pb-2 font-medium">Version</th>
            <th className="pb-2 font-medium text-right">Nodes</th>
          </tr>
        </thead>
        <tbody>
          {schemas.map((schema) => (
            <tr key={schema.iri} className="border-t border-hairline">
              <td className="py-1.5">
                <div className="font-medium text-ink-1">{schema.name}</div>
                <div className="text-ink-3 font-mono truncate max-w-xs" title={schema.iri}>
                  {schema.iri}
                </div>
              </td>
              <td className="py-1.5">
                <span className="px-1.5 py-0.5 rounded bg-background-emphasis text-ink-2 font-mono">
                  {schema.version}
                </span>
              </td>
              <td className="py-1.5 text-right text-ink-2">{schema.nodeCount}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
