/**
 * Lab runner Web Worker (exploration 0180).
 *
 * The browser hosts the SES runtime inside this terminable Worker, which adds
 * what SES alone lacks: CPU isolation. A hostile `while(true)` stalls this
 * thread, not the app, and the host can `terminate()` and respawn it. The
 * realm is locked down before any user code runs. Host tools are not bridged
 * across the postMessage boundary in v1 (use the in-process SES path for
 * host-tool Labs); this Worker is for pure, untrusted compute.
 *
 * Protocol:
 *   in:  { id, code, timeoutMs }
 *   out: LabRunResult & { id }
 */

import type { LabRunResult } from './types'
import { runSes } from './ses'
import { lockdownRealm } from './ses'

export interface LabWorkerRequest {
  id: number
  code: string
  timeoutMs?: number
}

export type LabWorkerResponse = LabRunResult & { id: number }

lockdownRealm()

self.addEventListener('message', (event: MessageEvent<LabWorkerRequest>) => {
  const { id, code, timeoutMs } = event.data
  void runSes({ code, language: 'javascript', timeoutMs }).then((result) => {
    self.postMessage({ ...result, id } satisfies LabWorkerResponse)
  })
})
