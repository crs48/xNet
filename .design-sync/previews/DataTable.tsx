import { DataTable, StatusDot, type Column } from '@xnetjs/ui'

type PeerRow = {
  peer: string
  region: string
  changes: string
  latency: string
}

const peerColumns: Column<PeerRow>[] = [
  { key: 'peer', label: 'Peer' },
  { key: 'region', label: 'Region' },
  { key: 'changes', label: 'Pending changes', align: 'right' },
  { key: 'latency', label: 'Latency', align: 'right' }
]

const peerRows: PeerRow[] = [
  { peer: 'hub-us-east', region: 'us-east-1', changes: '0', latency: '24ms' },
  { peer: 'hub-eu-west', region: 'eu-west-2', changes: '3', latency: '68ms' },
  { peer: 'laptop-chris', region: 'local', changes: '12', latency: '2ms' },
  { peer: 'phone-ios', region: 'cellular', changes: '1', latency: '142ms' },
  { peer: 'hub-ap-south', region: 'ap-south-1', changes: '0', latency: '210ms' }
]

type MetricRow = {
  metric: string
  value: string
  status: 'connected' | 'syncing' | 'error'
}

const metricColumns: Column<MetricRow>[] = [
  { key: 'metric', label: 'Metric' },
  { key: 'value', label: 'Value', align: 'right' },
  {
    key: 'status',
    label: 'Health',
    align: 'right',
    render: (value) => (
      <StatusDot status={value as MetricRow['status']} size="sm" />
    )
  }
]

const metricRows: MetricRow[] = [
  { metric: 'WebSocket transport', value: 'open', status: 'connected' },
  { metric: 'Change log replay', value: '1,284 changes', status: 'syncing' },
  { metric: 'SQLite persistence', value: '4.2 MB', status: 'connected' },
  { metric: 'Identity verify', value: 'Ed25519 ✓', status: 'connected' },
  { metric: 'OPFS cache', value: 'evicted', status: 'error' }
]

export const SyncPeers = () => (
  <div className="max-w-2xl rounded-lg border border-border bg-background p-3">
    <DataTable columns={peerColumns} data={peerRows} />
  </div>
)

export const HealthMetrics = () => (
  <div className="max-w-2xl rounded-lg border border-border bg-background p-3">
    <DataTable columns={metricColumns} data={metricRows} compact />
  </div>
)
