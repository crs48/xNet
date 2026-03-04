/**
 * @xnetjs/hub - Federation peer health checker.
 */

import type { FederationConfig, FederationPeer } from './federation'

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

export class FederationHealthChecker {
  private interval: ReturnType<typeof setInterval> | null = null

  constructor(
    private config: FederationConfig,
    private checkIntervalMs = 60_000
  ) {}

  start(): void {
    if (this.interval) return
    this.interval = setInterval(() => {
      void this.checkAll()
    }, this.checkIntervalMs)
    void this.checkAll()
  }

  stop(): void {
    if (!this.interval) return
    clearInterval(this.interval)
    this.interval = null
  }

  private async checkAll(): Promise<void> {
    await Promise.allSettled(this.config.peers.map((peer) => this.checkPeer(peer)))
  }

  private async checkPeer(peer: FederationPeer): Promise<void> {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 5000)

    try {
      const response = await fetch(`${peer.url}/federation/status`, {
        signal: controller.signal
      })
      clearTimeout(timeout)
      if (!response.ok) {
        peer.healthy = false
        return
      }
      const status = (await response.json()) as { federation?: boolean }
      peer.healthy = status.federation === true
    } catch (error) {
      clearTimeout(timeout)
      if ((error as Error).name !== 'AbortError') {
        await sleep(50)
      }
      peer.healthy = false
    }
  }
}
