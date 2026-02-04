/**
 * @xnet/hub - Prometheus-compatible metrics.
 */

export class Metrics {
  private counters = new Map<string, number>()
  private gauges = new Map<string, number>()
  private histogramSums = new Map<string, number>()
  private histogramCounts = new Map<string, number>()

  increment(name: string, value = 1): void {
    this.counters.set(name, (this.counters.get(name) ?? 0) + value)
  }

  gauge(name: string, value: number): void {
    this.gauges.set(name, value)
  }

  observe(name: string, value: number): void {
    const sum = (this.histogramSums.get(name) ?? 0) + value
    const count = (this.histogramCounts.get(name) ?? 0) + 1
    this.histogramSums.set(name, sum)
    this.histogramCounts.set(name, count)
  }

  render(): string {
    const lines: string[] = []

    for (const [name, value] of this.counters) {
      lines.push(`# TYPE ${name} counter`)
      lines.push(`${name} ${value}`)
    }

    for (const [name, value] of this.gauges) {
      lines.push(`# TYPE ${name} gauge`)
      lines.push(`${name} ${value}`)
    }

    for (const [name, sum] of this.histogramSums) {
      const count = this.histogramCounts.get(name) ?? 0
      lines.push(`# TYPE ${name} summary`)
      lines.push(`${name}_sum ${sum}`)
      lines.push(`${name}_count ${count}`)
    }

    return lines.join('\n') + '\n'
  }
}

export const HUB_METRICS = {
  WS_CONNECTIONS_TOTAL: 'hub_ws_connections_total',
  WS_CONNECTIONS_ACTIVE: 'hub_ws_connections_active',

  WS_MESSAGES_RECEIVED: 'hub_ws_messages_received_total',
  WS_MESSAGES_SENT: 'hub_ws_messages_sent_total',
  WS_MESSAGES_REJECTED: 'hub_ws_messages_rejected_total',

  SYNC_DOCS_HOT: 'hub_sync_docs_hot',
  SYNC_DOCS_WARM: 'hub_sync_docs_warm',
  SYNC_PERSISTS_TOTAL: 'hub_sync_persists_total',

  BACKUP_UPLOADS_TOTAL: 'hub_backup_uploads_total',
  BACKUP_BYTES_STORED: 'hub_backup_bytes_stored',

  QUERY_REQUESTS_TOTAL: 'hub_query_requests_total',
  QUERY_DURATION_MS: 'hub_query_duration_ms',

  RATE_LIMIT_REJECTIONS: 'hub_rate_limit_rejections_total'
} as const
