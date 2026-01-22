/**
 * TelemetryPanel - Stub for security events, peer scores, consent status
 *
 * Depends on planStep03_1 telemetry implementation.
 * Will display SecurityEvents, PerformanceMetrics, and CrashReports.
 */

export function TelemetryPanel() {
  return (
    <div className="flex items-center justify-center h-full">
      <div className="text-center">
        <div className="text-zinc-500 text-xs mb-1">Telemetry Panel</div>
        <div className="text-zinc-600 text-[10px]">
          Coming soon - requires planStep03_1 telemetry implementation.
          <br />
          Will show security events, peer scores, and consent status.
        </div>
      </div>
    </div>
  )
}
