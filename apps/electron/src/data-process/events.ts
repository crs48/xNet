/**
 * Data process event relay helpers.
 */

export function sendEvent(eventType: string, data: unknown): void {
  const payload = typeof data === 'object' && data !== null ? data : { value: data }
  process.parentPort?.postMessage({ type: 'event', eventType, ...(payload as object) })
}
