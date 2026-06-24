import { LogEntry } from '@xnetjs/ui'

const base = new Date('2026-06-23T14:08:00Z').getTime()

export const SyncStream = () => (
  <div className="max-w-2xl overflow-hidden rounded-lg border border-border bg-background">
    <LogEntry
      timestamp={base}
      direction="out"
      message="change:document/9f2a appended"
      detail="6ms"
    />
    <LogEntry
      timestamp={base + 1_200}
      direction="in"
      message="hub ack lamport=1284"
      detail="24ms"
    />
    <LogEntry
      timestamp={base + 2_400}
      direction="success"
      message="store applied — LWW merge clean"
      detail="3ms"
    />
    <LogEntry
      timestamp={base + 3_900}
      direction="info"
      message="presence: laptop-chris joined channel #design"
    />
    <LogEntry
      timestamp={base + 5_100}
      direction="out"
      message="change:channel/c41e topic updated"
      detail="5ms"
    />
    <LogEntry
      timestamp={base + 6_700}
      direction="error"
      message="verify failed — signature mismatch from phone-ios"
      detail="rejected"
    />
  </div>
)
