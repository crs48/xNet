/**
 * Webhook Event Emitter
 *
 * Sends webhook notifications when nodes change in the store.
 * Supports filtering by schema, event type, and includes HMAC signing.
 */

import type { NodeStoreAPI, NodeData, NodeChangeEventData } from './local-api'

// ─── Types ───────────────────────────────────────────────────────────────────

/**
 * Webhook configuration
 */
export interface WebhookConfig {
  /** Unique identifier for this webhook */
  id: string
  /** URL to send webhooks to */
  url: string
  /** Event types to send */
  events: ('created' | 'updated' | 'deleted')[]
  /** Filter by schema IRI (optional) */
  schema?: string
  /** HMAC secret for signing (optional) */
  secret?: string
  /** Maximum retry attempts (default: 3) */
  retries?: number
  /** Enabled flag */
  enabled?: boolean
}

/**
 * Webhook payload sent to subscribers
 */
export interface WebhookPayload {
  /** Event type */
  type: 'created' | 'updated' | 'deleted'
  /** Timestamp when event occurred */
  timestamp: number
  /** The affected node */
  node: NodeData | null
  /** Schema IRI of the node */
  schema?: string
}

/**
 * Delivery result
 */
export interface DeliveryResult {
  webhookId: string
  success: boolean
  statusCode?: number
  error?: string
  attempts: number
  deliveredAt?: number
}

/**
 * Disposable interface for cleanup
 */
export interface Disposable {
  dispose(): void
}

// ─── Webhook Emitter ─────────────────────────────────────────────────────────

/**
 * WebhookEmitter sends HTTP notifications when nodes change.
 *
 * @example
 * ```typescript
 * const emitter = new WebhookEmitter(store)
 *
 * // Register a webhook
 * const dispose = emitter.register({
 *   id: 'my-webhook',
 *   url: 'https://example.com/webhook',
 *   events: ['created', 'updated'],
 *   schema: 'xnet://xnet.dev/Task',
 *   secret: 'my-secret-key'
 * })
 *
 * // Later: dispose.dispose() to unregister
 * ```
 */
export class WebhookEmitter {
  private webhooks: Map<string, WebhookConfig> = new Map()
  private unsubscribe?: () => void
  private deliveryHistory: DeliveryResult[] = []
  private maxHistorySize = 100

  constructor(private store: NodeStoreAPI) {}

  /**
   * Start listening for store changes.
   * Must be called before webhooks will be sent.
   */
  start(): void {
    if (this.unsubscribe) return

    this.unsubscribe = this.store.subscribe((event) => {
      this.handleEvent(event)
    })
  }

  /**
   * Stop listening for store changes.
   */
  stop(): void {
    if (this.unsubscribe) {
      this.unsubscribe()
      this.unsubscribe = undefined
    }
  }

  /**
   * Register a webhook configuration.
   * Returns a disposable to unregister.
   */
  register(config: WebhookConfig): Disposable {
    this.webhooks.set(config.id, { ...config, enabled: config.enabled ?? true })
    return {
      dispose: () => {
        this.webhooks.delete(config.id)
      }
    }
  }

  /**
   * Unregister a webhook by ID.
   */
  unregister(id: string): boolean {
    return this.webhooks.delete(id)
  }

  /**
   * Get all registered webhooks.
   */
  getWebhooks(): WebhookConfig[] {
    return Array.from(this.webhooks.values())
  }

  /**
   * Get a webhook by ID.
   */
  getWebhook(id: string): WebhookConfig | undefined {
    return this.webhooks.get(id)
  }

  /**
   * Update a webhook configuration.
   */
  updateWebhook(id: string, updates: Partial<WebhookConfig>): boolean {
    const existing = this.webhooks.get(id)
    if (!existing) return false

    this.webhooks.set(id, { ...existing, ...updates, id })
    return true
  }

  /**
   * Get recent delivery history.
   */
  getDeliveryHistory(): DeliveryResult[] {
    return [...this.deliveryHistory]
  }

  /**
   * Clear delivery history.
   */
  clearDeliveryHistory(): void {
    this.deliveryHistory = []
  }

  // ─── Event Handling ──────────────────────────────────────────────────────────

  private handleEvent(event: NodeChangeEventData): void {
    const eventType = this.getEventType(event)
    if (!eventType) return

    const payload: WebhookPayload = {
      type: eventType,
      timestamp: Date.now(),
      node: event.node,
      schema: event.node?.schemaId
    }

    // Send to all matching webhooks
    for (const webhook of this.webhooks.values()) {
      if (!webhook.enabled) continue
      if (!webhook.events.includes(eventType)) continue
      if (webhook.schema && event.node?.schemaId !== webhook.schema) continue

      // Fire and forget - don't block the store
      this.send(webhook, payload).catch((err) => {
        console.error(`[WebhookEmitter] Failed to send to ${webhook.url}:`, err)
      })
    }
  }

  private getEventType(event: NodeChangeEventData): 'created' | 'updated' | 'deleted' | null {
    // Determine event type based on the change
    // This is simplified - in practice we'd inspect the change payload
    const changeType = event.change.type
    if (changeType === 'node-change') {
      // Check if it's a delete operation
      if (event.node?.deleted) return 'deleted'
      // Could be created or updated - for now default to updated
      return 'updated'
    }
    return null
  }

  // ─── Delivery ────────────────────────────────────────────────────────────────

  private async send(webhook: WebhookConfig, payload: WebhookPayload): Promise<void> {
    const maxRetries = webhook.retries ?? 3
    let lastError: Error | null = null

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const result = await this.deliverWebhook(webhook, payload)

        this.recordDelivery({
          webhookId: webhook.id,
          success: true,
          statusCode: result.status,
          attempts: attempt,
          deliveredAt: Date.now()
        })

        return
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err))

        // Exponential backoff
        if (attempt < maxRetries) {
          await this.delay(1000 * Math.pow(2, attempt - 1))
        }
      }
    }

    // All retries failed
    this.recordDelivery({
      webhookId: webhook.id,
      success: false,
      error: lastError?.message ?? 'Unknown error',
      attempts: maxRetries
    })
  }

  private async deliverWebhook(
    webhook: WebhookConfig,
    payload: WebhookPayload
  ): Promise<{ status: number }> {
    const body = JSON.stringify(payload)
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      'user-agent': 'xNet-Webhook/1.0'
    }

    // Add HMAC signature if secret is configured
    if (webhook.secret) {
      const signature = await this.sign(body, webhook.secret)
      headers['x-xnet-signature'] = signature
      headers['x-xnet-signature-256'] = `sha256=${signature}`
    }

    const response = await fetch(webhook.url, {
      method: 'POST',
      headers,
      body,
      signal: AbortSignal.timeout(10000) // 10 second timeout
    })

    if (!response.ok) {
      const text = await response.text().catch(() => '')
      throw new Error(`HTTP ${response.status}: ${text.slice(0, 200)}`)
    }

    return { status: response.status }
  }

  private async sign(body: string, secret: string): Promise<string> {
    const encoder = new TextEncoder()
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    )
    const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(body))
    return Array.from(new Uint8Array(signature))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
  }

  private recordDelivery(result: DeliveryResult): void {
    this.deliveryHistory.push(result)
    if (this.deliveryHistory.length > this.maxHistorySize) {
      this.deliveryHistory.shift()
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }
}

// ─── Factory Function ────────────────────────────────────────────────────────

/**
 * Create a webhook emitter.
 *
 * @example
 * ```typescript
 * const emitter = createWebhookEmitter(store)
 * emitter.start()
 *
 * emitter.register({
 *   id: 'n8n',
 *   url: 'http://localhost:5678/webhook/xnet',
 *   events: ['created', 'updated', 'deleted']
 * })
 * ```
 */
export function createWebhookEmitter(store: NodeStoreAPI): WebhookEmitter {
  return new WebhookEmitter(store)
}
